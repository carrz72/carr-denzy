import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Surfaces.
 *
 * A card exists to communicate that its contents are one thing, or that it
 * sits above the page. It is not decoration, and it does not need a border, a
 * shadow AND a background all at once — that combination is the visual default
 * that makes an interface look generic. Three levels, each earning its weight:
 *
 *   flat    — background only. Grouping without elevation.
 *   outline — a line only. Grouping where the page background must show through.
 *   raised  — a real shadow. Reserved for things that genuinely float.
 */

type CardTone = "flat" | "outline" | "raised";

const tones: Record<CardTone, string> = {
  flat: "bg-surface-sunken",
  outline: "border border-line bg-surface-raised",
  raised: "bg-surface-raised shadow-raised",
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  tone?: CardTone;
  /** Adds hover elevation and a pointer. Only for cards that are entirely clickable. */
  interactive?: boolean;
  padded?: boolean;
}

export function Card({
  as: Component = "div",
  tone = "outline",
  interactive = false,
  padded = true,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <Component
      className={cn(
        "rounded-lg",
        tones[tone],
        padded && "p-5 sm:p-6",
        interactive && [
          "transition-[border-color,box-shadow,transform] duration-200",
          "[transition-timing-function:var(--ease-standard)]",
          "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
          "active:translate-y-0 active:shadow-raised",
        ],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-subheading text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * A small caps label. Lowercase with wide tracking rather than SHOUTING CAPS
 * everywhere, which is the other default that dates an interface fast.
 */
export function EyebrowLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-label uppercase text-ink-subtle",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A labelled value pair — the backbone of every detail panel in the app. */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5 py-2.5", className)}>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="font-medium text-ink">{children}</dd>
    </div>
  );
}

/** A horizontal rule that is a hairline, not a wall. */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line", className)} />;
}
