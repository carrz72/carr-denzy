import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { buttonClasses } from "@/components/ui/button";
import { BeforeAfter } from "@/components/marketing/before-after";
import { EmptyState } from "@/components/ui/states";
import { createPublicClient } from "@/lib/supabase/public";
import { portfolioImageUrl, isPair } from "@/lib/portfolio";
import { cn } from "@/lib/cn";
import type { PortfolioItem } from "@/types/database";

export const metadata: Metadata = {
  alternates: { canonical: "/work" },
  title: "Our work",
  description:
    "Photographs of completed plumbing, heating, bathroom and building jobs across Nottingham and Nottinghamshire.",
};

/**
 * Revalidated rather than dynamic.
 *
 * The gallery is owner-editable, so it cannot be baked in at build time — but
 * it is also a marketing page that must render fast and keep rendering if
 * Supabase is having a bad afternoon (spec NFR-1). An hour-old photograph of a
 * patio is not a problem; a marketing page that waits on a database is.
 */
export const revalidate = 3600;

export default async function WorkPage() {
  // Anonymous client on purpose — see src/lib/supabase/public.ts. The
  // cookie-reading one would drop this page out of static rendering.
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("portfolio_items")
    .select("id, after_path, before_path, caption, location, sort_order, is_published, created_at, updated_at")
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[work] could not load portfolio", error.message);
  }

  const items: PortfolioItem[] = data ?? [];

  return (
    <>
      <section className="border-b border-line bg-surface-sunken">
        <div className="container-page py-16 md:py-20">
          <p className="text-label uppercase text-accent">Our work</p>

          <h1 className="mt-3 max-w-3xl font-display text-title text-ink">
            Finished jobs, photographed on the day.
          </h1>

          <p className="container-prose mt-5 leading-relaxed text-ink-muted">
            We photograph work as it goes, partly so you can see it and partly because a
            written record settles arguments years later. These are real jobs across
            Nottingham and the surrounding areas.
          </p>
        </div>
      </section>

      <section className="section-y">
        <div className="container-page">
          {items.length === 0 ? (
            <EmptyState
              title="Photographs are on their way"
              description="We are between jobs on the camera. Ring us and we will talk you through work we have done like yours."
              action={{ label: "Describe the problem", href: "/request" }}
              secondaryAction={{ label: "What we do", href: "/services" }}
            />
          ) : (
            /*
             * A two-column grid rather than the old masonry columns.
             *
             * Masonry reflows items into whichever column is shortest, which is
             * exactly wrong here: a before/after pair is one wide, interactive
             * thing and it must not be sliced up or shuffled away from its own
             * caption. A grid keeps reading order and DOM order identical.
             */
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  className={cn(
                    // A pair earns the full width — it is the one thing on this
                    // page worth stopping for.
                    isPair(item) && "md:col-span-2",
                  )}
                >
                  {isPair(item) ? (
                    <PairCard item={item} priority={index === 0} />
                  ) : (
                    <SingleCard item={item} priority={index === 0} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="border-t border-line bg-surface-sunken">
        <div className="container-page py-16 text-center">
          <h2 className="font-display text-heading text-ink">Yours could be next.</h2>

          <p className="container-prose mx-auto mt-3 leading-relaxed text-ink-muted">
            Send us a photo of what you are dealing with and we will tell you what it
            needs.
          </p>

          <Link href="/request" className={cn(buttonClasses({ size: "lg" }), "mt-8")}>
            Describe the problem
            <ArrowRightIcon size={19} weight="bold" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}

function PairCard({
  item,
  priority,
}: {
  item: PortfolioItem & { before_path: string };
  priority: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <BeforeAfter
        beforeSrc={portfolioImageUrl(item.before_path)}
        afterSrc={portfolioImageUrl(item.after_path)}
        caption={item.caption}
        priority={priority}
      />
      {item.location ? (
        <p className="mt-1 text-sm text-ink-subtle">{item.location}</p>
      ) : null}
    </div>
  );
}

function SingleCard({ item, priority }: { item: PortfolioItem; priority: boolean }) {
  return (
    <figure className="group overflow-hidden rounded-xl border border-line bg-surface-raised shadow-subtle">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={portfolioImageUrl(item.after_path)}
          alt={item.location ? `${item.caption}, ${item.location}` : item.caption}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          priority={priority}
          className={cn(
            "object-cover transition-transform duration-700",
            "[transition-timing-function:var(--ease-out-soft)] group-hover:scale-105",
            "motion-reduce:transition-none motion-reduce:group-hover:scale-100",
          )}
        />
      </div>

      <figcaption className="p-5">
        <p className="font-medium text-ink">{item.caption}</p>
        {item.location ? (
          <p className="mt-0.5 text-sm text-ink-subtle">{item.location}</p>
        ) : null}
      </figcaption>
    </figure>
  );
}
