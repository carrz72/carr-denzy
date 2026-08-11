"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ListIcon, PhoneIcon, SignInIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";
import { business } from "@/lib/site";
import { buttonClasses } from "@/components/ui/button";

const links = [
  { href: "/", label: "Home" },
  { href: "/services", label: "What we do" },
  { href: "/work", label: "Our work" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Route change closes the menu. Without this, tapping a link on mobile
  // navigates but leaves the overlay covering the page you just asked for.
  //
  // This alone is NOT enough: tapping the link for the page you are already on
  // does not change `pathname`, so the effect never fires and the menu stays
  // open with the page behind it still scroll-locked — which reads as "the
  // menu is broken". Every link therefore also closes the menu on click; this
  // effect remains as the backstop for browser back/forward.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // While the overlay is open the page behind it must not scroll.
  //
  // The previous value is captured and restored rather than being blanked,
  // because this header is not the only thing that touches body overflow — a
  // blanket reset here would silently unlock a dialog's scroll lock.
  useEffect(() => {
    if (!menuOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-(--z-header) border-b border-line/70 bg-surface/85 backdrop-blur-md">
      <div className="container-page">
        <div className="flex h-(--header-height) items-center justify-between gap-6">
          <Link
            href="/"
            className="group flex items-center gap-2.5 rounded-sm"
            aria-label={`${business.name} — home`}
          >
            {/* The business's own mark — a tap over a gas flame. It carries its
                own red and its own transparency, so it needs no tile behind it. */}
            <Image
              src="/images/logo-mark.webp"
              alt=""
              aria-hidden="true"
              width={72}
              height={72}
              priority
              className="size-9 shrink-0 object-contain"
            />

            <span className="flex flex-col leading-none">
              <span className="font-display text-[1.0625rem] font-bold tracking-tight text-ink">
                Carr Denzy
              </span>
              <span className="mt-0.5 text-[0.6875rem] font-medium tracking-wide text-ink-subtle">
                Plumbing &amp; Gas
              </span>
            </span>
          </Link>

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isActive(link.href) ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-11 items-center rounded-md px-3.5 text-[0.9375rem] font-medium",
                      "transition-colors duration-200 [transition-timing-function:var(--ease-standard)]",
                      isActive(link.href)
                        ? "text-ink"
                        : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
                    )}
                  >
                    {link.label}
                    {/* The current page is marked, so nobody has to guess where
                        they are (spec: "no indication of current page"). */}
                    {isActive(link.href) ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-3.5 bottom-1.5 h-0.5 rounded-full bg-accent"
                      />
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={business.phoneHref}
              className={cn(
                "hidden min-h-11 items-center gap-2 rounded-md px-3 font-medium text-ink",
                "transition-colors duration-200 hover:bg-surface-sunken sm:flex",
              )}
            >
              <PhoneIcon size={18} weight="fill" className="text-accent" aria-hidden="true" />
              <span className="tabular">{business.phone}</span>
            </a>

            {/*
              Only from `lg`, where the hamburger disappears and takes the
              mobile menu's sign-in link with it. Deliberately quiet — a
              returning customer knows to look for it, and it must not compete
              with the one thing this header is actually for.
            */}
            <Link
              href="/sign-in"
              className={cn(
                "hidden min-h-11 items-center gap-2 rounded-md px-3 font-medium text-ink-muted",
                "transition-colors duration-200 hover:bg-surface-sunken hover:text-ink lg:flex",
              )}
            >
              <SignInIcon size={18} aria-hidden="true" />
              Sign in
            </Link>

            <Link href="/request" className={buttonClasses({ size: "sm" })}>
              Request a job
            </Link>

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className={cn(
                "flex size-11 items-center justify-center rounded-md text-ink lg:hidden",
                "transition-colors duration-200 hover:bg-surface-sunken",
              )}
            >
              <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
              {menuOpen ? (
                <XIcon size={24} aria-hidden="true" />
              ) : (
                <ListIcon size={24} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {menuOpen ? (
        <div
          id="mobile-menu"
          className="animate-panel border-t border-line bg-surface-raised lg:hidden"
        >
          <nav aria-label="Main, mobile" className="container-page py-4">
            <ul className="flex flex-col">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    // Closing here, not only in the pathname effect, is what
                    // makes tapping the current page's own link work.
                    onClick={() => setMenuOpen(false)}
                    aria-current={isActive(link.href) ? "page" : undefined}
                    className={cn(
                      "flex min-h-14 items-center justify-between border-b border-line/70 text-lg font-medium",
                      isActive(link.href) ? "text-accent" : "text-ink",
                    )}
                  >
                    {link.label}
                    {isActive(link.href) ? (
                      <span className="text-sm font-normal text-ink-subtle">You are here</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>

            {/*
              Sign in sits above the phone number deliberately. Somebody opening
              this menu to check a quote or a booked date should not have to
              read past a call-to-action to find their own account — and it is
              the same link for the owner, who lands in the business app instead
              of the portal.
            */}
            <Link
              href="/sign-in"
              onClick={() => setMenuOpen(false)}
              className={cn(buttonClasses({ variant: "secondary", fullWidth: true }), "mt-5")}
            >
              <SignInIcon size={19} className="text-accent" aria-hidden="true" />
              Sign in
            </Link>

            <a
              href={business.phoneHref}
              // Dialling leaves the page; without this the menu is still open
              // and the body still locked when they come back from the call.
              onClick={() => setMenuOpen(false)}
              className={cn(buttonClasses({ variant: "secondary", fullWidth: true }), "mt-2.5")}
            >
              <PhoneIcon size={19} weight="fill" className="text-accent" aria-hidden="true" />
              Call {business.phone}
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
