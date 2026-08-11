import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

/**
 * Middleware does three jobs, in this order:
 *
 *   1. Refreshes the Supabase session cookie so a signed-in user is not thrown
 *      out mid-task.
 *   2. Routes people to the half of the app that belongs to them. This is
 *      navigation convenience, NOT authorisation — Row Level Security is the
 *      real gate, and it holds even if this file is bypassed entirely.
 *   3. Sets the Content-Security-Policy.
 */

const OWNER_PREFIX = "/app";
const PORTAL_PREFIX = "/portal";
const SIGN_IN_PATH = "/sign-in";

/**
 * Content-Security-Policy.
 *
 * This used to be nonce-based: `script-src 'self' 'nonce-…' 'strict-dynamic'`.
 * It shipped a serious bug, and the reasoning is recorded here so nobody
 * reinstates it.
 *
 * A nonce has to be unique per request. Eight pages on this site — the home
 * page, services, work, about, contact, privacy, terms and the 404 — are
 * prerendered to HTML at BUILD time, which is exactly once. Their script tags
 * therefore carry no nonce, and Next has no opportunity to add one.
 *
 * `'strict-dynamic'` makes matters absolute rather than partial: when a browser
 * sees it, it IGNORES `'self'` and every other host-source, and executes only
 * scripts carrying the matching nonce. The result was that every one of those
 * prerendered pages ran no JavaScript at all in production — 37 un-nonced
 * inline scripts and every chunk, all blocked. The pages still looked correct,
 * because they are server-rendered, so the failure was invisible until someone
 * pressed something. The mobile menu was the thing that gave it away, and it
 * looked intermittent purely because signing out drops you onto `/`.
 *
 * Nonces require dynamic rendering. Forcing all eight pages dynamic to keep the
 * nonce would trade a real, measurable performance loss on the pages that
 * matter most to a customer for a theoretical hardening — so the nonce goes and
 * the static optimisation stays.
 *
 * What `'unsafe-inline'` costs here is small and worth stating plainly. It
 * matters when an attacker can get markup into the page. In this application
 * React escapes every interpolated value; the single `dangerouslySetInnerHTML`
 * is the LocalBusiness JSON-LD, built from a hard-coded object in
 * `src/lib/site.ts` that no user input reaches; and there is no `eval` and no
 * `innerHTML` assignment anywhere. CSP is defence-in-depth here, not the
 * primary control against XSS — that is React's escaping and the server-side
 * validation in `src/lib/validation.ts`.
 *
 * Every other directive below still does real work and stays strict.
 */
function buildCsp(supabaseOrigin: string, isDev: boolean) {
  const directives = [
    `default-src 'self'`,
    // Dev additionally needs 'unsafe-eval' for React Refresh.
    `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""}`,
    // Next injects critical CSS as inline <style>. Styles are not a
    // script-execution vector here, and no user content reaches a style
    // attribute.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: ${supabaseOrigin}`,
    `font-src 'self' data:`,
    `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace("https://", "wss://")}`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ];

  return directives.join("; ").replace(/\s{2,}/g, " ").trim();
}

export async function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";

  let supabaseOrigin = "";
  try {
    supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    supabaseOrigin = "";
  }

  const csp = buildCsp(supabaseOrigin, isDev);

  // The CSP is deliberately NOT set on the forwarded request headers. Next reads
  // a request-side `content-security-policy` as a signal to inject nonces, and
  // doing that here is what forced the broken pairing above.
  const requestHeaders = new Headers(request.headers);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase. getSession() reads the
  // cookie without verifying it, which is not good enough to route on.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const role = (user?.app_metadata?.role as string | undefined) ?? "client";

  const wantsOwnerArea = pathname.startsWith(OWNER_PREFIX);
  const wantsPortal = pathname.startsWith(PORTAL_PREFIX);

  if ((wantsOwnerArea || wantsPortal) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = SIGN_IN_PATH;
    // Bring them back where they were headed once they have signed in.
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // A client who wanders into the owner area is sent to their own portal
  // rather than shown a permission error they can do nothing about.
  if (wantsOwnerArea && user && role !== "owner" && role !== "staff") {
    const url = request.nextUrl.clone();
    url.pathname = PORTAL_PREFIX;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Already signed in and sitting on the sign-in page — send them onward.
  if (pathname === SIGN_IN_PATH && user) {
    const url = request.nextUrl.clone();
    url.pathname = role === "owner" || role === "staff" ? OWNER_PREFIX : PORTAL_PREFIX;
    url.search = "";
    return NextResponse.redirect(url);
  }

  response.headers.set("content-security-policy", csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, the service worker and the manifest.
     * The service worker in particular must not be rewritten or redirected.
     */
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|images/|fonts/|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2|otf|ttf)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
