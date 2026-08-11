import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { buttonClasses } from "@/components/ui/button";

/**
 * Empty, loading and error states.
 *
 * An empty list showing nothing is the most common unfinished edge in an app
 * like this, and it is where a non-technical owner concludes the software is
 * broken. Every list in this project renders an EmptyState that says what the
 * screen is for and what to do next (spec §1, "the app never shows an empty
 * grid").
 */

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-dashed border-line-strong",
        "bg-surface-raised/60 px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="mb-5 flex size-14 items-center justify-center rounded-xl bg-accent-soft text-accent"
        >
          {icon}
        </div>
      ) : null}

      <h3 className="text-subheading text-ink">{title}</h3>

      <p className="container-prose mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
        {description}
      </p>

      {action || secondaryAction ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action ? (
            <Link href={action.href} className={buttonClasses({ variant: "primary" })}>
              {action.label}
            </Link>
          ) : null}
          {secondaryAction ? (
            <Link href={secondaryAction.href} className={buttonClasses({ variant: "quiet" })}>
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Skeletons shaped like the content they replace.
 *
 * A centred spinner tells the user only that something is happening. A
 * skeleton in the shape of the list tells them what is coming and stops the
 * page jumping when it lands.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-4", index === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-lg border border-line bg-surface-raised p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="mt-2.5 h-4 w-3/5" />
            </div>
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

/**
 * An inline error that offers a way forward. Never a dead end, and never
 * `window.alert()`.
 */
export function ErrorState({
  title = "Something went wrong at our end",
  description = "Nothing you entered was lost. Try again, and if it keeps happening give us a ring on 07934 633583.",
  retry,
  className,
}: {
  title?: string;
  description?: string;
  retry?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-lg border border-critical/25 bg-critical-soft",
        "px-6 py-10 text-center",
        className,
      )}
    >
      <h3 className="text-subheading text-critical">{title}</h3>
      <p className="container-prose mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
        {description}
      </p>
      {retry ? <div className="mt-6">{retry}</div> : null}
    </div>
  );
}
