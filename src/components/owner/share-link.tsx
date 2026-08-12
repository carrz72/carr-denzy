"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, LinkSimpleIcon, ShareNetworkIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Hands the owner the public link for a quote or invoice.
 *
 * The reason this exists: a large share of this business's customers are taken
 * over the phone and never give an email address. Emailing them the quote is
 * not an option, but texting or WhatsApping a link is — that is how the trade
 * actually works. Without this, a quote for a phone-only customer could be
 * built and then never delivered.
 *
 * On a phone it offers the native share sheet, which puts Messages and
 * WhatsApp one tap away. Everywhere else it copies to the clipboard. Both fall
 * back to a selectable text field, because `navigator.clipboard` is unavailable
 * over plain http and silently rejects in some embedded browsers — and a
 * "Copy" button that does nothing is worse than no button.
 */
export function ShareLink({
  path,
  label = "Link for the customer",
  hint,
  shareTitle,
}: {
  /** Site-relative, e.g. `/quotes/view/<id>`. */
  path: string;
  label?: string;
  hint?: string;
  shareTitle?: string;
}) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [fallback, setFallback] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Built on the client so the link always carries whatever origin the owner is
  // actually on — a value baked in at render would be wrong the moment the site
  // is reached from a different host.
  useEffect(() => {
    setUrl(`${window.location.origin}${path}`);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [path]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked — show the field so it can be selected by hand.
      setFallback(true);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }

  async function handleShare() {
    try {
      await navigator.share({ title: shareTitle ?? label, url });
    } catch {
      // A cancelled share sheet throws too, so this must not be treated as an
      // error the owner needs to see.
    }
  }

  return (
    <div>
      <p className="text-label uppercase text-ink-subtle">{label}</p>

      {hint ? <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{hint}</p> : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {canShare ? (
          <Button
            variant="secondary"
            fullWidth
            onClick={handleShare}
            icon={<ShareNetworkIcon size={18} />}
          >
            Send by text or WhatsApp
          </Button>
        ) : null}

        <Button
          variant={canShare ? "quiet" : "secondary"}
          fullWidth
          onClick={handleCopy}
          icon={copied ? <CheckIcon size={18} weight="bold" /> : <LinkSimpleIcon size={18} />}
        >
          {copied ? "Copied" : "Copy the link"}
        </Button>
      </div>

      {/* Announced politely so a screen-reader user gets the confirmation the
          button's changed label gives everyone else. */}
      <p aria-live="polite" className="sr-only">
        {copied ? "Link copied to the clipboard" : ""}
      </p>

      {fallback ? (
        <div className="mt-3">
          <label htmlFor={`share-${path}`} className="text-sm text-ink-muted">
            Copy this by hand — your browser would not let us do it for you:
          </label>
          <input
            ref={inputRef}
            id={`share-${path}`}
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className={cn(
              "mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2.5",
              "font-mono text-sm text-ink",
              "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
