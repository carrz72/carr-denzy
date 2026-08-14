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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Named, deliberately, rather than letting supabase-js throw its own
  // "supabaseUrl is required" from inside a minified chunk. That message
  // arrives with a stack pointing at whichever bundle happened to contain the
  // call, names no variable, and during a build reads as a code fault rather
  // than a missing setting.
  //
  // Failing the build here is correct and intended. These two are read at
  // BUILD time for the prerendered marketing pages, and a site deployed
  // without them cannot show the portfolio or accept an enquiry — a broken
  // deploy that succeeds is worse than one that stops.
  if (!url || !anonKey) {
    const missing = [
      url ? null : "NEXT_PUBLIC_SUPABASE_URL",
      anonKey ? null : "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]
      .filter(Boolean)
      .join(" and ");

    const verb = missing.includes(" and ") ? "are" : "is";

    throw new Error(
      `${missing} ${verb} not set. Locally, copy .env.example to .env.local and fill it in. On Vercel, add it under Settings → Environment Variables for the environment being built, then redeploy — NEXT_PUBLIC_ values are baked in at build time, so adding one without a redeploy changes nothing.`,
    );
  }

  return createSupabaseClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
