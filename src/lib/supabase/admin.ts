import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role Supabase client. BYPASSES Row Level Security completely.
 *
 * Only four things are allowed to use it:
 *   1. Promoting the configured owner email to the `owner` role on first
 *      sign-in — a client can never do this for itself (spec FR-18).
 *   2. Writing enquiry rows on behalf of anonymous visitors after the server
 *      action has rate-limited and validated them.
 *   3. Reading business settings for emails sent outside any user session.
 *   4. Serving the public, no-login invoice view (`/invoices/view/[id]`) —
 *      guarded by the invoice's own unguessable id instead of a session, for
 *      the accounts-payable clerk who was emailed the link but was never
 *      given a portal account.
 *
 * The `server-only` import above makes bundling this into client code a build
 * error rather than a leak discovered later.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  // Both are checked, and both are named. Only the key used to be, so a
  // deployment missing the URL as well reported the key — you fixed the key,
  // redeployed, and hit the same wall from a different direction.
  if (!key || !url) {
    const missing = [
      key ? null : "SUPABASE_SERVICE_ROLE_KEY",
      url ? null : "NEXT_PUBLIC_SUPABASE_URL",
    ]
      .filter(Boolean)
      .join(" and ");

    const verb = missing.includes(" and ") ? "are" : "is";

    throw new Error(
      `${missing} ${verb} not set. Locally, copy .env.example to .env.local and fill it in. On Vercel, add it under Settings → Environment Variables for the environment being built, then redeploy.`,
    );
  }

  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
