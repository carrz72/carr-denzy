import type { NextConfig } from "next";

/**
 * Content-Security-Policy is NOT set here — it is set per-request in
 * `src/middleware.ts` so it can carry a nonce that Next.js picks up for its
 * own inline hydration scripts. Everything else is static and belongs here.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    // The enquiry form uses the camera on mobile; nothing else is needed.
    value: "camera=(self), microphone=(), geolocation=(self), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const supabaseHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Barrel-file containment.
   *
   * Every icon in this app is imported by name from `@phosphor-icons/react`,
   * whose barrel re-exports roughly 1,500 icons across 6 weights. A production
   * build tree-shakes that away; **dev does not**, so without this webpack
   * parses the whole barrel for every route that shows an icon — which is all
   * of them. Measured: 17 GB of RAM and no completed compile.
   *
   * Both the package and the `/dist/ssr` subpath are listed because the
   * optimisation matches the import specifier, and every import in this
   * codebase uses the subpath.
   */
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "@phosphor-icons/react/dist/ssr"],
  },

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/**" }]
      : [],
  },

  // Fail the build rather than ship a type error into a business's invoicing.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // The service worker must never be cached, or users get stuck on an
        // old shell after a deploy.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ];
  },
};

export default nextConfig;
