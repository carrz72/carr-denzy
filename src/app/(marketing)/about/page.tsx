import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { buttonClasses } from "@/components/ui/button";
import { business } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  title: "About us",
  description:
    "Gas Safe registered plumbers and builders working across Nottingham since 2004. How we quote, how we work, and what you can expect.",
};

const principles = [
  {
    title: "Diagnose before quoting",
    body: "A boiler that has locked out is not automatically a boiler that needs replacing. We find out what is actually wrong first, and tell you if the cheaper answer is the right one.",
  },
  {
    title: "Written prices, line by line",
    body: "Labour and parts listed separately, so you can see what you are paying for. The quoted figure is the figure, unless something turns up behind a wall that nobody could have known about — and you hear about that before we carry on.",
  },
  {
    title: "We finish what we opened",
    body: "If we cut into a wall or lifted a floor to reach a pipe, we put it back. You should not have to find a plasterer to complete our job.",
  },
  {
    title: "The record stays yours",
    body: "Every photograph, note, quote and invoice stays in your account. When you sell the house or a new tenant asks, the history is there.",
  },
];

export default function AboutPage() {
  const years = new Date().getFullYear() - business.established;

  return (
    <>
      <section className="border-b border-line bg-surface-sunken">
        <div className="container-page py-16 md:py-20">
          <p className="text-label uppercase text-accent">About us</p>

          <h1 className="mt-3 max-w-3xl font-display text-title text-ink">
            {years} years of other people&apos;s emergencies.
          </h1>

          <p className="container-prose mt-5 text-lg leading-relaxed text-ink-muted">
            Carr Denzy started as one van and a mobile number. It is now a small team of
            Gas Safe registered engineers and builders working across Nottingham, and the way
            we work has not really changed: turn up when we said, explain what we found,
            and charge what we quoted.
          </p>
        </div>
      </section>

      <section className="section-y">
        <div className="container-page">
          <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
            <div className="relative">
              <div className="overflow-hidden rounded-xl shadow-lifted">
                <Image
                  src="/images/work-05.webp"
                  alt="A Carr Denzy engineer working on a domestic heating system"
                  width={900}
                  height={1100}
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  className="aspect-[4/5] w-full object-cover"
                />
              </div>

              <div className="relative z-10 -mt-12 ml-6 max-w-[17rem] rounded-lg bg-surface-inverse p-6 text-white shadow-lifted sm:ml-10">
                <p className="text-label uppercase text-white/60">Credentials</p>

                <ul className="mt-3 flex flex-col gap-2.5">
                  {business.credentials.map((credential) => (
                    <li key={credential} className="flex items-start gap-2.5 text-sm">
                      <CheckIcon
                        size={15}
                        weight="bold"
                        className="mt-0.5 shrink-0 text-accent"
                        aria-hidden="true"
                      />
                      <span className="text-white/85">{credential}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div>
              <h2 className="font-display text-heading text-ink">How we work</h2>

              <ul className="mt-8 flex flex-col gap-8">
                {principles.map((principle, index) => (
                  <li key={principle.title} className="border-l-2 border-accent pl-6">
                    <span
                      aria-hidden="true"
                      className="font-mono text-sm font-semibold tabular-nums text-accent"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <h3 className="mt-1.5 font-display text-subheading text-ink">
                      {principle.title}
                    </h3>

                    <p className="container-prose mt-2 leading-relaxed text-ink-muted">
                      {principle.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-surface-sunken">
        <div className="container-page py-16">
          <div className="grid gap-10 md:grid-cols-3">
            <div>
              <h2 className="font-display text-subheading text-ink">Where we work</h2>
              <p className="mt-2 leading-relaxed text-ink-muted">
                {business.serviceAreas.join(", ")}. If you are just outside that, ring and
                ask — we will tell you honestly whether it is worth our travelling.
              </p>
            </div>

            <div>
              <h2 className="font-display text-subheading text-ink">Opening hours</h2>
              <dl className="mt-2 flex flex-col gap-1 text-ink-muted">
                <div className="flex justify-between gap-4">
                  <dt>Monday to Saturday</dt>
                  <dd className="tabular text-ink">{business.hours.weekdays}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Sunday</dt>
                  <dd className="text-ink">{business.hours.sunday}</dd>
                </div>
              </dl>

              <p className="mt-3 leading-relaxed">
                Emergency call-outs run outside those hours Monday to Saturday. We do not
                attend on Sundays — if you send the form we will pick it up first thing
                Monday.
              </p>
            </div>

            <div>
              <h2 className="font-display text-subheading text-ink">Insurance</h2>
              <p className="mt-2 leading-relaxed text-ink-muted">
                Public liability cover to £5m, and every gas engineer on the team carries a
                current Gas Safe ID card. Ask to see it at the door — a genuine engineer
                will expect you to.
              </p>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-start gap-3 border-t border-line pt-10 sm:flex-row">
            <Link href="/request" className={buttonClasses({ size: "lg" })}>
              Request a job
              <ArrowRightIcon size={19} weight="bold" aria-hidden="true" />
            </Link>

            <Link href="/contact" className={buttonClasses({ variant: "secondary", size: "lg" })}>
              Get in touch
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
