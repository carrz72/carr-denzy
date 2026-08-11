import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Button.
 *
 * Four variants, not two. The usual "one filled, one ghost" pairing forces
 * every secondary action to look like a competing call to action; `quiet` and
 * `link` give the owner's dense screens somewhere to put the third and fourth
 * action without visual noise.
 *
 * Every size clears the 44px minimum touch target (spec NFR-5), including
 * `sm` — which is short but padded, not small.
 *
 * There is no `asChild` prop and no Slot dependency. When a link needs to look
 * like a button, use `buttonClasses()` on a `<Link>`: it keeps anchors as
 * anchors, so middle-click, "open in new tab" and the browser status bar all
 * keep working, which a <button> that navigates quietly breaks.
 */

export type ButtonVariant = "primary" | "secondary" | "quiet" | "link" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const base = [
  "relative inline-flex items-center justify-center gap-2",
  "font-medium whitespace-nowrap select-none",
  "rounded-md border border-transparent",
  "transition-[background-color,border-color,color,box-shadow,transform] duration-200",
  "[transition-timing-function:var(--ease-standard)]",
  "disabled:pointer-events-none disabled:opacity-50",
  "aria-disabled:pointer-events-none aria-disabled:opacity-50",
  // A physical press. 1px is enough to register as a click without wobbling.
  "active:translate-y-px",
].join(" ");

const variants: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-accent text-white shadow-subtle",
    "hover:bg-accent-hover hover:shadow-raised",
    "active:bg-accent-press active:shadow-subtle",
  ),
  secondary: cn(
    "bg-surface-raised text-ink border-line-strong shadow-subtle",
    "hover:bg-surface-sunken hover:border-ink-subtle",
    "active:bg-line",
  ),
  quiet: cn(
    "bg-transparent text-ink-muted",
    "hover:bg-surface-sunken hover:text-ink",
    "active:bg-line",
  ),
  link: cn(
    "bg-transparent text-accent underline underline-offset-4 decoration-accent-line px-0",
    "hover:decoration-accent hover:text-accent-hover",
    "active:translate-y-0",
  ),
  destructive: cn(
    "bg-critical text-white shadow-subtle",
    "hover:brightness-110 hover:shadow-raised",
    "active:brightness-95",
  ),
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3.5 text-sm",
  md: "min-h-12 px-5 text-[0.9375rem]",
  lg: "min-h-14 px-7 text-base",
};

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Button styling for elements that are not buttons — chiefly `<Link>`. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonClassOptions = {}): string {
  return cn(base, variants[variant], sizes[size], fullWidth && "w-full", className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction. The label keeps its space so the button does not resize. */
  loading?: boolean;
  /** Announced to screen readers while `loading` is true. */
  loadingLabel?: string;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconPosition?: "start" | "end";
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel = "Working…",
  fullWidth = false,
  icon,
  iconPosition = "start",
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      {icon && iconPosition === "start" ? (
        <span aria-hidden="true" className={cn("shrink-0", loading && "invisible")}>
          {icon}
        </span>
      ) : null}

      <span className={cn(loading && "invisible")}>{children}</span>

      {icon && iconPosition === "end" ? (
        <span aria-hidden="true" className={cn("shrink-0", loading && "invisible")}>
          {icon}
        </span>
      ) : null}

      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="absolute inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
          <span className="sr-only">{loadingLabel}</span>
        </>
      ) : null}
    </button>
  );
}
