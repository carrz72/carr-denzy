-- ===========================================================================
-- Rate limiting (spec NFR-20)
--
-- Deliberately in Postgres rather than in process memory. On Vercel each
-- request may land on a different serverless instance, so an in-memory counter
-- resets constantly and gives only the appearance of a limit. A shared table
-- is the honest implementation.
-- ===========================================================================

create table rate_limit_hits (
  id          bigserial primary key,
  bucket      text not null,   -- e.g. 'enquiry'
  subject     text not null,   -- a salted hash of the IP, never the raw address
  created_at  timestamptz not null default now()
);

create index rate_limit_lookup_idx on rate_limit_hits (bucket, subject, created_at desc);

alter table rate_limit_hits enable row level security;
-- No policies at all: reachable only via the SECURITY DEFINER function below
-- and the service role. `anon` and `authenticated` get nothing.

/**
 * Records a hit and reports whether the caller is now over the limit.
 *
 * Returns true when the request should be ALLOWED.
 * Old rows are swept opportunistically so the table cannot grow without bound.
 */
create or replace function check_rate_limit(
  p_bucket        text,
  p_subject       text,
  p_max_hits      integer,
  p_window_minutes integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from rate_limit_hits
   where created_at < now() - interval '24 hours';

  select count(*) into v_count
    from rate_limit_hits
   where bucket = p_bucket
     and subject = p_subject
     and created_at > now() - make_interval(mins => p_window_minutes);

  if v_count >= p_max_hits then
    return false;
  end if;

  insert into rate_limit_hits (bucket, subject) values (p_bucket, p_subject);

  return true;
end;
$$;

revoke all on function check_rate_limit(text, text, integer, integer) from public;
grant execute on function check_rate_limit(text, text, integer, integer) to anon, authenticated;
