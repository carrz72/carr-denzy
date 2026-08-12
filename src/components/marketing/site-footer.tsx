import Link from "next/link";
import { EnvelopeSimpleIcon, MapPinIcon, PhoneIcon } from "@phosphor-icons/react/dist/ssr";
import { business, services } from "@/lib/site";
import type { BusinessContact } from "@/lib/business";

/**
 * Footer.
 *
 * Not a four-column link farm. A visitor reaching the bottom of a plumber's
 * website wants one of three things: to phone, to know where you work, or to
 * find the page they missed. Everything else is filler that makes those three
 * harder to spot.
 */
export function SiteFooter({ contact }: { contact: BusinessContact }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-line bg-surface-sunken">
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-heading text-ink">Carr Denzy Plumbing &amp; Gas</p>

            <p className="container-prose mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
              Gas Safe registered plumbers and builders working across Nottingham and the
              surrounding counties since {business.established}.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <a
                href={contact.phoneHref}
                className="group inline-flex min-h-11 items-center gap-2.5 self-start font-medium text-ink"
              >
                <PhoneIcon size={19} weight="fill" className="text-accent" aria-hidden="true" />
                <span className="tabular group-hover:underline group-hover:underline-offset-4">
                  {contact.phone}
                </span>
              </a>

              <a
                href={`mailto:${contact.email}`}
                className="group inline-flex min-h-11 items-center gap-2.5 self-start text-ink-muted"
              >
                <EnvelopeSimpleIcon size={19} className="text-accent" aria-hidden="true" />
                <span className="group-hover:underline group-hover:underline-offset-4">
                  {contact.email}
                </span>
              </a>

              <p className="inline-flex items-start gap-2.5 text-ink-muted">
                <MapPinIcon size={19} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                <span>
                  {business.address.city}, {business.address.region}
                </span>
              </p>
            </div>
          </div>

          <nav aria-label="Services">
            <h2 className="text-label uppercase text-ink-subtle">What we do</h2>
            <ul className="mt-4 flex flex-col gap-1">
              {services.slice(0, 6).map((service) => (
                <li key={service.slug}>
                  <Link
                    href={`/services/${service.slug}`}
                    className="flex min-h-9 items-center text-[0.9375rem] text-ink-muted hover:text-accent hover:underline hover:underline-offset-4"
                  >
                    {service.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Company and account">
            <h2 className="text-label uppercase text-ink-subtle">Company</h2>
            <ul className="mt-4 flex flex-col gap-1">
              {[
                { href: "/about", label: "About us" },
                { href: "/work", label: "Our work" },
                { href: "/contact", label: "Contact" },
                { href: "/request", label: "Request a job" },
                // Points at /sign-in rather than /portal deliberately. Linking
                // straight to /portal makes the middleware append
                // `?next=/portal`, and the auth callback honours `next` ahead
                // of the role — so the owner would sign in and land in the
                // customer portal. With no `next`, the callback decides: owner
                // to /app, customer to /portal. One link, right destination.
                { href: "/sign-in", label: "Sign in" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="flex min-h-9 items-center text-[0.9375rem] text-ink-muted hover:text-accent hover:underline hover:underline-offset-4"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-subtle">
            © {year} {contact.name}. Gas Safe registered.
          </p>

          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <li>
              <Link
                href="/privacy"
                className="flex min-h-9 items-center text-sm text-ink-subtle hover:text-ink hover:underline hover:underline-offset-4"
              >
                Privacy
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                className="flex min-h-9 items-center text-sm text-ink-subtle hover:text-ink hover:underline hover:underline-offset-4"
              >
                Terms
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
