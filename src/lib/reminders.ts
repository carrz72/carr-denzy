import { addDays, formatDayHeading, londonDateOf, todayInLondon } from "@/lib/dates";
import type { ChaseControl } from "@/types/database";

/**
 * What the reminders are doing, in words, for the owner's screens.
 *
 * Kept next to (and in step with) the rules in /api/cron/reminders, so the
 * line the owner reads on an invoice is what the schedule will actually do.
 */

/** "Friday, 14 November" from "2026-11-14". */
export function dayLabel(dateOnly: string): string {
  return formatDayHeading(`${dateOnly}T12:00:00Z`);
}

export interface InvoiceChaseInput {
  status: string;
  dueDate: string | null;
  outstandingPence: number;
  lastReminderAt: string | null;
  hasEmail: boolean;
  clientOn: boolean;
  settingOn: boolean;
  everyDays: number;
  control: Pick<ChaseControl, "paused_until" | "stopped" | "note"> | null;
}

export interface ChaseSummary {
  /** One line: what will happen next. */
  line: string;
  /** "off" when nothing will be sent, "paused" while waiting on a promise. */
  state: "on" | "paused" | "off";
}

export function invoiceChaseSummary(input: InvoiceChaseInput): ChaseSummary {
  const today = todayInLondon();

  if (!["sent", "part_paid", "overdue"].includes(input.status) || input.outstandingPence <= 0) {
    return { line: "Nothing to chase.", state: "off" };
  }
  if (!input.settingOn) return { line: "Payment reminders are switched off in Settings.", state: "off" };
  if (!input.clientOn) return { line: "Automatic reminders are off for this customer.", state: "off" };
  if (input.control?.stopped) return { line: "Reminders are stopped on this invoice.", state: "off" };
  if (!input.hasEmail) return { line: "This customer has no email address, so nothing is sent.", state: "off" };

  if (input.control?.paused_until && input.control.paused_until >= today) {
    return {
      line: `Paused: they said they would pay by ${dayLabel(input.control.paused_until)}. If it has not come by then, reminders start again and you get a nudge.`,
      state: "paused",
    };
  }

  if (!input.dueDate) return { line: "No due date, so nothing is sent automatically.", state: "off" };

  // The schedule chases invoices whose due date is before today, at about 8am.
  let next = input.dueDate >= today ? addDays(input.dueDate, 1) : today;
  if (input.lastReminderAt) {
    const gapEnds = addDays(londonDateOf(input.lastReminderAt), input.everyDays);
    if (gapEnds > next) next = gapEnds;
  }
  if (next <= today) next = addDays(today, 1);

  const first = !input.lastReminderAt;
  return {
    line: `${first ? "First" : "Next"} reminder goes ${next === addDays(today, 1) ? "tomorrow morning" : `on ${dayLabel(next)}`}, then every ${input.everyDays} days until it is paid.`,
    state: "on",
  };
}
