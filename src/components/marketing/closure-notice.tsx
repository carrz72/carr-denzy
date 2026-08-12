import { PhoneIcon, SunHorizonIcon } from "@phosphor-icons/react/dist/ssr";
import type { BusinessContact } from "@/lib/business";
import { cn } from "@/lib/cn";
import type { ClosureNotice as Notice } from "@/lib/closures";

/**
 * "We are away" — the same sentence everywhere it appears.
 *
 * A trade business that goes quiet for a fortnight without saying so loses the
 * customer permanently: they ring twice, assume the business has folded, and
 * call somebody else. Saying it plainly costs one banner and keeps the job.
 *
 * Tone shifts with distance. A closure that has started is stated flatly in
 * caution colours; one still ahead is a quieter heads-up, because a warning
 * about a fortnight's time should not look like an emergency today.
 */
export function ClosureNotice({
  notice,
  className,
  contact,
}: {
  notice: Notice | null;
  className?: string;
  /** From Settings, so the owner can change the number without a redeploy. */
  contact: BusinessContact;
}) {
  if (!notice) return null;

  return (
    <aside
      className={cn(
        "border-b",
        notice.active
          ? "border-caution/30 bg-caution-soft"
          : "border-line bg-surface-sunken",
        className,
      )}
    >
      <div className="container-page flex flex-wrap items-start gap-x-4 gap-y-2 py-3.5">
        <span
          aria-hidden="true"
          className={cn("mt-0.5 shrink-0", notice.active ? "text-caution" : "text-ink-subtle")}
        >
          <SunHorizonIcon size={20} weight="fill" />
        </span>

        <div className="min-w-0 flex-1">
          <p className={cn("font-medium", notice.active ? "text-caution-ink" : "text-ink")}>
            {notice.headline}
          </p>
          <p className="mt-0.5 text-[0.9375rem] leading-relaxed text-ink-muted">
            {notice.detail}
          </p>
        </div>

        {notice.active && notice.emergenciesOnly ? (
          <a
            href={contact.phoneHref}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-caution/40",
              "bg-surface-raised px-4 font-medium text-ink",
              "transition-colors duration-200 hover:border-caution",
            )}
          >
            <PhoneIcon size={17} weight="fill" className="text-accent" aria-hidden="true" />
            <span className="tabular">{contact.phone}</span>
          </a>
        ) : null}
      </div>
    </aside>
  );
}
