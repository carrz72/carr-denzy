import type { PortfolioItem } from "@/types/database";

/**
 * Portfolio image paths come in two shapes, and both stay valid for ever:
 *
 *   `/images/work-33.webp`  — a file shipped in /public. This is how the
 *                             gallery was seeded, so nothing had to be
 *                             re-uploaded to move it into the database.
 *   `1754...-a1b2-patio.jpg` — an object in the public `portfolio` bucket,
 *                             which is what the owner's uploads produce.
 *
 * Anything starting with a slash is served by Next directly; anything else is
 * resolved to the bucket's public URL. The bucket is public precisely so this
 * can be a plain string and not a signed-URL round trip on a marketing page.
 */
export function portfolioImageUrl(path: string): string {
  if (path.startsWith("/") || path.startsWith("http")) return path;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return path;

  return `${base}/storage/v1/object/public/portfolio/${path}`;
}

/** True when this row is a before-and-after rather than a single photograph. */
export function isPair(
  item: Pick<PortfolioItem, "before_path">,
): item is Pick<PortfolioItem, "before_path"> & { before_path: string } {
  return typeof item.before_path === "string" && item.before_path.trim() !== "";
}
