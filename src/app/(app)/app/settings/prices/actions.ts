"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { fieldErrors } from "@/lib/validation";

/**
 * Price list management.
 *
 * The price list is what the quote and invoice builders insert from. Until now
 * it was seeded once by migration and could not be touched, which meant the
 * owner's actual rates drifted away from the ones the app offered — and a rate
 * you have to remember to override every time is worse than no rate at all.
 *
 * Every action is owner-only. `requireOwner()` guards the application path and
 * the `owner writes price list` RLS policy guards the database, so neither is
 * relied on alone.
 */

const priceItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(2, "Give the item a description, for example 'Standard call-out'")
    .max(500, "That description is too long"),
  // Pounds in, pence out. The form shows £ because nobody thinks in pence.
  unit_price_pounds: z
    .string()
    .trim()
    .refine((value) => /^\d*(\.\d{0,2})?$/.test(value) && value !== "", "Enter a price, for example 85 or 85.50")
    .transform((value) => Math.round(Number(value) * 100))
    .refine((pence) => pence >= 0, "A price cannot be negative")
    .refine((pence) => pence <= 100_000_00, "That is over £100,000 — check the figure"),
  kind: z.enum(["labour", "materials", "other"]),
  unit: z.string().trim().min(1, "Say what it is charged per").max(40),
});

export interface PriceActionResult {
  ok: boolean;
  errors?: Record<string, string>;
  formError?: string;
}

function parse(formData: FormData) {
  return priceItemSchema.safeParse({
    description: formData.get("description") ?? "",
    unit_price_pounds: formData.get("unit_price_pounds") ?? "",
    kind: formData.get("kind") ?? "labour",
    unit: formData.get("unit") ?? "each",
  });
}

export async function createPriceItem(formData: FormData): Promise<PriceActionResult> {
  await requireOwner();

  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { error } = await supabase.from("price_items").insert({
    description: parsed.data.description,
    unit_price_pence: parsed.data.unit_price_pounds,
    kind: parsed.data.kind,
    unit: parsed.data.unit,
  });

  if (error) {
    console.error("[prices] insert failed", error);
    return { ok: false, formError: "Could not add that. Try again." };
  }

  revalidatePath("/app/settings/prices");

  return { ok: true };
}

export async function updatePriceItem(formData: FormData): Promise<PriceActionResult> {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing item." };

  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { error } = await supabase
    .from("price_items")
    .update({
      description: parsed.data.description,
      unit_price_pence: parsed.data.unit_price_pounds,
      kind: parsed.data.kind,
      unit: parsed.data.unit,
    })
    .eq("id", id);

  if (error) {
    console.error("[prices] update failed", error);
    return { ok: false, formError: "Could not save that change. Try again." };
  }

  revalidatePath("/app/settings/prices");

  return { ok: true };
}

/**
 * Deletes a price-list entry.
 *
 * A hard delete is correct here, and it is worth being explicit about why when
 * the rest of the app soft-deletes everything: a price-list entry is a
 * template, not a record. Quotes and invoices copy the description and the
 * price onto their own line items at the moment they are built, so removing an
 * entry cannot alter a figure a customer has already been shown. Nothing
 * references `price_items` by foreign key.
 */
export async function deletePriceItem(formData: FormData): Promise<PriceActionResult> {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing item." };

  const supabase = await createClient();

  const { error } = await supabase.from("price_items").delete().eq("id", id);

  if (error) {
    console.error("[prices] delete failed", error);
    return { ok: false, formError: "Could not remove that. Try again." };
  }

  revalidatePath("/app/settings/prices");

  return { ok: true };
}
