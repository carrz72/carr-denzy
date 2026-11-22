"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { LOGO_PATH_PATTERN } from "@/lib/logo";

export interface LogoActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Points quotes and invoices at a newly uploaded logo, or (with no path)
 * back at the standard one. The old file is removed so the bucket only ever
 * holds the logo in use.
 */
export async function setBusinessLogo(logoPath: string | null): Promise<LogoActionResult> {
  await requireOwner();

  if (logoPath !== null && !LOGO_PATH_PATTERN.test(logoPath)) {
    return { ok: false, error: "That file could not be used. Try uploading it again." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase.from("settings").select("logo_path").maybeSingle();

  const { error } = await supabase.from("settings").update({ logo_path: logoPath }).eq("id", true);
  if (error) {
    console.error("[settings] logo update failed", error.message);
    return { ok: false, error: "The logo could not be saved. Try again in a moment." };
  }

  const old = before?.logo_path;
  if (old && old !== logoPath && LOGO_PATH_PATTERN.test(old)) {
    await supabase.storage.from("branding").remove([old]);
  }

  revalidatePath("/app/settings");
  return { ok: true };
}
