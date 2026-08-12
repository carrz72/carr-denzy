import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRightIcon,
  ClockIcon,
  EnvelopeSimpleIcon,
  MapPinIcon,
  PhoneIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import { buttonClasses } from "@/components/ui/button";
import { business } from "@/lib/site";
import { getBusiness } from "@/lib/business";
import { cn } from "@/lib/cn";

/**
 * Built at request time rather than declared as a constant, because the phone
 * number lives in Settings. This description is what Google prints under the
 * result — a stale number here sends callers to a dead line, and nobody would
 * notice for months.
 */
export async function generateMetadata(): Promise<Metadata> {
  const contact = await getBusiness();

  return {
    title: "Contact",
    description: `Call ${contact.name} on ${contact.phone}, or send details of the job with photos. Covering Nottingham and the surrounding areas.`,
  };
}

export default async function ContactPage() {
  const contact = await getBusiness();

  return (
    <section className="section-y">
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
          <div>
            <p className="text-label uppercase text-accent">Contact</p>

            <h1 className="mt-3 font-display text-title text-ink">
              Ring us, or send the details.
            </h1>

            <p className="container-prose mt-5 leading-relaxed text-ink-muted">
              For anything urgent, the phone is faster and someone will answer it. For
              everything else, sending photos through the job form gets you a more useful
              answer than a phone call can — we can see what you are describing.
            </p>

            <div className="mt-10 flex flex-col gap-3">
              <a
                href={contact.phoneHref}
                className={cn(
                  "flex items-start gap-4 rounded-xl border border-line bg-surface-raised p-5",
                  "shadow-subtle transition-[border-color,box-shadow,transform] duration-200",
                  "[transition-timing-function:var(--ease-standard)]",
                  "hover:-translate-y-0.5 hover:border-accent hover:shadow-float",
                )}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
                  <PhoneIcon size={22} weight="fill" aria-hidden="true" />
                </span>

                <span>
                  <span className="block text-sm text-ink-muted">Call us</span>
                  <span className="mt-0.5 block font-display text-subheading tabular text-ink">
                    {contact.phone}
                  </span>
                </span>
              </a>

              <a
                href={`mailto:${contact.email}`}
                className={cn(
                  "flex items-start gap-4 rounded-xl border border-line bg-surface-raised p-5",
                  "shadow-subtle transition-[border-color,box-shadow,transform] duration-200",
                  "[transition-timing-function:var(--ease-standard)]",
                  "hover:-translate-y-0.5 hover:border-accent hover:shadow-float",
                )}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <EnvelopeSimpleIcon size={22} aria-hidden="true" />
                </span>

                <span className="min-w-0">
                  <span className="block text-sm text-ink-muted">Email us</span>
                  <span className="mt-0.5 block break-words font-medium text-ink">
                    {contact.email}
                  </span>
                </span>
              </a>

              <div className="flex items-start gap-4 rounded-xl border border-line bg-surface-raised p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <MapPinIcon size={22} aria-hidden="true" />
                </span>

                <div>
                  <p className="text-sm text-ink-muted">Where we work</p>
                  <address className="mt-0.5 font-medium not-italic text-ink">
                    {business.address.city}, {business.address.region}
                  </address>
                  <p className="mt-2 text-sm text-ink-subtle">
                    Covering {business.serviceAreas.join(", ")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 rounded-xl border border-line bg-surface-raised p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <ClockIcon size={22} aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-muted">Opening hours</p>
                  <dl className="mt-1.5 flex flex-col gap-1">
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-muted">Mon–Sat</dt>
                      <dd className="tabular font-medium text-ink">{business.hours.weekdays}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-muted">Sunday</dt>
                      <dd className="font-medium text-ink">{business.hours.sunday}</dd>
                    </div>
                  </dl>

                  <p className="mt-2.5 text-sm leading-relaxed text-ink-subtle">
                    Emergency call-outs run outside these hours Monday to Saturday. We do
                    not attend on Sundays.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:pt-16">
            <div className="rounded-2xl border border-accent-line bg-accent-soft p-7 sm:p-9">
              <h2 className="font-display text-heading text-accent-ink">
                Get a written quote
              </h2>

              <p className="container-prose mt-3 leading-relaxed text-ink">
                The job form takes about two minutes. You describe what has happened,
                attach photos straight from your phone, and tell us how urgent it is. You
                do not need to create an account, and you get a reference number
                immediately.
              </p>

              <ul className="mt-6 flex flex-col gap-2.5">
                {[
                  "No account needed",
                  "Photos attach straight from your camera",
                  "Reference number on the spot",
                  "Reply usually the same working day",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[0.9375rem] text-ink">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-accent"
                    />
                    {item}
                  </li>
                ))}
              </ul>

              <Link
                href="/request"
                className={cn(buttonClasses({ size: "lg", fullWidth: true }), "mt-8")}
              >
                Start the job form
                <ArrowRightIcon size={19} weight="bold" aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-6 flex items-start gap-3.5 rounded-xl border border-caution/30 bg-caution-soft p-5">
              <WarningIcon
                size={22}
                weight="fill"
                className="mt-0.5 shrink-0 text-caution"
                aria-hidden="true"
              />

              <div>
                <p className="font-medium text-caution-ink">If you can smell gas</p>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink">
                  Do not use the form and do not ring us first. Call the National Gas
                  Emergency Service on{" "}
                  <a href="tel:0800111999" className="font-semibold underline underline-offset-4">
                    0800 111 999
                  </a>
                  , open the windows, and do not touch any electrical switches.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
