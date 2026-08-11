import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncUserRole } from "@/lib/auth";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Magic-link callback.
 *
 * Supabase hands a session back in one of three shapes, and which one you get
 * depends on how the link was created — not on anything this app chooses:
 *
 *   ?code=…                  PKCE. What `signInWithOtp` produces from the
 *                            browser client, because @supabase/ssr stores a
 *                            code verifier in a cookie first.
 *
 *   ?token_hash=…&type=…     A server-verifiable token. Newer Supabase email
 *                            templates use this, as does an admin-generated
 *                            link routed through here.
 *
 *   #access_token=…          Implicit flow. Bare tokens in a URL fragment,
 *                            which is what a link with no PKCE challenge falls
 *                            back to.
 *
 * The third one cannot be handled here at all: **a browser never sends the
 * fragment to the server**, so by the time this route runs those tokens are
 * gone. Handling only `?code=` meant any implicit link landed on
 * `/sign-in?error=missing` and looked, reasonably, like a broken link.
 *
 * So: the two server-readable shapes are exchanged here, and anything else is
 * bounced to /auth/complete, which reads the fragment in the browser. The
 * fragment survives a 3xx redirect, which is what makes that hand-off work.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next");

  // Relative paths only — an absolute URL would make this an open redirect.
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  // Supabase reports link problems here rather than by failing the exchange.
  const authError = searchParams.get("error");
  const errorCode = searchParams.get("error_code");

  if (authError) {
    const reason =
      errorCode === "otp_expired" || authError === "access_denied" ? "expired" : "invalid";
    return NextResponse.redirect(`${origin}/sign-in?error=${reason}`);
  }

  // Nothing this route can read. It may still be an implicit link carrying a
  // fragment, so hand off to the client rather than declaring failure.
  if (!code && !tokenHash) {
    const complete = new URL("/auth/complete", origin);
    if (next) complete.searchParams.set("next", next);
    return NextResponse.redirect(complete);
  }

  const supabase = await createClient();

  const { data, error } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type ?? "magiclink" })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error || !data.user?.email) {
    console.error("[auth] sign-in failed", error?.message);
    const reason = error?.message?.toLowerCase().includes("expired") ? "expired" : "invalid";
    return NextResponse.redirect(`${origin}/sign-in?error=${reason}`);
  }

  let role: string = "client";

  try {
    role = await syncUserRole(data.user.id, data.user.email);
  } catch (syncError) {
    // A failed role sync must not lock someone out. They land in the portal,
    // which is the safe default — the worst case is the owner needing to sign
    // in a second time, not a customer seeing the owner's finances.
    console.error("[auth] role sync failed", syncError);
  }

  if (next) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  const home = role === "owner" || role === "staff" ? "/app" : "/portal";

  return NextResponse.redirect(`${origin}${home}`);
}
