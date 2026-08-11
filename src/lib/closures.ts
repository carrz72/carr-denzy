import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import { formatDate, todayInLondon } from "@/lib/dates";

/**
 * Whether the business is currently shut, or about to be.
 *
 * Read through the anonymous client so the marketing pages that call it stay
 * statically renderable — see src/lib/supabase/public.ts. Closures are public
 * information by definition: the whole point is that a stranger sees it.
 */
export interface ClosureNotice {
  /** True when today falls inside the closure, false when it is still ahead. */
  active: boolean;
  startsOn: string;
  endsOn: string;
  reason: string | null;
  emergenciesOnly: boolean;
  /** Ready-to-render sentence. Keeps every surface saying the same thing. */
  headline: string;
  detail: string;
}

export async function getClosureNotice(): Promise<ClosureNotice | null> {
  const supabase = createPublicClient();

  const { data, error } = await supabase.rpc("current_closure");

  if (error) {
    // A missing table or a bad afternoon must not take the home page down.
    console.error("[closures] could not read", error.message);
    return null;
  }

  const row = data?.[0];
  if (!row) return null;

  const backOn = formatDate(row.ends_on);

  const headline = row.is_active
    ? row.reason
      ? `We are away — ${row.reason}`
      : "We are away at the moment"
    : row.reason
      ? `We are away from ${formatDate(row.starts_on)} — ${row.reason}`
      : `We are away from ${formatDate(row.starts_on)}`;

  const detail = row.emergencies_only
    ? `Back on ${backOn}. We are still picking up genuine emergencies — ring rather than send a request, and it will get looked at.`
    : `Back on ${backOn}. Send a request and we will answer it as soon as we are back — nothing gets lost.`;

  return {
    active: row.is_active,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    reason: row.reason,
    emergenciesOnly: row.emergencies_only,
    headline,
    detail,
  };
}

/** Every date in a closure, for marking the diary. */
export function closureDays(startsOn: string, endsOn: string): Set<string> {
  const days = new Set<string>();
  let cursor = startsOn;

  // Bounded so a bad range cannot spin — a year of time off is not a thing.
  for (let guard = 0; cursor <= endsOn && guard < 400; guard += 1) {
    days.add(cursor);
    const next = new Date(`${cursor}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }

  return days;
}

export { todayInLondon };
