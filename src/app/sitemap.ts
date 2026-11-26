import type { MetadataRoute } from "next";
import { getServices } from "@/lib/services";

/**
 * Only public marketing pages are listed. The portal and the owner app are
 * behind authentication and deliberately excluded — listing them would invite
 * crawlers to hammer routes that always redirect.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const services = await getServices();
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const lastModified = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/services`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/request`, lastModified, changeFrequency: "yearly", priority: 0.9 },
    { url: `${base}/work`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/about`, lastModified, changeFrequency: "yearly", priority: 0.6 },
    { url: `${base}/contact`, lastModified, changeFrequency: "yearly", priority: 0.8 },
    // Privacy and terms are left out on purpose: they carry a noindex tag, and
    // listing a noindex page here makes Search Console report it as an error.
  ];

  const serviceRoutes: MetadataRoute.Sitemap = services.map((service) => ({
    url: `${base}/services/${service.slug}`,
    lastModified,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...serviceRoutes];
}
