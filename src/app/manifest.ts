import type { MetadataRoute } from "next";

/**
 * The web app manifest, served at /manifest.webmanifest.
 *
 * `start_url` is /app rather than the marketing home page: the person who
 * installs this to a home screen is the owner, standing in a van, and the
 * marketing site is not what they want when they tap the icon. Customers reach
 * the portal by link from an email, which is how they actually arrive.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Carr Denzy Plumbing & Gas",
    short_name: "Carr Denzy",
    description:
      "Jobs, quotes and invoices for Carr Denzy Plumbing & Gas — works with no signal.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf7f2",
    theme_color: "#faf7f2",
    lang: "en-GB",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // A separate maskable file, not the same PNG relabelled: Android crops a
      // maskable icon to whatever shape the launcher uses, and a rounded tile
      // reused here loses its corners.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Today", short_name: "Today", url: "/app" },
      { name: "Enquiries", short_name: "Enquiries", url: "/app/enquiries" },
      { name: "Jobs", short_name: "Jobs", url: "/app/jobs" },
    ],
  };
}
