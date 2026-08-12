import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  PhoneIcon,
  SealCheckIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react/dist/ssr";
import { buttonClasses } from "@/components/ui/button";
import { ServiceIcon } from "@/components/service-icon";
import { business, services } from "@/lib/site";
import { createPublicClient } from "@/lib/supabase/public";
import { portfolioImageUrl } from "@/lib/portfolio";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Plumbers, heating and building repairs across Nottingham",
  description:
    "Gas Safe registered plumbers covering Nottingham and Nottinghamshire. Leaks and repairs, boiler servicing, heating, bathrooms and building work. Send photos of the problem and get a written quote.",
};

/** Matches /work: owner-editable, so revalidated rather than baked in. */
export const revalidate = 3600;

/** The problems people actually search for, in the words they use. */
const commonProblems = [
  { label: "No hot water", service: "gas-and-boilers" },
  { label: "Boiler not firing", service: "gas-and-boilers" },
  { label: "Leak under the sink", service: "leaks-and-repairs" },
  { label: "Radiators staying cold", service: "heating" },
  { label: "Blocked drain", service: "leaks-and-repairs" },
  { label: "Toilet keeps running", service: "leaks-and-repairs" },
  { label: "Annual gas certificate", service: "gas-and-boilers" },
  { label: "New bathroom", service: "bathrooms-and-kitchens" },
];

const steps = [
  {
    title: "Tell us what has happened",
    body: "Two minutes, and you can attach photos straight from your phone. No account needed.",
  },
  {
    title: "We come back with a price",
    body: "A written quote broken down by line, so you can see what you are paying for.",
  },
  {
    title: "We book a time that suits",
    body: "You get a date and an arrival window, not a nine-to-five wait.",
  },
  {
    title: "You see the whole record",
    body: "Photos, notes and invoices stay in your account for whenever you need them.",
  },
];

