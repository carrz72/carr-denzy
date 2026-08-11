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
 *   3. Sets a per-request Content-Security-Policy nonce that Next.js applies
 *      to its own inline hydration scripts.
 */

const OWNER_PREFIX = "/app";
const PORTAL_PREFIX = "/portal";
const SIGN_IN_PATH = "/sign-in";

function buildCsp(nonce: string, supabaseOrigin: string, isDev: boolean) {
  const directives = [
    `default-src 'self'`,
    // 'strict-dynamic' lets the nonced Next bootstrap load its own chunks.
    // Dev needs 'unsafe-eval' for React Refresh; production does not get it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""}`,
    // Next injects critical CSS as inline <style>, which cannot carry a nonce
    // reliably across streaming boundaries. Styles are not a script-execution
    // vector here, and no user content reaches a style attribute.
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
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  let supabaseOrigin = "";
  try {
    supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    supabaseOrigin = "";
  }

  const csp = buildCsp(nonce, supabaseOrigin, isDev);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

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
  response.headers.set("x-nonce", nonce);

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
