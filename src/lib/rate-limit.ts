import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limiting, backed by Postgres.
 *
 * An in-memory Map would be simpler, but on Vercel each request can land on a
 * different serverless instance, so the counter resets constantly and the
 * limit is decorative. The shared table in
 * `supabase/migrations/20260810094000_rate_limit.sql` actually holds.
 */

/**
 * The caller's IP, hashed with a salt before it is ever stored.
 *
 * An IP address is personal data. Storing the hash still lets us count
 * requests from one source and correlate abuse, without keeping a log of who
 * visited the site.
 */
export async function getSubjectHash(): Promise<string> {
  const headerList = await headers();

  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip")?.trim() ||
    "unknown";

  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "carr-denzy";

  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export interface RateLimitResult {
  allowed: boolean;
  subject: string;
}

/**
 * Returns `allowed: false` once the caller has exceeded `maxHits` within
 * `windowMinutes`.
 *
 * Fails OPEN: if the database check itself errors, a genuine customer with a
 * burst pipe still gets through. The cost of a missed limit is some spam in an
 * inbox; the cost of a false positive is a lost emergency job.
 */
export async function checkRateLimit(
  bucket: string,
  maxHits: number,
  windowMinutes: number,
): Promise<RateLimitResult> {
  const subject = await getSubjectHash();

  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("check_rate_limit" as never, {
      p_bucket: bucket,
      p_subject: subject,
      p_max_hits: maxHits,
      p_window_minutes: windowMinutes,
    } as never);

    if (error) {
      console.error("[rate-limit] check failed, allowing request", error.message);
      return { allowed: true, subject };
    }

    return { allowed: Boolean(data), subject };
  } catch (error) {
    console.error("[rate-limit] unavailable, allowing request", error);
    return { allowed: true, subject };
  }
}
