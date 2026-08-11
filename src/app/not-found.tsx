import Link from "next/link";
import { ArrowRightIcon, PhoneIcon } from "@phosphor-icons/react/dist/ssr";
import { buttonClasses } from "@/components/ui/button";
import { business, services } from "@/lib/site";
import { cn } from "@/lib/cn";

/**
 * 404.
 *
 * Branded and useful rather than a bare "Not found". Someone landing here has
 * followed a stale link or mistyped, and the job of this page is to get them
 * back to the thing they wanted in one tap — including the phone number, since
 * a proportion of the people who reach it have a leak running right now.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main id="main" className="flex flex-1 items-center">
        <div className="container-page py-20">
          <div className="max-w-2xl">
            <p className="font-mono text-sm font-semibold tabular-nums text-accent">404</p>

            <h1 className="mt-3 font-display text-title text-ink">
              That page has gone missing.
            </h1>

            <p className="container-prose mt-4 text-lg leading-relaxed text-ink-muted">
              The link may be out of date, or the address may have a typo in it. Nothing
              you were doing has been lost.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/" className={buttonClasses({ size: "lg" })}>
                Back to the home page
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

            <div className="mt-14 border-t border-line pt-8">
              <h2 className="text-label uppercase text-ink-subtle">
                Or pick up where you left off
              </h2>

              <ul className="mt-4 flex flex-wrap gap-2">
                {[
                  { href: "/request", label: "Request a job" },
                  { href: "/services", label: "What we do" },
                  { href: "/work", label: "Our work" },
                  { href: "/contact", label: "Contact" },
                  { href: "/sign-in", label: "Sign in" },
                  ...services.slice(0, 3).map((service) => ({
                    href: `/services/${service.slug}`,
                    label: service.name,
                  })),
                ].map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "flex min-h-11 items-center rounded-md border border-line bg-surface-raised px-3.5",
                        "text-[0.9375rem] font-medium text-ink",
                        "transition-[border-color,background-color,color] duration-200",
                        "[transition-timing-function:var(--ease-standard)]",
                        "hover:border-accent hover:bg-accent-soft hover:text-accent-ink",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