export default async function HomePage() {
  const [lead, ...rest] = services;

  // Anonymous client on purpose — see src/lib/supabase/public.ts.
  const supabase = createPublicClient();

  // Four is what the grid below is built for. Taking them in the owner's own
  // order means the piece they are proudest of leads, without a "featured"
  // flag to maintain.
  const { data: recentWorkData } = await supabase
    .from("portfolio_items")
    .select("id, after_path, caption, location")
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(4);

  const recentWork = recentWorkData ?? [];

  return (
    <>
      {/* ---------------------------------------------------------------
          Hero. Photography with a warm scrim rather than a flat colour
          block — the imagery is the credibility, and a plumber's site
          that shows no actual work is asking to be distrusted.
          --------------------------------------------------------------- */}
      <section className="relative isolate overflow-hidden">
        <Image
          src="/images/work-33.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover"
        />

        {/* Scrim tinted from the palette's ink, not neutral black, so the
            photograph belongs to the page rather than sitting on top of it. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(21,18,15,0.94)_0%,rgba(21,18,15,0.82)_42%,rgba(21,18,15,0.42)_72%,rgba(21,18,15,0.28)_100%)]"
        />

        <div className="container-page">
          <div className="flex min-h-[max(34rem,72dvh)] flex-col justify-center py-20 md:py-28">
            <div className="max-w-2xl">
              <p className="flex items-center gap-2.5 text-label uppercase text-[#e9d9d3]">
                <SealCheckIcon size={17} weight="fill" className="text-accent" aria-hidden="true" />
                Gas Safe registered · since {business.established}
              </p>

              <h1 className="mt-5 font-display text-[clamp(2.5rem,7vw,4.25rem)] font-bold leading-[1.02] tracking-[-0.035em] text-white">
                When something has gone wrong with the water, the heating or the gas.
              </h1>

              <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-[#ded2ca] sm:text-lg">
                We are plumbers and builders working across Nottingham. Send a photo of the
                problem and we will tell you what it needs and what it costs — before
                anyone turns up at your door.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/request"
                  className={buttonClasses({ size: "lg" })}
                >
                  Describe the problem
                  <ArrowRightIcon size={19} weight="bold" aria-hidden="true" />
                </Link>

                <a
                  href={business.phoneHref}
                  className={cn(
                    buttonClasses({ variant: "secondary", size: "lg" }),
                    "border-white/25 bg-white/10 text-white backdrop-blur-sm",
                    "hover:border-white/40 hover:bg-white/20",
                  )}
                >
                  <PhoneIcon size={19} weight="fill" aria-hidden="true" />
                  <span className="tabular">{business.phone}</span>
                </a>
              </div>

              <ul className="mt-10 flex flex-wrap gap-x-7 gap-y-2.5">
                {[
                  "Same-day emergency call-outs",
                  "Written quotes, no verbal guesses",
                  "Worcester & Bosch accredited",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-[#ded2ca]">
                    <CheckIcon
                      size={16}
                      weight="bold"
                      className="shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Straight into the enquiry. Someone whose boiler died an hour ago
          should not have to read a mission statement to find the form.
          --------------------------------------------------------------- */}
      <section className="border-b border-line bg-surface-raised">
        <div className="container-page py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-display text-heading text-ink">What has happened?</h2>
              <p className="mt-1.5 text-ink-muted">
                Pick the closest one and we will take it from there.
              </p>
            </div>

            <ul className="flex flex-wrap gap-2">
              {commonProblems.map((problem) => (
                <li key={problem.label}>
                  <Link
                    href={`/request?service=${problem.service}&problem=${encodeURIComponent(problem.label)}`}
                    className={cn(
                      "flex min-h-11 items-center rounded-md border border-line bg-surface px-3.5",
                      "text-[0.9375rem] font-medium text-ink",
                      "transition-[border-color,background-color,color] duration-200",
                      "[transition-timing-function:var(--ease-standard)]",
                      "hover:border-accent hover:bg-accent-soft hover:text-accent-ink",
                    )}
                  >
                    {problem.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Services. Deliberately NOT three equal cards in a row — the lead
          service takes a wide tile with imagery, the rest sit in a
          narrower grid. Asymmetry is the point.
          --------------------------------------------------------------- */}
      <section className="section-y" id="services">
        <div className="container-page">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <p className="text-label uppercase text-accent">What we do</p>
              <h2 className="mt-3 font-display text-title text-ink">
                One firm for the pipe, the boiler and the wall you had to open to reach them.
              </h2>
            </div>

            <Link
              href="/services"
              className={cn(buttonClasses({ variant: "link" }), "shrink-0 self-start md:self-end")}
            >
              All services
              <ArrowRightIcon size={17} weight="bold" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {lead ? (
              <Link
                href={`/services/${lead.slug}`}
                className={cn(
                  "group relative isolate flex min-h-80 flex-col justify-end overflow-hidden rounded-xl",
                  "p-7 lg:col-span-2 lg:row-span-2 lg:min-h-[30rem]",
                  "transition-transform duration-300 [transition-timing-function:var(--ease-standard)]",
                  "hover:-translate-y-1",
                )}
              >
                <Image
                  src="/images/work-feature.webp"
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 66vw, 100vw"
                  className="-z-10 object-cover transition-transform duration-700 [transition-timing-function:var(--ease-out-soft)] group-hover:scale-105"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(21,18,15,0.92)_10%,rgba(21,18,15,0.55)_45%,rgba(21,18,15,0.15)_100%)]"
                />

                <span className="flex size-11 items-center justify-center rounded-lg bg-accent text-white">
                  <ServiceIcon name={lead.icon} size={24} weight="fill" />
                </span>

                <h3 className="mt-5 font-display text-heading text-white">{lead.name}</h3>

                <p className="mt-2 max-w-md leading-relaxed text-[#ded2ca]">{lead.blurb}</p>

                <span className="mt-5 inline-flex items-center gap-2 font-medium text-white">
                  See what this covers
                  <ArrowRightIcon
                    size={17}
                    weight="bold"
                    aria-hidden="true"
                    className="transition-transform duration-300 group-hover:translate-x-1"
                  />
                </span>
              </Link>
            ) : null}

            {rest.slice(0, 4).map((service) => (
              <Link
                key={service.slug}
                href={`/services/${service.slug}`}
                className={cn(
                  "group flex flex-col rounded-xl border border-line bg-surface-raised p-6",
                  "shadow-subtle transition-[border-color,box-shadow,transform] duration-200",
                  "[transition-timing-function:var(--ease-standard)]",
                  "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent">
                  <ServiceIcon name={service.icon} size={21} />
                </span>

                <h3 className="mt-4 font-display text-subheading text-ink">{service.name}</h3>

                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                  {service.blurb}
                </p>

                {/* Pinned to the bottom so the arrows form one clean line
                    across the row regardless of how long the blurb runs. */}
                <span className="mt-auto flex items-center gap-1.5 pt-5 text-sm font-medium text-accent">
                  More
                  <ArrowRightIcon
                    size={15}
                    weight="bold"
                    aria-hidden="true"
                    className="transition-transform duration-300 group-hover:translate-x-1"
                  />
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {rest.slice(4).map((service) => (
              <Link
                key={service.slug}
                href={`/services/${service.slug}`}
                className={cn(
                  "group flex items-center gap-3.5 rounded-lg border border-line bg-surface-raised p-5",
                  "transition-[border-color,background-color] duration-200",
                  "[transition-timing-function:var(--ease-standard)]",
                  "hover:border-line-strong hover:bg-surface",
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                  <ServiceIcon name={service.icon} size={21} />
                </span>

                <span className="min-w-0">
                  <span className="block font-medium text-ink">{service.name}</span>
                  <span className="mt-0.5 block text-sm text-ink-muted">{service.blurb}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Credibility. Split, offset, with the image bleeding past the
          text block rather than sitting neatly beside it.
          --------------------------------------------------------------- */}
      <section className="bg-surface-sunken">
        <div className="container-page section-y">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
            <div className="relative">
              <div className="overflow-hidden rounded-xl shadow-lifted">
                <Image
                  src="/images/work-05.webp"
                  alt="A Carr Denzy engineer working on a domestic heating system"
                  width={900}
                  height={700}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="h-full w-full object-cover"
                />
              </div>

              {/* Overlapping panel — depth through layering rather than
                  everything sitting flat side by side. */}
              <div className="relative z-10 -mt-10 ml-6 max-w-xs rounded-lg bg-accent p-6 text-white shadow-lifted sm:-mt-14 sm:ml-10">
                <p className="font-display text-[2.25rem] font-bold leading-none">
                  {new Date().getFullYear() - business.established}
                </p>
                <p className="mt-1.5 text-sm leading-snug text-white/85">
                  years working on Nottingham&apos;s pipework, boilers and buildings
                </p>
              </div>
            </div>

            <div>
              <p className="text-label uppercase text-accent">Why us</p>

              <h2 className="mt-3 font-display text-title text-ink">
                You are told what it needs, not what is easiest to sell you.
              </h2>

              <p className="container-prose mt-5 leading-relaxed text-ink-muted">
                A locked-out boiler is not automatically a new boiler. We diagnose first
                and quote second, in writing, with the parts and the labour listed
                separately. If a repair will hold for another five years, we will say so —
                and if it will not, we will say that too.
              </p>

              <ul className="mt-8 flex flex-col gap-3">
                {business.credentials.map((credential) => (
                  <li key={credential} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive"
                    >
                      <CheckIcon size={14} weight="bold" />
                    </span>
                    <span className="font-medium text-ink">{credential}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/about"
                className={cn(buttonClasses({ variant: "secondary" }), "mt-9")}
              >
                More about how we work
                <ArrowRightIcon size={17} weight="bold" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          How it works
          --------------------------------------------------------------- */}
      <section className="section-y">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="text-label uppercase text-accent">How it works</p>
            <h2 className="mt-3 font-display text-title text-ink">
              Four steps, and you can see all of them from your phone.
            </h2>
          </div>

          <ol className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title} className="relative">
                <span
                  aria-hidden="true"
                  className="font-mono text-sm font-semibold tabular-nums text-accent"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>

                <span
                  aria-hidden="true"
                  className="mt-3 block h-px w-full bg-line"
                />

                <h3 className="mt-5 font-display text-subheading text-ink">{step.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Recent work. Variable heights rather than a uniform grid, so it
          reads as a set of photographs and not a template.
          --------------------------------------------------------------- */}
      <section className="border-y border-line bg-surface-raised">
        <div className="container-page section-y">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <p className="text-label uppercase text-accent">Recent work</p>
              <h2 className="mt-3 font-display text-title text-ink">Jobs we have finished.</h2>
            </div>

            <Link
              href="/work"
              className={cn(buttonClasses({ variant: "link" }), "shrink-0 self-start md:self-end")}
            >
              See more
              <ArrowRightIcon size={17} weight="bold" aria-hidden="true" />
            </Link>
          </div>

          <ul className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recentWork.map((item, index) => (
              <li
                key={item.id}
                className={cn(
                  "group overflow-hidden rounded-lg",
                  // Two of the four are taller. The break in rhythm is what
                  // stops this reading as a stock four-up grid.
                  index % 3 === 0 ? "sm:row-span-2" : "",
                )}
              >
                <figure className="flex h-full flex-col">
                  <div className="relative overflow-hidden rounded-lg">
                    <Image
                      src={portfolioImageUrl(item.after_path)}
                      alt={item.location ? `${item.caption}, ${item.location}` : item.caption}
                      width={600}
                      height={index % 3 === 0 ? 760 : 480}
                      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                      className={cn(
                        "w-full object-cover transition-transform duration-700",
                        "[transition-timing-function:var(--ease-out-soft)] group-hover:scale-105",
                        "motion-reduce:transition-none motion-reduce:group-hover:scale-100",
                        index % 3 === 0 ? "aspect-[3/4]" : "aspect-[4/3]",
                      )}
                    />
                  </div>

                  <figcaption className="mt-3">
                    <span className="block font-medium text-ink">{item.caption}</span>
                    {item.location ? (
                      <span className="mt-0.5 block text-sm text-ink-subtle">
                        {item.location}
                      </span>
                    ) : null}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Closing call to action
          --------------------------------------------------------------- */}
      <section className="section-y">
        <div className="container-page">
          <div className="relative isolate overflow-hidden rounded-2xl bg-surface-inverse px-7 py-14 sm:px-12 sm:py-16">
            <div
              aria-hidden="true"
              className="absolute -right-24 -top-24 -z-10 size-80 rounded-full bg-accent/25 blur-3xl"
            />

            <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
              <div>
                <h2 className="font-display text-title text-white">
                  Tell us what has gone wrong.
                </h2>

                <p className="container-prose mt-4 leading-relaxed text-[#c9bcb2]">
                  It takes about two minutes, you can attach photos, and you do not need
                  to make an account. We usually reply the same working day.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link href="/request" className={buttonClasses({ size: "lg" })}>
                    Request a job
                    <ArrowRightIcon size={19} weight="bold" aria-hidden="true" />
                  </Link>

                  <a
                    href={business.phoneHref}
                    className={cn(
                      buttonClasses({ variant: "secondary", size: "lg" }),
                      "border-white/25 bg-white/10 text-white hover:border-white/40 hover:bg-white/20",
                    )}
                  >
                    <PhoneIcon size={19} weight="fill" aria-hidden="true" />
                    <span className="tabular">{business.phone}</span>
                  </a>
                </div>
              </div>

              <dl className="flex flex-col gap-5 border-t border-white/15 pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
                <div className="flex items-start gap-3">
                  <ClockIcon
                    size={20}
                    className="mt-0.5 shrink-0 text-accent"
                    aria-hidden="true"
                  />
                  <div>
                    <dt className="font-medium text-white">Opening hours</dt>
                    <dd className="mt-0.5 text-sm text-[#c9bcb2]">
                      Mon–Sat {business.hours.weekdays}
                      <br />
                      Sun · {business.hours.sunday}
                      <br />
                      <span className="text-[#a89a8e]">
                        Emergency call-outs Mon–Sat, outside these hours
                      </span>
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <ShieldCheckIcon
                    size={20}
                    className="mt-0.5 shrink-0 text-accent"
                    aria-hidden="true"
                  />
                  <div>
                    <dt className="font-medium text-white">Where we work</dt>
                    <dd className="mt-0.5 text-sm text-[#c9bcb2]">
                      {business.serviceAreas.join(" · ")}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
