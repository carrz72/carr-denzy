import "server-only";

import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { portfolioImageUrl } from "@/lib/portfolio";
import { services as fallbackServices, type ServiceDefinition } from "@/lib/site";
import type { Service } from "@/types/database";

/**
 * The services on the website, from the `services` table the owner edits in
 * Settings → Services. Hidden services are left out.
 *
 * If the database cannot be reached the list in src/lib/site.ts is used, so
 * the site never shows an empty services section.
 */
export const getServices = cache(async (): Promise<ServiceDefinition[]> => {
  try {
    const { data, error } = await createPublicClient()
      .from("services")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return fallbackServices;

    return (data as Service[]).map(toDefinition);
  } catch (error) {
    console.error("[services] could not load, using the built-in list", error);
    return fallbackServices;
  }
});

export async function getServiceBySlug(slug: string): Promise<ServiceDefinition | undefined> {
  return (await getServices()).find((service) => service.slug === slug);
}

function toDefinition(row: Service): ServiceDefinition {
  const fallback = fallbackServices.find((service) => service.slug === row.slug);
  return {
    slug: row.slug,
    name: row.name,
    blurb: row.blurb,
    metaDescription: row.meta_description?.trim() || row.blurb,
    description: row.description?.trim() || row.blurb,
    examples: row.examples?.length ? row.examples : (fallback?.examples ?? []),
    fromPrice: row.from_price?.trim() || undefined,
    icon: row.icon || "Wrench",
    image: row.image_path
      ? portfolioImageUrl(row.image_path)
      : (fallback?.image ?? "/images/work-33.webp"),
  };
}
