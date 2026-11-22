/**
 * The business logo printed top-left on quotes and invoices.
 *
 * The owner can replace it from Settings (stored in the public `branding`
 * bucket, path in `settings.logo_path`). Until they do, or if they go back to
 * the standard one, it is the logo mark shipped with the site. PNG rather than
 * the site's WebP, because the PDF renderer only reads PNG and JPG.
 */
export const STANDARD_LOGO = "/images/logo/logo-mark.png";

/** A storage path is one we wrote: `logo-<timestamp>.png|jpg`, nothing else. */
export const LOGO_PATH_PATTERN = /^logo-\d{10,16}\.(png|jpe?g)$/;

/** Where the logo can be loaded from: a site-relative path or a full URL. */
export function businessLogoUrl(logoPath: string | null | undefined): string {
  if (!logoPath || !LOGO_PATH_PATTERN.test(logoPath)) return STANDARD_LOGO;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return STANDARD_LOGO;

  return `${base}/storage/v1/object/public/branding/${logoPath}`;
}
