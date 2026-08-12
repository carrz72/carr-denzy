import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, PhoneIcon } from "@phosphor-icons/react/dist/ssr";
import { buttonClasses } from "@/components/ui/button";
import { ServiceIcon } from "@/components/service-icon";
import { business, getService, services } from "@/lib/site";
import { getBusiness } from "@/lib/business";
import { cn } from "@/lib/cn";

// Eight services, known at build time — every one is a static page.
export function generateStaticParams() {
  return services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = getService(slug);

  if (!service) return { title: "Service not found" };

  return {
    title: service.name,
    description: service.blurb,
    openGraph: { title: `${service.name} · Carr Denzy`, description: service.blurb },
  };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const contact = await getBusiness();

  const { slug } = await params;
  const service = getService(slug);

  if (!service) notFound();

  const others = services.filter((item) => item.slug !== service.slug).slice(0, 3);

  return (
    <>
      <section className="border-b border-line bg-surface-sunken">
        <div className="container-page py-14 md:py-16">
          {/* Every page has a way back. A detail page that dead-ends is where
              a non-technical visitor reaches for the browser's back button and
              loses their place. */}
          <Link
            href="/services"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-accent"
          >
            <ArrowLeftIcon size={16} weight="bold" aria-hidden="true" />
            All services
          </Link>

          <div className="mt-6 grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
            <div>
              <span className="flex size-14 items-center justify-center rounded-lg bg-accent text-white shadow-raised">
                <ServiceIcon name={service.icon} size={28} weight="fill" />
              </span>

              <h1 className="mt-6 font-display text-title text-ink">{service.name}</h1>

              <p className="container-prose mt-4 text-lg leading-relaxed text-ink-muted">
                {service.blurb}
              </p>
            </div>

            <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-line bg-surface-raised p-10 shadow-subtle">
              <Image
                src={service.image}
                alt=""
                width={260}
                height={260}
                className="h-full w-full object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="section-y">
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr] lg:gap-20">
            <div>
              <p className="container-prose text-lg leading-relaxed text-ink">
                {service.description}
              </p>

              <h2 className="mt-12 font-display text-heading text-ink">
                What this typically covers
              </h2>

              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {service.examples.map((example) => (
                  <li
                    key={example}
                    className="flex items-start gap-3 rounded-lg border border-line bg-surface-raised p-4"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive"
                    >
                      <CheckIcon size={12} weight="bold" />
                    </span>
                    <span className="text-[0.9375rem] text-ink">{example}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-12 rounded-xl border border-accent-line bg-accent-soft p-7">
                <h2 className="font-display text-subheading text-accent-ink">
                  How pricing works
                </h2>

                <p className="container-prose mt-3 leading-relaxed text-ink">
                  We do not quote a price over the phone for work we have not seen — a
                  number given blind is either padded to be safe or gets revised upwards
                  on the day, and neither is fair on you. Send photos, we will give you a
                  written quote with labour and parts listed separately, and that is the
                  figure you pay unless something is found behind a wall that nobody could
                  have known about. If that happens, you hear about it before we carry on,
                  not on the invoice.
                </p>
              </div>
            </div>

            <aside className="lg:sticky lg:top-28 lg:self-start">
              <div className="rounded-xl border border-line bg-surface-raised p-6 shadow-raised">
                <h2 className="font-display text-subheading text-ink">
                  Need this doing?
                </h2>

                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
                  Describe it, attach a photo or two, and we will come back to you — usually
                  the same working day.
                </p>

                <Link
                  href={`/request?service=${service.slug}`}
                  className={cn(buttonClasses({ fullWidth: true }), "mt-5")}
                >
                  Request this job
                  <ArrowRightIcon size={17} weight="bold" aria-hidden="true" />
                </Link>

                <a
                  href={contact.phoneHref}
                  className={cn(
                    buttonClasses({ variant: "secondary", fullWidth: true }),
                    "mt-2.5",
                  )}
                >
                  <PhoneIcon size={18} weight="fill" className="text-accent" aria-hidden="true" />
                  <span className="tabular">{contact.phone}</span>
                </a>

                <p className="mt-5 border-t border-line pt-5 text-sm leading-relaxed text-ink-subtle">
                  Emergency? Call rather than send a form — we monitor the phone outside
                  office hours and the inbox less closely.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-surface-sunken">
        <div className="container-page py-16">
          <h2 className="font-display text-heading text-ink">We also do</h2>

          <ul className="mt-7 grid gap-4 sm:grid-cols-3">
            {others.map((other) => (
              <li key={other.slug}>
                <Link
                  href={`/services/${other.slug}`}
                  className={cn(
                    "group flex h-full flex-col rounded-lg border border-line bg-surface-raised p-5",
                    "transition-[border-color,box-shadow,transform] duration-200",
                    "[transition-timing-function:var(--ease-standard)]",
                    "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
                  )}
                >
                  <span className="flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent">
                    <ServiceIcon name={other.icon} size={21} />
                  </span>

                  <span className="mt-4 block font-display text-subheading text-ink">
                    {other.name}
                  </span>

                  <span className="mt-1.5 block text-sm leading-relaxed text-ink-muted">
                    {other.blurb}
                  </span>

                  <span className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-medium text-accent">
                    More
                    <ArrowRightIcon
                      size={15}
                      weight="bold"
                      aria-hidden="true"
                      className="transition-transform duration-300 group-hover:translate-x-1"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
