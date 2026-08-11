"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Button, buttonClasses } from "@/components/ui/button";
import { business } from "@/lib/site";
import { cn } from "@/lib/cn";

/**
 * The shared error boundary body.
 *
 * Without an `error.tsx`, an unhandled throw in any server component takes out
 * the whole route and the user gets Next's default grey screen — no navigation,
 * no way back, and nothing that tells a plumber standing in a customer's
 * kitchen what to do next.
 *
 * Three rules here:
 *   * Never show the raw error. It leaks internals and means nothing to the
 *     reader. The digest is shown small, because it is the one thing that
 *     makes a support call diagnosable.
 *   * Always offer a way forward — retry, and a link out of the dead end.
 *   * Say plainly that their data is safe. The most common reaction to an
 *     error screen mid-invoice is to assume the work was lost.
 */
export function RouteError({
  error,
  reset,
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: string;
  homeLabel: string;
}) {
  useEffect(() => {
    // Server errors are already logged server-side; this catches the client
    // half, which otherwise disappears silently.
    console.error("[route error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <span
        aria-hidden="true"
        className="mx-auto flex size-14 items-center justify-center rounded-xl bg-critical-soft text-critical"
      >
        <WarningCircleIcon size={30} weight="fill" />
      </span>

      <h1 className="mt-6 font-display text-title text-ink">
        That screen would not load.
      </h1>

      <p className="mt-4 leading-relaxed text-ink-muted">
        Something went wrong at our end, not yours. Nothing you had saved has been
        lost. Try again — it usually works second time.
      </p>

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button size="lg" onClick={reset} icon={<ArrowClockwiseIcon size={19} weight="bold" />}>
          Try again
        </Button>

        <Link href={homeHref} className={buttonClasses({ variant: "secondary", size: "lg" })}>
          {homeLabel}
        </Link>
      </div>

      <p className={cn("mt-8 text-sm leading-relaxed text-ink-subtle")}>
        Still stuck? Ring{" "}
        <a
          href={business.phoneHref}
          className="font-medium tabular text-ink underline underline-offset-4"
        >
          {business.phone}
        </a>
        .
        {error.digest ? (
          <>
            {" "}
            Quote reference{" "}
            <span className="font-mono text-xs tabular-nums">{error.digest}</span>.
          </>
        ) : null}
      </p>
    </div>
  );
}
