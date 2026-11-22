/**
 * A collision-resistant object key. The random suffix matters: two people
 * photographing a boiler on an iPhone both upload `IMG_0001.jpg`, and without
 * it the second would silently overwrite the first.
 */
export function storageKey(prefix: string, fileName: string): string {
  const safe = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-60);

  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `${prefix}/${Date.now()}-${random}-${safe || "photo.jpg"}`;
}
