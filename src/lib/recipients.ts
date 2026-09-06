import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Everyone who should be told about a quote or an invoice.
 *
 * A customer account can have more than one person on it — a landlord and
 * their office manager, a couple, a letting agent's staff. Sending only to
 * `clients.email` means the extra people have to be told by some other means
 * to go and look, which defeats the point of giving them access at all.
 *
 * Uses the admin client because this runs from an owner action: the owner has
 * no RLS route to read another account's member list, and should not be given
 * one just for this.
 *
 * Two rules hold:
 *
 *   * The named customer is always first. They are the person the document is
 *     addressed to, and the one whose name is on it.
 *   * Addresses are de-duplicated case-insensitively. A member row created from
 *     the same address as `clients.email` is common — the backfill makes one on
 *     purpose — and nobody should get the same quote twice.
 */
export interface Recipient {
  email: string;
  /** The named customer, as opposed to somebody added to the account. */
  primary: boolean;
}

export async function recipientsForClient(clientId: string): Promise<Recipient[]> {
  const admin = createAdminClient();

  const [{ data: client }, { data: members }] = await Promise.all([
    admin.from("clients").select("email").eq("id", clientId).maybeSingle(),
    admin.from("client_members").select("email").eq("client_id", clientId),
  ]);

  const seen = new Set<string>();
  const out: Recipient[] = [];

  const add = (raw: string | null | undefined, primary: boolean) => {
    const email = raw?.trim();
    if (!email) return;

    const key = email.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    out.push({ email, primary });
  };

  add(client?.email, true);
  for (const member of members ?? []) add(member.email, false);

  return out;
}
