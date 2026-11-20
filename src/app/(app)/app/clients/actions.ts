"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { clientSchema, fieldErrors, propertySchema } from "@/lib/validation";

/**
 * The owner correcting a customer's record: their contact details, private
 * notes, and addresses.
 *
 * Owner only, and RLS (`owner writes clients`, `owner writes properties`,
 * `owner writes private client notes`) says the same thing again. Sent
 * invoices are unaffected: each carries its own copy of the customer and
 * address from the day it went out.
 */
export interface ClientActionResult {
  ok: boolean;
  errors?: Record<string, string>;
  formError?: string;
}

function revalidateClient(clientId: string): void {
  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/clients");
  revalidatePath("/portal/details");
}

export async function updateClientDetails(formData: FormData): Promise<ClientActionResult> {
  await requireOwner();

  const clientId = String(formData.get("client_id") ?? "");
  if (!clientId) return { ok: false, formError: "Missing customer." };

  const parsed = clientSchema.safeParse({
    full_name: formData.get("full_name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    company_name: formData.get("company_name") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("clients")
    .update({
      full_name: parsed.data.full_name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      company_name: parsed.data.company_name || null,
    })
    .eq("id", clientId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    console.error("[clients] update failed", error);
    return {
      ok: false,
      formError: error?.code === "23505"
        ? "Another customer already has that email address."
        : "Could not save those details. Try again.",
    };
  }

  // Private notes: an empty box removes them rather than storing a blank.
  const notes = parsed.data.notes?.trim() ?? "";
  const { error: notesError } = notes
    ? await supabase
        .from("client_private_notes")
        .upsert({ client_id: clientId, notes }, { onConflict: "client_id" })
    : await supabase.from("client_private_notes").delete().eq("client_id", clientId);

  if (notesError) {
    console.error("[clients] notes save failed", notesError);
    return {
      ok: false,
      formError: "The details saved, but your notes did not. Try again.",
    };
  }

  revalidateClient(clientId);

  return { ok: true };
}

function parseProperty(formData: FormData) {
  return propertySchema.safeParse({
    client_id: formData.get("client_id") ?? "",
    label: formData.get("label") ?? "",
    address_line1: formData.get("address_line1") ?? "",
    address_line2: formData.get("address_line2") ?? "",
    city: formData.get("city") ?? "",
    postcode: formData.get("postcode") ?? "",
    access_notes: formData.get("access_notes") ?? "",
  });
}

function propertyRow(data: NonNullable<ReturnType<typeof parseProperty>["data"]>) {
  return {
    label: data.label || null,
    address_line1: data.address_line1,
    address_line2: data.address_line2 || null,
    city: data.city || null,
    postcode: data.postcode,
    access_notes: data.access_notes || null,
  };
}

/** Corrects an address in place — a typo, a missing flat number, new access notes. */
export async function updateProperty(formData: FormData): Promise<ClientActionResult> {
  await requireOwner();

  const propertyId = String(formData.get("property_id") ?? "");
  if (!propertyId) return { ok: false, formError: "Missing address." };

  const parsed = parseProperty(formData);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("properties")
    .update(propertyRow(parsed.data))
    .eq("id", propertyId)
    .eq("client_id", parsed.data.client_id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    console.error("[clients] property update failed", error);
    return { ok: false, formError: "Could not save that address. Try again." };
  }

  revalidateClient(parsed.data.client_id);

  return { ok: true };
}

/** Adds another address — they have moved, or this is a second property. */
export async function addProperty(formData: FormData): Promise<ClientActionResult> {
  await requireOwner();

  const parsed = parseProperty(formData);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { error } = await supabase
    .from("properties")
    .insert({ client_id: parsed.data.client_id, ...propertyRow(parsed.data) });

  if (error) {
    console.error("[clients] property insert failed", error);
    return { ok: false, formError: "Could not add that address. Try again." };
  }

  revalidateClient(parsed.data.client_id);

  return { ok: true };
}
