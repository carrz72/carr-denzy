import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPortalInvite } from "@/lib/email";
import type { ClientMemberRole } from "@/types/database";

/**
 * Adding somebody to a customer account.
 *
 * Shared by the owner's customer page and the customer's own portal, because
 * the rules must not differ between them — a viewer promoting themselves to
 * manager through the portal would be a hole that only exists if the two paths
 * are written twice.
 *
 * Authorisation is NOT done here. The insert goes through the caller's own
 * session, so the `managers add members` policy decides, and a viewer's attempt
 * fails at the database. This function's job is the part RLS cannot do: mint a
 * sign-in link and send it.
 */
export interface AddMemberResult {
  ok: boolean;
  error?: string;
  /** True when the invitation email did not go out but the access was granted. */
  emailFailed?: boolean;
}

export async function addMember({
  clientId,
  email,
  role,
  invitedBy,
  clientName,
}: {
  clientId: string;
  email: string;
  role: ClientMemberRole;
  invitedBy: string;
  clientName: string;
}): Promise<AddMemberResult> {
  const supabase = await createClient();

  // Upsert on (client_id, email): re-inviting somebody changes their role
  // rather than failing on the unique index or stacking a duplicate.
  const { error } = await supabase
    .from("client_members")
    .upsert(
      { client_id: clientId, email, role, invited_by: invitedBy },
      { onConflict: "client_id,email" },
    );

  if (error) {
    console.error("[members] insert failed", error.message);

    // The policy refusing is the expected failure for a viewer, and it should
    // read as a permission problem rather than a broken app.
    if (error.code === "42501") {
      return { ok: false, error: "Only a manager on this account can add people to it." };
    }

    return { ok: false, error: "Could not add them. Try again." };
  }

  const sent = await sendMemberInvite(email, clientName);

  return sent ? { ok: true } : { ok: true, emailFailed: true };
}

/**
 * Sends the sign-in link.
 *
 * Uses the same token-hash route as `inviteClientToPortal` — never Supabase's
 * `action_link`, which answers with tokens in a URL fragment the server cannot
 * read (see src/app/auth/callback/route.ts).
 */
async function sendMemberInvite(email: string, clientName: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

    let generated = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });

    if (generated.error && /not found/i.test(generated.error.message)) {
      generated = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: `${siteUrl}/auth/callback` },
      });
    }

    const hashed = generated.data?.properties?.hashed_token;
    if (generated.error || !hashed) {
      console.error("[members] link generation failed", generated.error?.message);
      return false;
    }

    const link =
      `${siteUrl}/auth/callback` +
      `?token_hash=${encodeURIComponent(hashed)}` +
      `&type=${encodeURIComponent(generated.data?.properties?.verification_type ?? "magiclink")}` +
      `&next=${encodeURIComponent("/portal")}`;

    const result = await sendPortalInvite(email, clientName, link);
    return result.sent;
  } catch (error) {
    console.error("[members] invite failed", error);
    return false;
  }
}
