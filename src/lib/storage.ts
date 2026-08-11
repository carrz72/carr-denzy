import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Signed URLs for private storage objects.
 *
 * Both photo buckets are private (spec NFR-17). Nothing is served by a public
 * URL, so a photograph of the inside of somebody's house cannot be found by
 * guessing a path. Instead the caller's own session signs a short-lived URL,
 * which means RLS on `storage.objects` decides whether they get one at all.
 *
 * One hour is deliberately short. These URLs end up in page HTML, and page
 * HTML ends up in browser caches and, occasionally, in a screenshot someone
 * emails around.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function signedPhotoUrls(
  bucket: "job-photos" | "enquiry-photos",
  paths: string[],
): Promise<string[]> {
  if (paths.length === 0) return [];

  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    console.error("[storage] could not sign urls", error?.message);
    return [];
  }

  // createSignedUrls preserves input order and reports per-object failures
  // rather than failing the batch, so a single missing file does not blank the
  // whole gallery. Empty string marks the ones that failed; callers skip them.
  return data.map((entry) => entry.signedUrl ?? "");
}

export async function signedPhotoUrl(
  bucket: "job-photos" | "enquiry-photos",
  path: string,
): Promise<string | null> {
  const [url] = await signedPhotoUrls(bucket, [path]);
  return url || null;
}
