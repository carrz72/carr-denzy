/**
 * Dates.
 *
 * Stored as UTC `timestamptz`, displayed in Europe/London. Pinning the display
 * zone matters: a job booked for 09:00 on 28 March must still read 09:00 after
 * the clocks change, and a server rendering in UTC would say 08:00.
 */

const LONDON = "Europe/London";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortDateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** 10 August 2026 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateFmt.format(toDate(value));
}

/** 10 Aug 2026 */
export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return shortDateFmt.format(toDate(value));
}

/** Monday, 10 August */
export function formatDayHeading(value: string | Date): string {
  return dayFmt.format(toDate(value));
}

/** 09:30 */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return timeFmt.format(toDate(value));
}

/** Mon, 10 Aug, 09:30 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateTimeFmt.format(toDate(value));
}

/**
 * "3 days ago", "in 2 weeks". Plain words beat a raw timestamp when the owner
 * is scanning an inbox on a phone.
 */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";

  const date = toDate(value);
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const abs = Math.abs(diffMinutes);

  if (abs < 1) return "just now";

  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

  if (abs < 60) return rtf.format(diffMinutes, "minute");
  if (abs < 60 * 24) return rtf.format(Math.round(diffMinutes / 60), "hour");
  if (abs < 60 * 24 * 30) return rtf.format(Math.round(diffMinutes / (60 * 24)), "day");
  if (abs < 60 * 24 * 365) return rtf.format(Math.round(diffMinutes / (60 * 24 * 30)), "month");

  return rtf.format(Math.round(diffMinutes / (60 * 24 * 365)), "year");
}

/** "1h 30m" from 90. Used for job durations. */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;

  return `${hours}h ${mins}m`;
}

/** Today's date in Europe/London as `YYYY-MM-DD`, for date inputs. */
/**
 * How long a job runs, said the way a person would say it.
 *
 * Stored as working days, because that is the only unit that stays true — a
 * "week" of work is five days on site, not seven, and a job does not pause for
 * the weekend just because the calendar does. But nobody tells a customer
 * their kitchen will take "fifteen working days", so it is read back in
 * whichever unit sounds natural at that length.
 *
 * Five working days to the week, twenty to the month. Deliberately round: this
 * is an estimate given before the work starts, and dressing it up with a
 * decimal place would imply a precision nobody has.
 */
export function formatWorkingDays(days: number | null | undefined): string {
  if (!days || days < 1) return "";
  if (days === 1) return "about a day";
  if (days < 5) return `about ${days} days`;

  if (days < 20) {
    const weeks = Math.round(days / 5);
    return weeks === 1 ? "about a week" : `about ${weeks} weeks`;
  }

  const months = Math.round(days / 20);
  const leftover = days - months * 20;

  // Close enough to a round number of months to say so.
  if (Math.abs(leftover) <= 2) {
    return months === 1 ? "about a month" : `about ${months} months`;
  }

  return `about ${Math.round(days / 5)} weeks`;
}

/**
 * The same estimate given as a range: "three to four weeks", "a month or two".
 *
 * How a tradesman actually answers "how long will it take?" before anything is
 * opened up. A single number sounds like a commitment; a range sounds like an
 * estimate, which is what it is.
 *
 * Both ends are converted into one unit before pairing them, so the phrasing
 * never straddles two — "1 week to 2 months" is technically accurate and reads
 * like nonsense.
 */
