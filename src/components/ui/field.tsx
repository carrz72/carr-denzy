"use client";

import { useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

/**
 * Form fields.
 *
 * Rules baked in here rather than left to each form (spec NFR-8, NFR-9):
 *
 *  * The label is always a real, visible <label>. Placeholder-as-label
 *    disappears the moment someone starts typing, which is exactly when a
 *    hesitant user most needs to know what the box is for.
 *  * Hints and errors are wired through aria-describedby, so a screen reader
 *    hears them as part of the field rather than as loose text.
 *  * Errors are announced politely and marked with an icon as well as colour,
 *    because colour alone fails for anyone who cannot distinguish it.
 *  * Required is spelled out. A bare red asterisk means nothing to someone who
 *    has not been taught the convention.
 */

const controlBase = [
  "w-full rounded-md border bg-surface-raised px-3.5 py-3",
  "text-ink placeholder:text-ink-subtle",
  "shadow-subtle",
  "transition-[border-color,box-shadow] duration-200",
  "[transition-timing-function:var(--ease-standard)]",
  "hover:border-line-strong",
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle",
].join(" ");

const controlError = "border-critical focus:border-critical focus:ring-critical/25";

interface FieldShellProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  optionalLabel?: boolean;
  className?: string;
  children: ReactNode;
}

function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  optionalLabel = true,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline gap-2 font-medium text-ink">
        <span>{label}</span>
        {!required && optionalLabel ? (
          <span className="text-sm font-normal text-ink-subtle">optional</span>
        ) : null}
      </label>

      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}

      {children}

      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-sm font-medium text-critical"
        >
          <WarningCircleIcon size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

// ---------------------------------------------------------------------------
// Text input
// ---------------------------------------------------------------------------

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
  /** Rendered inside the field, before the input. Use for the £ on money fields. */
  prefix?: string;
  containerClassName?: string;
}

export function TextField({
  label,
  hint,
  error,
  prefix,
  required,
  className,
  containerClassName,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const id = props.name ? `field-${props.name}` : generatedId;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <div className="relative">
        {prefix ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
          >
            {prefix}
          </span>
        ) : null}

        <input
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(controlBase, error && controlError, prefix && "pl-8", className)}
          {...props}
        />
      </div>
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------

export interface TextAreaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  className,
  containerClassName,
  rows = 5,
  ...props
}: TextAreaFieldProps) {
  const generatedId = useId();
  const id = props.name ? `field-${props.name}` : generatedId;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlBase, "resize-y leading-relaxed", error && controlError, className)}
        {...props}
      />
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
  children: ReactNode;
}

export function SelectField({
  label,
  hint,
  error,
  required,
  className,
  containerClassName,
  children,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const id = props.name ? `field-${props.name}` : generatedId;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlBase, "appearance-none pr-10", error && controlError, className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%236b6055' stroke-width='1.75' stroke-linecap='round'%3E%3Cpath d='M4 6.5 8 10.5 12 6.5'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.875rem center",
          backgroundSize: "1rem",
        }}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------
// Choice cards — a radio group that is big enough to hit on a phone
// ---------------------------------------------------------------------------

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
}

export interface ChoiceGroupProps {
  legend: string;
  name: string;
  options: ChoiceOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  columns?: 1 | 2 | 3;
}

export function ChoiceGroup({
  legend,
  name,
  options,
  value,
  defaultValue,
  onChange,
  hint,
  error,
  required,
  columns = 1,
}: ChoiceGroupProps) {
  const id = `choice-${name}`;

  return (
    <fieldset
      className="flex flex-col gap-1.5"
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hint, error)}
    >
      <legend className="mb-1.5 font-medium text-ink">{legend}</legend>

      {hint ? (
        <p id={`${id}-hint`} className="mb-1 text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}

      <div
        className={cn(
          "grid gap-2.5",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-3",
        )}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "group relative flex cursor-pointer items-start gap-3 rounded-lg border bg-surface-raised p-4",
              "shadow-subtle transition-[border-color,background-color,box-shadow] duration-200",
              "[transition-timing-function:var(--ease-standard)]",
              "hover:border-line-strong hover:bg-surface",
              "has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:shadow-raised",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
              "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
              error && "border-critical",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              required={required}
              checked={value === undefined ? undefined : value === option.value}
              defaultChecked={value === undefined ? defaultValue === option.value : undefined}
              onChange={(event) => onChange?.(event.target.value)}
              className="mt-0.5 size-5 shrink-0 accent-accent"
            />

            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2 font-medium text-ink">
                {option.icon ? (
                  <span aria-hidden="true" className="text-accent">
                    {option.icon}
                  </span>
                ) : null}
                {option.label}
              </span>

              {option.description ? (
                <span className="text-sm leading-snug text-ink-muted">{option.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>

      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 flex items-start gap-1.5 text-sm font-medium text-critical"
        >
          <WarningCircleIcon size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Checkbox / switch
// ---------------------------------------------------------------------------

export interface CheckFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  label: string;
  hint?: string;
  error?: string;
}

export function CheckField({ label, hint, error, className, ...props }: CheckFieldProps) {
  const generatedId = useId();
  const id = props.name ? `field-${props.name}` : generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-raised p-4",
          "shadow-subtle transition-[border-color,background-color] duration-200",
          "[transition-timing-function:var(--ease-standard)]",
          "hover:border-line-strong",
          "has-[:checked]:border-accent has-[:checked]:bg-accent-soft",
          className,
        )}
      >
        <input
          id={id}
          type="checkbox"
          aria-describedby={describedBy(id, hint, error)}
          className="mt-0.5 size-5 shrink-0 rounded accent-accent"
          {...props}
        />

        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-ink">{label}</span>
          {hint ? (
            <span id={`${id}-hint`} className="text-sm leading-snug text-ink-muted">
              {hint}
            </span>
          ) : null}
        </span>
      </label>

      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-sm font-medium text-critical"
        >
          <WarningCircleIcon size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form-level error summary
// ---------------------------------------------------------------------------

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-critical/30 bg-critical-soft px-4 py-3.5"
    >
      <WarningCircleIcon
        size={20}
        weight="fill"
        className="mt-0.5 shrink-0 text-critical"
        aria-hidden="true"
      />
      <p className="text-[0.9375rem] font-medium text-critical">{message}</p>
    </div>
  );
}

/** Honeypot. Off-screen rather than display:none, which some bots skip. */
export function HoneypotField() {
  return (
    <div aria-hidden="true" className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
      <label htmlFor="company_website">Company website</label>
      <input
        id="company_website"
        name="company_website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
      />
    </div>
  );
}
