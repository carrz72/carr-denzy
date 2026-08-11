"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { closureSchema, fieldErrors } from "@/lib/validation";

export interface ActionResult {
  ok: boolean;
  errors?: Record<string, string>;
  formError?: string;
}

/**
 * Time off.
 *
 * Owner-only, and it changes what the public site says — so it revalidates the
 * marketing pages as well as the diary. An owner who books a holiday and then
 * sees the old "same working day" promise still on their home page will
 * reasonably assume it did not save.
 */
function revalidateEverywhere(): void {
  revalidatePath("/app/diary");
  revalidatePath("/", "layout");
  revalidatePath("/request");
}

export async function addClosure(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const parsed = closureSchema.safeParse({
    starts_on: formData.get("starts_on") ?? "",
    ends_on: formData.get("ends_on") ?? "",
    reason: formData.get("reason") ?? "",
    emergencies_only: formData.get("emergencies_only") === "on",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { error } = await supabase.from("closures").insert({
    starts_on: parsed.data.starts_on,
    ends_on: parsed.data.ends_on,
    reason: parsed.data.reason || null,
    emergencies_only: parsed.data.emergencies_only,
  });

  if (error) {
    console.error("[closures] insert failed", error.message);
    return { ok: false, formError: "Could not save that. Try again." };
  }

  revalidateEverywhere();

  return { ok: true };
}

export async function removeClosure(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing dates." };

  const supabase = await createClient();

  const { error } = await supabase.from("closures").delete().eq("id", id);

  if (error) {
    return { ok: false, formError: "Could not remove that. Try again." };
  }

  revalidateEverywhere();

  return { ok: true };
}