export function formatWorkingDayRange(
  from: number | null | undefined,
  to: number | null | undefined,
): string {
  if (!from || from < 1) return "";
  if (!to || to <= from) return formatWorkingDays(from);

  // Months only when the BOTTOM of the range is already a month.
  //
  // Choosing the unit from the top end reads "15 to 20 days" as "about a
  // month", because three weeks rounds up to one month and four weeks rounds
  // to the same — the range collapses and the customer is told something
  // vaguer than what was meant. The lower bound decides.
  if (from >= 20) {
    const lo = Math.max(1, Math.round(from / 20));
    const hi = Math.round(to / 20);

    if (lo === hi) return lo === 1 ? "about a month" : `about ${lo} months`;
    // The idiom, worth special-casing because it is what people say.
    if (lo === 1 && hi === 2) return "a month or two";
    return `${lo} to ${hi} months`;
  }

  // Weeks, on the same rule.
  if (from >= 5) {
    const lo = Math.max(1, Math.round(from / 5));
    const hi = Math.round(to / 5);

    if (lo === hi) return lo === 1 ? "about a week" : `about ${lo} weeks`;
    if (lo === 1 && hi === 2) return "a week or two";
    return `${lo} to ${hi} weeks`;
  }

  return `${from} to ${to} days`;
}

/** Working days for a number entered as days, weeks or months. */
export function workingDaysFrom(amount: number, unit: "days" | "weeks" | "months"): number {
  if (unit === "weeks") return amount * 5;
  if (unit === "months") return amount * 20;
  return amount;
}

export function todayInLondon(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return parts;
}

/** `YYYY-MM-DD` a number of days from today, for invoice due dates. */
export function addDaysToToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** True when the timestamp falls on today's date in London. */
export function isToday(value: string | Date | null | undefined): boolean {
  if (!value) return false;

  const target = new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(toDate(value));

  return target === todayInLondon();
}

/** True when a due date has passed. Dates are compared, not instants. */
export function isPast(dateOnly: string | null | undefined): boolean {
  if (!dateOnly) return false;
  return dateOnly < todayInLondon();
}

/** The Monday of the week containing `value`, as `YYYY-MM-DD`. */
export function startOfWeek(value: Date = new Date()): string {
  const date = new Date(value);
  const day = date.getDay();            // 0 = Sunday
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/*
 * ---------------------------------------------------------------------------
 * Diary helpers.
 *
 * These work on plain `YYYY-MM-DD` strings rather than Date objects on purpose.
 * A diary is a set of calendar days, not a set of instants — "Tuesday" does not
 * become a different day because the clocks went back at 2am, and comparing
 * date strings cannot drift the way comparing timestamps can.
 * ---------------------------------------------------------------------------
 */

/** `YYYY-MM-DD` shifted by whole days. Safe across month, year and DST edges. */
export function addDays(dateOnly: string, days: number): string {
  // Parsed as UTC midday, so a ±1h DST shift can never land on a neighbouring
  // day. Only the calendar arithmetic matters here, never the time.
  const date = new Date(`${dateOnly}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The seven `YYYY-MM-DD` days of the week beginning at `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** The Monday of the week containing a `YYYY-MM-DD`, without going via Date. */
export function mondayOf(dateOnly: string): string {
  const day = new Date(`${dateOnly}T12:00:00Z`).getUTCDay();  // 0 = Sunday
  return addDays(dateOnly, day === 0 ? -6 : 1 - day);
}

/** The date part of a timestamp, in London. Used to bucket jobs into days. */
export function londonDateOf(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(toDate(value));
}

/** "Mon" */
export function weekdayShort(dateOnly: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${dateOnly}T12:00:00Z`));
}

/** "11 Aug" */
export function dayAndMonth(dateOnly: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(`${dateOnly}T12:00:00Z`));
}

/**
 * "This week", "Next week", "Week of 25 August".
 *
 * Naming the week relative to today is what stops the owner having to work out
 * whether the dates on screen are the ones they meant to be looking at.
 */
export function weekLabel(monday: string): string {
  const thisMonday = mondayOf(todayInLondon());

  if (monday === thisMonday) return "This week";
  if (monday === addDays(thisMonday, 7)) return "Next week";
  if (monday === addDays(thisMonday, -7)) return "Last week";

  return `Week of ${dayAndMonth(monday)}`;
}

/** True when the date is strictly before today, comparing calendar days. */
export function isBeforeToday(dateOnly: string): boolean {
  return dateOnly < todayInLondon();
}
