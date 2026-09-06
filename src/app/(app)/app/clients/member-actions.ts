"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { addMember } from "@/lib/members";
import { emailSchema } from "@/lib/validation";
import type { ClientMemberRole } from "@/types/database";

/**
 * Managing who can see a customer account.
 *
 * Deliberately `requireUser`, not `requireOwner`: the same actions serve the
 * owner's customer page and the customer's own portal, because a landlord
 * adding their colleague should not need to ring up. Authorisation is left to
 * RLS — `managers add members` and `owner manages all members` — so there is
 * one rule enforced in one place rather than two that can drift apart.
 */
export interface MemberActionResult {
  ok: boolean;
  errors?: Record<string, string>;
  formError?: string;
  warning?: string;
}

function revalidateBoth(clientId: string): void {
  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/portal/details");
}

export async function addClientMember(formData: FormData): Promise<MemberActionResult> {
  const user = await requireUser();

  const clientId = String(formData.get("client_id") ?? "");
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const rawRole = String(formData.get("role") ?? "viewer");

  if (!clientId) return { ok: false, formError: "Missing customer." };

  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    return { ok: false, errors: { email: "Check the email address — it needs an @ and a domain" } };
  }

  const role: ClientMemberRole = rawRole === "manager" ? "manager" : "viewer";

  const supabase = await createClient();

  // Read through the caller's own session: if they cannot see this customer,
  // RLS returns nothing and they get the same answer as for a made-up id.
  const { data: client } = await supabase
    .from("clients")
    .select("id, full_name, email")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) return { ok: false, formError: "That customer no longer exists." };

  if (client.email && client.email.toLowerCase() === parsed.data) {
    return {
      ok: false,
      errors: { email: "That is the customer's own address — they already have access." },
    };
  }

  const result = await addMember({
    clientId,
    email: parsed.data,
    role,
    invitedBy: user.id,
    clientName: client.full_name,
  });

  if (!result.ok) return { ok: false, formError: result.error };

  revalidateBoth(clientId);

  return {
    ok: true,
    warning: result.emailFailed
      ? "They have access, but the invitation email did not send. Tell them to sign in with that address."
      : undefined,
  };
}

export async function setMemberRole(formData: FormData): Promise<MemberActionResult> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  const role: ClientMemberRole =
    String(formData.get("role") ?? "viewer") === "manager" ? "manager" : "viewer";

  if (!id || !clientId) return { ok: false, formError: "Missing person." };

  const supabase = await createClient();
  const { error } = await supabase.from("client_members").update({ role }).eq("id", id);

  if (error) {
    return {
      ok: false,
      formError:
        error.code === "42501"
          ? "Only a manager on this account can change what people can do."
          : "Could not change that. Try again.",
    };
  }

  revalidateBoth(clientId);

  return { ok: true };
}

export async function removeClientMember(formData: FormData): Promise<MemberActionResult> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("client_id") ?? "");

  if (!id || !clientId) return { ok: false, formError: "Missing person." };

  const supabase = await createClient();
  const { error } = await supabase.from("client_members").delete().eq("id", id);

  if (error) {
    return {
      ok: false,
      formError:
        error.code === "42501"
          ? "Only a manager on this account can remove people from it."
          : "Could not remove them. Try again.",
    };
  }

  revalidateBoth(clientId);

  return { ok: true };
}
