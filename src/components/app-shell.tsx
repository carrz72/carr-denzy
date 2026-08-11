"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SignOutIcon } from "@phosphor-icons/react/dist/ssr";
import { OfflineIndicator } from "@/components/offline-indicator";
import { cn } from "@/lib/cn";

/**
 * The signed-in shell, shared by the portal and the owner app.
 *
 * Bottom navigation on mobile, top navigation on desktop — deliberately not a
 * left sidebar. The owner uses this one-handed on a phone standing in
 * somebody's kitchen; a sidebar puts every destination out of thumb reach, and
 * a hamburger hides them behind an extra tap.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Shown as a count bubble. Omit or pass 0 for none. */
  badge?: number;
}

export function AppShell({
  items,
  brandHref,
  brandLabel,
  userLabel,
  children,
}: {
  items: NavItem[];
  brandHref: string;
  brandLabel: string;
  userLabel: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === brandHref) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      {/* `no-print`: an invoice printed for posting must not carry the app's
          navigation across the top of the page. */}
      <header className="no-print sticky top-0 z-(--z-header) border-b border-line bg-surface-raised/90 backdrop-blur-md">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Link href={brandHref} className="flex items-center gap-2.5">
            <Image
              src="/images/logo-mark.webp"
              alt=""
              aria-hidden="true"
              width={64}
              height={64}
              priority
              className="size-8 shrink-0 object-contain"
            />

            <span className="flex flex-col leading-none">
              <span className="font-display text-[0.9375rem] font-bold tracking-tight text-ink">
                Carr Denzy
              </span>
              <span className="mt-0.5 text-[0.6875rem] text-ink-subtle">{brandLabel}</span>
            </span>
          </Link>

          <nav aria-label="Sections" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-11 items-center gap-2 rounded-md px-3.5 text-[0.9375rem] font-medium",
                      "transition-colors duration-200 [transition-timing-function:var(--ease-standard)]",
                      isActive(item.href)
                        ? "bg-accent-soft text-accent-ink"
                        : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
                    )}
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    {item.label}
                    {item.badge ? <Badge count={item.badge} /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden max-w-40 truncate text-sm text-ink-muted lg:inline">
              {userLabel}
            </span>

            {/* A form, not a link: sign-out must not be triggerable by a
                prefetch or an image request. */}
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-ink-muted",
                  "transition-colors duration-200 hover:bg-surface-sunken hover:text-ink",
                )}
              >
                <SignOutIcon size={18} aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <OfflineIndicator />

      <main id="main" className="flex-1 pb-24 md:pb-0">
        {children}
      </main>

      {/* Mobile bottom bar. `pb-safe` keeps it clear of the iPhone home
          indicator when installed to the home screen. */}
      <nav
        aria-label="Sections"
        className="no-print fixed inset-x-0 bottom-0 z-(--z-header) border-t border-line bg-surface-raised/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex items-stretch">
          {items.map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2",
                  "transition-colors duration-200 [transition-timing-function:var(--ease-standard)]",
                  isActive(item.href) ? "text-accent" : "text-ink-subtle",
                )}
              >
                <span aria-hidden="true" className="relative">
                  {item.icon}
                  {item.badge ? (
                    <span className="absolute -right-2.5 -top-1.5">
                      <Badge count={item.badge} />
                    </span>
                  ) : null}
                </span>

                <span className="text-[0.6875rem] font-medium leading-none">{item.label}</span>

                {isActive(item.href) ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent"
                  />
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[0.6875rem] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

/** A consistent page header for every screen inside the shell. */
export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-8">
      {back ? (
        <Link
          href={back.href}
          className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-accent"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M10 3 5 8l5 5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {back.label}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-title text-ink">{title}</h1>
          {description ? (
            <p className="container-prose mt-2 leading-relaxed text-ink-muted">{description}</p>
          ) : null}
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
