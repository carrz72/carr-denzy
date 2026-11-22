import { NextResponse } from "next/server";
import { businessLogoUrl } from "@/lib/logo";
import { currentLogoPath } from "@/lib/logo-server";

/**
 * Always the business's current logo. Quotes and invoices on screen point at
 * this one address, so replacing the logo in Settings changes every document
 * at once without touching each page.
 */
export async function GET(request: Request) {
  const target = businessLogoUrl(await currentLogoPath());
  const response = NextResponse.redirect(new URL(target, request.url), 307);
  response.headers.set("Cache-Control", "public, max-age=60, s-maxage=60");
  return response;
}
