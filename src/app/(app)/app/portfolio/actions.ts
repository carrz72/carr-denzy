"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { fieldErrors, portfolioCategorySchema, portfolioItemSchema } from "@/lib/validation";

/**
 * Managing the "Our work" gallery.
 *
 * Every export starts with `requireOwner()`. This is public-facing marketing
 * content — a staff member who can move a job along has no business changing
 * what the business advertises.
 *
 * Both marketing pages that read this table are revalidated on a timer, so each
 * mutation also busts their cache explicitly. Without that, an owner who
 * deletes a photograph would keep seeing it on the live site for an hour and
 * reasonably conclude the delete had failed.
 */

export interface ActionResult {
  ok: boolean;
  errors?: Record<string, string>;
  formError?: string;
  id?: string;
}

/** Both marketing surfaces that render portfolio rows. */
function revalidateGallery(): void {
  revalidatePath("/work");
  revalidatePath("/");
  revalidatePath("/app/portfolio");
}

/**
 * A path is only safe to delete from storage if it IS a storage object.
 *
 * The seeded rows point at files in /public that are committed to the repo;
 * treating one of those as a bucket key and "deleting" it would do nothing in
 * storage and, worse, invite someone to later make it do something.
 */
function isStorageObject(path: string | null | undefined): path is string {
  return typeof path === "string" && path !== "" && !path.startsWith("/") && !path.startsWith("http");
}

