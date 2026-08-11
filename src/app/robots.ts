import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Authenticated areas. Blocking them keeps crawler traffic off routes
        // that only ever redirect, and keeps customer-specific URLs out of
        // search results if one is ever shared by accident.
        disallow: ["/app/", "/portal/", "/auth/", "/sign-in"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
