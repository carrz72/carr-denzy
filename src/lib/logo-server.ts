import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { businessLogoUrl } from "@/lib/logo";

export interface LogoImage {
  data: Buffer;
  format: "png" | "jpg";
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** The current `settings.logo_path`, read with the admin client (settings are not public). */
export async function currentLogoPath(): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from("settings").select("logo_path").maybeSingle();
    return data?.logo_path ?? null;
  } catch {
    return null;
  }
}

/**
 * The logo's bytes, for the PDF renderer. Fetched here rather than handed to
 * the renderer as a URL so a slow or missing image can never break the PDF:
 * any failure just means the document prints without a logo.
 */
export async function loadLogoImage(): Promise<LogoImage | null> {
  const url = businessLogoUrl(await currentLogoPath());
  const absolute = url.startsWith("/") ? `${siteUrl()}${url}` : url;

  try {
    const response = await fetch(absolute, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) return null;

    const type = response.headers.get("content-type") ?? "";
    const format = type.includes("png") || absolute.endsWith(".png") ? "png" : type.includes("jpeg") || /\.jpe?g$/.test(absolute) ? "jpg" : null;
    if (!format) return null;

    return { data: Buffer.from(await response.arrayBuffer()), format };
  } catch {
    return null;
  }
}