export async function createPortfolioItem(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const parsed = portfolioItemSchema.safeParse({
    after_path: formData.get("after_path") ?? "",
    before_path: formData.get("before_path") ?? "",
    caption: formData.get("caption") ?? "",
    location: formData.get("location") ?? "",
    category_id: formData.get("category_id") ?? "",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  // New items go to the end. `max + 10` leaves gaps, so a later reorder can
  // slot something between two rows without renumbering the whole table.
  const { data: last } = await supabase
    .from("portfolio_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("portfolio_items")
    .insert({
      after_path: parsed.data.after_path,
      before_path: parsed.data.before_path || null,
      caption: parsed.data.caption,
      location: parsed.data.location || null,
      category_id: parsed.data.category_id || null,
      sort_order: (last?.sort_order ?? 0) + 10,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[portfolio] insert failed", error?.message);
    return { ok: false, formError: "Could not add that photo. Try again." };
  }

  revalidateGallery();

  return { ok: true, id: data.id };
}

export async function updatePortfolioItem(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing photo." };

  const parsed = portfolioItemSchema.safeParse({
    after_path: formData.get("after_path") ?? "",
    before_path: formData.get("before_path") ?? "",
    caption: formData.get("caption") ?? "",
    location: formData.get("location") ?? "",
    category_id: formData.get("category_id") ?? "",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { error } = await supabase
    .from("portfolio_items")
    .update({
      after_path: parsed.data.after_path,
      before_path: parsed.data.before_path || null,
      caption: parsed.data.caption,
      location: parsed.data.location || null,
      category_id: parsed.data.category_id || null,
    })
    .eq("id", id);

  if (error) {
    console.error("[portfolio] update failed", error.message);
    return { ok: false, formError: "Could not save that. Try again." };
  }

  revalidateGallery();

  return { ok: true };
}

/** Hides a photo from the public site without throwing the file away. */
export async function setPortfolioPublished(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  const published = formData.get("is_published") === "true";

  if (!id) return { ok: false, formError: "Missing photo." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("portfolio_items")
    .update({ is_published: published })
    .eq("id", id);

  if (error) {
    return { ok: false, formError: "Could not change that. Try again." };
  }

  revalidateGallery();

  return { ok: true };
}

/**
 * Moves a photo up or down by swapping sort_order with its neighbour.
 *
 * A swap rather than a renumber: two writes regardless of list length, and a
 * failure halfway leaves the order untidy rather than destroyed.
 */
export async function movePortfolioItem(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");

  if (!id || (direction !== "up" && direction !== "down")) {
    return { ok: false, formError: "Missing photo." };
  }

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("portfolio_items")
    .select("id, sort_order, category_id")
    .eq("id", id)
    .maybeSingle();

  if (!current) return { ok: false, formError: "That photo no longer exists." };

  // The nearest row IN THE SAME CATEGORY on the side we are moving towards.
  // The website shows each category as its own group, so swapping with a
  // photo from another group would look like the button did nothing.
  const sameCategory = () => {
    const query = supabase.from("portfolio_items").select("id, sort_order");
    return current.category_id
      ? query.eq("category_id", current.category_id)
      : query.is("category_id", null);
  };

  const { data: neighbour } =
    direction === "down"
      ? await sameCategory()
          .gt("sort_order", current.sort_order)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle()
      : await sameCategory()
          .lt("sort_order", current.sort_order)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();

  // Already at the end. Not an error — the button simply had nothing to do.
  if (!neighbour) return { ok: true };

  const [{ error: firstError }, { error: secondError }] = await Promise.all([
    supabase
      .from("portfolio_items")
      .update({ sort_order: neighbour.sort_order })
      .eq("id", current.id),
    supabase
      .from("portfolio_items")
      .update({ sort_order: current.sort_order })
      .eq("id", neighbour.id),
  ]);

  if (firstError || secondError) {
    return { ok: false, formError: "Could not reorder those. Try again." };
  }

  revalidateGallery();

  return { ok: true };
}

/**
 * Deletes the row, then its files.
 *
 * That order is deliberate. If the storage delete fails the row is already gone
 * and the site is correct; the cost is an orphaned object nobody can see. The
 * reverse order risks a visible row pointing at a file that no longer exists.
 */
export async function deletePortfolioItem(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing photo." };

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("portfolio_items")
    .select("after_path, before_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("portfolio_items").delete().eq("id", id);

  if (error) {
    console.error("[portfolio] delete failed", error.message);
    return { ok: false, formError: "Could not remove that photo. Try again." };
  }

  const paths = [item?.after_path, item?.before_path].filter(isStorageObject);

  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from("portfolio").remove(paths);
    if (storageError) {
      // Logged, not surfaced: the photo is off the website, which is what the
      // owner asked for.
      console.error("[portfolio] orphaned storage objects", paths, storageError.message);
    }
  }

  revalidateGallery();

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Several photos at once
// ---------------------------------------------------------------------------

/**
 * Adds a batch of already-uploaded photos as separate gallery entries, all
 * under one category and one caption. Each photo is its own entry so it can
 * be hidden, reordered or re-captioned later on its own.
 */
export async function createPortfolioItems(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const paths = formData
    .getAll("paths")
    .map((value) => String(value).trim())
    .filter((value) => value !== "" && value.length <= 400);

  if (paths.length === 0) return { ok: false, formError: "Choose at least one photo." };
  if (paths.length > 30) return { ok: false, formError: "Add up to 30 photos at a time." };

  const parsed = portfolioItemSchema.safeParse({
    after_path: paths[0],
    before_path: "",
    caption: formData.get("caption") ?? "",
    location: formData.get("location") ?? "",
    category_id: formData.get("category_id") ?? "",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("portfolio_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const start = (last?.sort_order ?? 0) + 10;

  const { error } = await supabase.from("portfolio_items").insert(
    paths.map((path, index) => ({
      after_path: path,
      caption: parsed.data.caption,
      location: parsed.data.location || null,
      category_id: parsed.data.category_id || null,
      sort_order: start + index * 10,
    })),
  );

  if (error) {
    console.error("[portfolio] bulk insert failed", error.message);
    return { ok: false, formError: "Could not add those photos. Try again." };
  }

  revalidateGallery();

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function categoryWriteError(error: { code?: string; message: string }): ActionResult {
  if (error.code === "23505") {
    return { ok: false, errors: { name: "You already have a category with that name." } };
  }
  console.error("[portfolio] category write failed", error.message);
  return { ok: false, formError: "Could not save that category. Try again." };
}

export async function createPortfolioCategory(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const parsed = portfolioCategorySchema.safeParse({ name: formData.get("name") ?? "" });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("portfolio_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("portfolio_categories")
    .insert({ name: parsed.data.name, sort_order: (last?.sort_order ?? 0) + 10 })
    .select("id")
    .single();

  if (error || !data) return categoryWriteError(error ?? { message: "no row" });

  revalidateGallery();

  return { ok: true, id: data.id };
}

export async function renamePortfolioCategory(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing category." };

  const parsed = portfolioCategorySchema.safeParse({ name: formData.get("name") ?? "" });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { error } = await supabase
    .from("portfolio_categories")
    .update({ name: parsed.data.name })
    .eq("id", id);

  if (error) return categoryWriteError(error);

  revalidateGallery();

  return { ok: true };
}

/** Moves a category earlier or later on the public page. */
export async function movePortfolioCategory(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");

  if (!id || (direction !== "up" && direction !== "down")) {
    return { ok: false, formError: "Missing category." };
  }

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("portfolio_categories")
    .select("id, sort_order")
    .eq("id", id)
    .maybeSingle();

  if (!current) return { ok: false, formError: "That category no longer exists." };

  const { data: neighbour } =
    direction === "down"
      ? await supabase
          .from("portfolio_categories")
          .select("id, sort_order")
          .gt("sort_order", current.sort_order)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle()
      : await supabase
          .from("portfolio_categories")
          .select("id, sort_order")
          .lt("sort_order", current.sort_order)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();

  if (!neighbour) return { ok: true };

  const [{ error: firstError }, { error: secondError }] = await Promise.all([
    supabase
      .from("portfolio_categories")
      .update({ sort_order: neighbour.sort_order })
      .eq("id", current.id),
    supabase
      .from("portfolio_categories")
      .update({ sort_order: current.sort_order })
      .eq("id", neighbour.id),
  ]);

  if (firstError || secondError) {
    return { ok: false, formError: "Could not reorder those. Try again." };
  }

  revalidateGallery();

  return { ok: true };
}

/**
 * Removes the heading only. Its photos stay on the website, moved to
 * "Other work" by the foreign key's `on delete set null`.
 */
export async function deletePortfolioCategory(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing category." };

  const supabase = await createClient();

  const { error } = await supabase.from("portfolio_categories").delete().eq("id", id);

  if (error) {
    console.error("[portfolio] category delete failed", error.message);
    return { ok: false, formError: "Could not remove that category. Try again." };
  }

  revalidateGallery();

  return { ok: true };
}
