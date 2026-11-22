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
import type { PortfolioCategory, PortfolioItem } from "@/types/database";

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

  const [{ data, error }, { data: categoryData }] = await Promise.all([
    supabase
      .from("portfolio_items")
      .select("id, after_path, before_path, caption, location, category_id, sort_order, is_published, created_at, updated_at")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("portfolio_categories")
      .select("id, name, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (error) {
    console.error("[work] could not load portfolio", error.message);
  }

  const items: PortfolioItem[] = data ?? [];
  const sections = groupByCategory(items, categoryData ?? []);
  // A heading on its own above every photo adds nothing until there are two.
  const showHeadings = sections.length > 1 || (sections.length === 1 && sections[0]?.id !== "other");

  return (
    <>
      <section className="border-b border-line bg-surface-sunken">
        <div className="container-page py-16 md:py-20">
          <h1 className="max-w-3xl font-display text-title text-ink">
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
            <>
              {showHeadings && sections.length > 1 ? (
                <nav aria-label="Jump to a type of work" className="mb-10 flex flex-wrap gap-2">
                  {sections.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.anchor}`}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-full border border-line bg-surface-raised px-4",
                        "text-sm font-medium text-ink-muted transition-colors duration-200",
                        "hover:border-ink-subtle hover:text-ink",
                      )}
                    >
                      {section.name}
                      <span className="ml-1.5 text-ink-subtle">{section.items.length}</span>
                    </a>
                  ))}
                </nav>
              ) : null}

              <div className="flex flex-col gap-16">
                {sections.map((section, sectionIndex) => (
                  <section
                    key={section.id}
                    id={section.anchor}
                    aria-labelledby={showHeadings ? `${section.anchor}-heading` : undefined}
                    className="scroll-mt-24"
                  >
                    {showHeadings ? (
                      <h2
                        id={`${section.anchor}-heading`}
                        className="mb-6 font-display text-heading text-ink"
                      >
                        {section.name}
                      </h2>
                    ) : null}

                    <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
                      {section.items.map((item, index) => {
                        const priority = sectionIndex === 0 && index === 0;
                        return (
                          <li
                            key={item.id}
                            className={cn(
                              // A pair earns the full width — it is the one thing
                              // on this page worth stopping for.
                              isPair(item) && "md:col-span-2",
                            )}
                          >
                            {isPair(item) ? (
                              <PairCard item={item} priority={priority} />
                            ) : (
                              <SingleCard item={item} priority={priority} />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </>
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

type Section = { id: string; name: string; anchor: string; items: PortfolioItem[] };

/**
 * Photos under the owner's category headings, in the owner's order. Empty
 * categories are left out; anything without a (surviving) category goes last
 * under "Other work".
 */
function groupByCategory(items: PortfolioItem[], categories: PortfolioCategory[]): Section[] {
  const used = new Set<string>();
  const anchorFor = (name: string) => {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "work";
    let anchor = base;
    for (let n = 2; used.has(anchor); n++) anchor = `${base}-${n}`;
    used.add(anchor);
    return anchor;
  };

  const known = new Set(categories.map((category) => category.id));
  const sections: Section[] = categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      anchor: "",
      items: items.filter((item) => item.category_id === category.id),
    }))
    .filter((section) => section.items.length > 0);

  const other = items.filter((item) => !item.category_id || !known.has(item.category_id));
  if (other.length > 0) sections.push({ id: "other", name: "Other work", anchor: "", items: other });

  return sections.map((section) => ({ ...section, anchor: anchorFor(section.name) }));
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
