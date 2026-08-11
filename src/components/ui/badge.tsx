import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { InvoiceStatus, JobStatus, QuoteStatus, UrgencyLevel } from "@/types/database";

/**
 * Status badges.
 *
 * Square-ish, not pills. The pill badge is the single most recognisable "an AI
 * built this" tell, and a squared corner reads as more deliberate against the
 * softer card radii around it.
 *
 * Every badge carries a WORD, never a bare colour. Roughly one man in twelve
 * has some form of colour vision deficiency, and this app's users are
 * tradespeople reading a phone in bad light — colour is the secondary signal
 * here, not the primary one.
 */

type Tone = "neutral" | "accent" | "positive" | "caution" | "critical" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-muted border-line",
  accent: "bg-accent-soft text-accent-ink border-accent-line",
  positive: "bg-positive-soft text-positive-ink border-positive/25",
  caution: "bg-caution-soft text-caution-ink border-caution/25",
  critical: "bg-critical-soft text-critical border-critical/25",
  info: "bg-info-soft text-info-ink border-info/25",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs border px-2 py-1",
        "text-xs font-semibold leading-none",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Job status, in the words a customer would use.
 *
 * The database stores `in_progress`; nobody outside a database says that. The
 * portal timeline and the owner's list both read from this single map, so the
 * two halves of the app can never drift into describing the same job
 * differently (spec FR-21).
 */
export const jobStatusLabels: Record<JobStatus, string> = {
  new: "New request",
  quoted: "Quote sent",
  accepted: "Quote accepted",
  declined: "Quote declined",
  scheduled: "Booked in",
  in_progress: "Work under way",
  completed: "Work finished",
  invoiced: "Invoice sent",
  paid: "Paid",
  cancelled: "Cancelled",
};

const jobStatusTones: Record<JobStatus, Tone> = {
  new: "accent",
  quoted: "info",
  accepted: "info",
  declined: "neutral",
  scheduled: "info",
  in_progress: "caution",
  completed: "positive",
  invoiced: "caution",
  paid: "positive",
  cancelled: "neutral",
};

export function JobStatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <Badge tone={jobStatusTones[status]} className={className}>
      {jobStatusLabels[status]}
    </Badge>
  );
}

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Awaiting reply",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

const quoteStatusTones: Record<QuoteStatus, Tone> = {
  draft: "neutral",
  sent: "caution",
  accepted: "positive",
  declined: "neutral",
  expired: "neutral",
};

export function QuoteStatusBadge({
  status,
  className,
}: {
  status: QuoteStatus;
  className?: string;
}) {
  return (
    <Badge tone={quoteStatusTones[status]} className={className}>
      {quoteStatusLabels[status]}
    </Badge>
  );
}

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Awaiting payment",
  part_paid: "Part paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Cancelled",
};

const invoiceStatusTones: Record<InvoiceStatus, Tone> = {
  draft: "neutral",
  sent: "info",
  part_paid: "caution",
  paid: "positive",
  overdue: "critical",
  void: "neutral",
};

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: InvoiceStatus;
  className?: string;
}) {
  return (
    <Badge tone={invoiceStatusTones[status]} className={className}>
      {invoiceStatusLabels[status]}
    </Badge>
  );
}

export const urgencyLabels: Record<UrgencyLevel, string> = {
  emergency: "Emergency",
  soon: "Soon",
  flexible: "Flexible",
};

const urgencyTones: Record<UrgencyLevel, Tone> = {
  emergency: "critical",
  soon: "caution",
  flexible: "neutral",
};

export function UrgencyBadge({
  urgency,
  className,
}: {
  urgency: UrgencyLevel;
  className?: string;
}) {
  return (
    <Badge tone={urgencyTones[urgency]} className={className}>
      {urgencyLabels[urgency]}
    </Badge>
  );
}
