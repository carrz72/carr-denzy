import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, PhoneIcon } from "@phosphor-icons/react/dist/ssr";
import { buttonClasses } from "@/components/ui/button";
import { ServiceIcon } from "@/components/service-icon";
import { business, services } from "@/lib/site";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "What we do",
  description:
    "Plumbing, gas and boilers, heating, bathrooms, electrical, building repairs, property maintenance and extensions across Nottingham.",
};

export default function ServicesPage() {
  return (
    <>
      <section className="border-b border-line bg-surface-sunken">
        <div className="container-page py-16 md:py-20">
          <p className="text-label uppercase text-accent">What we do</p>

          <h1 className="mt-3 max-w-3xl font-display text-title text-ink">
            Eight things, and the overlap between them is the point.
          </h1>

          <p className="container-prose mt-5 leading-relaxed text-ink-muted">
            Most jobs cross more than one trade. A leak behind a wall needs a plumber, a
            plasterer and sometimes an electrician — and the usual result is three
            contractors, three quotes and a month of waiting. We do all of it.
          </p>
        </div>
      </section>

      <section className="section-y">
        <div className="container-page">
          {/* Alternating sides rather than a uniform card grid, so the eye
              travels down the page instead of scanning a table. */}
          <ul className="flex flex-col gap-16 md:gap-24">
            {services.map((service, index) => (
              <li
                key={service.slug}
                className={cn(
                  "grid items-center gap-8 md:grid-cols-2 md:gap-14",
                  index % 2 === 1 && "md:[&>*:first-child]:order-2",
                )}
              >
                <div className="relative">
                  <div
                    className={cn(
                      "flex aspect-[5/4] items-center justify-center overflow-hidden rounded-xl",
                      "border border-line bg-surface-raised p-12 shadow-subtle",
                    )}
                  >
                    <Image
                      src={service.image}
                      alt=""
                      width={320}
                      height={320}
                      sizes="(min-width: 768px) 40vw, 80vw"
                      className="h-full w-full object-contain"
                    />
                  </div>

                  <span
                    aria-hidden="true"
                    className="absolute -bottom-4 left-6 flex size-14 items-center justify-center rounded-lg bg-accent text-white shadow-float"
                  >
                    <ServiceIcon name={service.icon} size={28} weight="fill" />
                  </span>
                </div>

                <div>
                  <h2 className="font-display text-heading text-ink">{service.name}</h2>

                  <p className="container-prose mt-3 leading-relaxed text-ink-muted">
                    {service.description}
                  </p>

                  <ul className="mt-6 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    {service.examples.map((example) => (
                      <li
                        key={example}
                        className="flex items-start gap-2.5 text-[0.9375rem] text-ink"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-accent"
                        />
                        {example}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <Link
                      href={`/request?service=${service.slug}`}
                      className={buttonClasses({ variant: "secondary" })}
                    >
                      Request this
                      <ArrowRightIcon size={17} weight="bold" aria-hidden="true" />
                    </Link>

                    <Link
                      href={`/services/${service.slug}`}
                      className={buttonClasses({ variant: "link" })}
                    >
                      Read more
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-line bg-surface-sunken">
        <div className="container-page py-16 text-center">
          <h2 className="font-display text-heading text-ink">Not sure which one it is?</h2>

          <p className="container-prose mx-auto mt-3 leading-relaxed text-ink-muted">
            That is normal, and it is our job to work out rather than yours. Describe what
            you can see and we will tell you what it needs.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/request" className={buttonClasses({ size: "lg" })}>
              Describe the problem
              <ArrowRightIcon size={19} weight="bold" aria-hidden="true" />
            </Link>

            <a
              href={business.phoneHref}
              className={buttonClasses({ variant: "secondary", size: "lg" })}
            >
              <PhoneIcon size={19} weight="fill" className="text-accent" aria-hidden="true" />
              <span className="tabular">{business.phone}</span>
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
