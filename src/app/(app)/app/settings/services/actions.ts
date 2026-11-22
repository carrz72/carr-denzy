"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { fieldErrors } from "@/lib/validation";
import { SERVICE_ICON_NAMES } from "@/components/service-icon-names";

/**
 * The services on the website, edited by the owner.
 *
 * Owner-only twice over: `requireOwner()` here and the `owner writes
 * services` RLS policy in the database.
 *
 * A service is never deleted, only hidden. Jobs keep a link to the service
 * they were for, and a hidden service can be brought back with its page
 * address unchanged.
 */

export interface ServiceActionResult {
  ok: boolean;
  errors?: Record<string, string>;
  formError?: string;
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .transform((value) => (value === "" ? null : value));

const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Give the service a name, for example 'Boiler repairs'").max(60, "Keep the name short"),
  blurb: z.string().trim().min(10, "Add one sentence about the service").max(160, "Keep this to one sentence (160 characters)"),
  description: optional(600),
  meta_description: optional(170),
  examples: z
    .string()
    .max(2000)
    .transform((value) =>
      value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 12),
    ),
  from_price: optional(20),
  icon: z.enum(SERVICE_ICON_NAMES),
  // Either one of the site's own photos (/images/...) or a photo the owner uploaded
  // to the portfolio bucket under services/.
  image_path: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\/images\/[a-z0-9/_.-]+$/i.test(value) || /^services\/[a-z0-9._-]+$/i.test(value),
      "That photo could not be used. Try uploading it again.",
    )
    .transform((value) => (value === "" ? null : value)),
  is_active: z.boolean(),
});

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "service"
  );
}

/** Every page that shows services: the whole marketing site, plus this screen. */
function refreshSite() {
  revalidatePath("/", "layout");
  revalidatePath("/app/settings/services");
}

export async function saveService(formData: FormData): Promise<ServiceActionResult> {
  await requireOwner();

  const parsed = serviceSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name") ?? "",
    blurb: formData.get("blurb") ?? "",
    description: formData.get("description") ?? "",
    meta_description: formData.get("meta_description") ?? "",
    examples: formData.get("examples") ?? "",
    from_price: formData.get("from_price") ?? "",
    icon: formData.get("icon") ?? "Wrench",
    image_path: formData.get("image_path") ?? "",
    is_active: formData.get("is_active") === "on",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const { id, ...fields } = parsed.data;
  const supabase = await createClient();

  if (id) {
    const { error } = await supabase.from("services").update(fields).eq("id", id);
    if (error) {
      console.error("[services] update failed", error.message);
      return { ok: false, formError: "That service could not be saved. Try again in a moment." };
    }
    refreshSite();
    return { ok: true };
  }

  // New service: its page address comes from the name and never changes after,
  // so links (and Google) keep working if the name is edited later.
  const { data: existing } = await supabase.from("services").select("slug, sort_order");
  const taken = new Set((existing ?? []).map((row) => row.slug));
  const base = slugify(fields.name);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  const sortOrder = Math.max(0, ...(existing ?? []).map((row) => row.sort_order ?? 0)) + 10;

  const { error } = await supabase.from("services").insert({ ...fields, slug, sort_order: sortOrder });
  if (error) {
    console.error("[services] insert failed", error.message);
    return { ok: false, formError: "That service could not be added. Try again in a moment." };
  }

  refreshSite();
  return { ok: true };
}

/** Moves a service one place up or down the list. */
export async function moveService(id: string, direction: "up" | "down"): Promise<ServiceActionResult> {
  await requireOwner();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, formError: "That service was not found." };

  const supabase = await createClient();
  const { data: rows } = await supabase.from("services").select("id, sort_order").order("sort_order").order("name");
  const list = rows ?? [];
  const index = list.findIndex((row) => row.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= list.length) return { ok: true };

  // Renumber the whole list in tens, so equal or missing sort orders cannot
  // make a move appear to do nothing.
  const ordered = [...list];
  const moving = ordered[index]!;
  ordered[index] = ordered[swapWith]!;
  ordered[swapWith] = moving;
  for (const [n, row] of ordered.entries()) {
    const target = (n + 1) * 10;
    if (row.sort_order !== target) {
      const { error } = await supabase.from("services").update({ sort_order: target }).eq("id", row.id);
      if (error) {
        console.error("[services] reorder failed", error.message);
        return { ok: false, formError: "The order could not be saved. Try again." };
      }
    }
  }

  refreshSite();
  return { ok: true };
}
