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

/**
 * Signed URLs for a job's photos, wherever each one is stored.
 *
 * Photos a customer attached to their enquiry stay in the `enquiry-photos`
 * bucket when the enquiry becomes a job — the row is re-pointed at the job,
 * the file is not moved. Signing everything from `job-photos` left those
 * pictures blank on the job, which is exactly where they are needed.
 *
 * Enquiry objects are signed with the service role, because customers have no
 * read policy on that bucket. That is safe only because callers pass paths
 * they have already read from `job_photos` through their own session, so RLS
 * (including `visible_to_client`) has already decided which photos they may
 * see. Never pass a path that came from user input.
 */
export async function signedJobPhotoUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];

  const isEnquiry = (path: string) => path.startsWith("enquiry/");
  const jobPaths = paths.filter((path) => !isEnquiry(path));
  const enquiryPaths = paths.filter(isEnquiry);

  const [jobUrls, enquiryUrls] = await Promise.all([
    signedPhotoUrls("job-photos", jobPaths),
    (async () => {
      if (enquiryPaths.length === 0) return [] as string[];
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { data, error } = await createAdminClient()
        .storage.from("enquiry-photos")
        .createSignedUrls(enquiryPaths, SIGNED_URL_TTL_SECONDS);
      if (error || !data) {
        console.error("[storage] could not sign enquiry photo urls", error?.message);
        return enquiryPaths.map(() => "");
      }
      return data.map((entry) => entry.signedUrl ?? "");
    })(),
  ]);

  // Back into the caller's order.
  let j = 0;
  let e = 0;
  return paths.map((path) => (isEnquiry(path) ? enquiryUrls[e++] : jobUrls[j++]) ?? "");
}
