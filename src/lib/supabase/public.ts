import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * An anonymous, session-free Supabase client for public marketing content.
 *
 * Why this exists rather than reusing `createClient()` from ./server:
 *
 * That client reads cookies, and in Next.js reading cookies opts the route out
 * of static rendering entirely. Calling it from a marketing page silently turns
 * a page that should be pre-rendered and revalidated on a timer into one that
 * is server-rendered on every request — measurable in the build output as `ƒ`
 * where it should read `○`.
 *
 * Nothing here needs a session. The portfolio's read policy is granted to
 * `anon`, so this client sees exactly what a stranger on the website sees,
 * which is also a useful property: if a query through this client returns a row,
 * that row is genuinely public.
 *
 * Use it ONLY for content that is public by definition. Anything scoped to a
 * user must go through ./server so RLS can see who is asking.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
