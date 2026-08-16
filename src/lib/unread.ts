import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

/**
 * Unread message bookkeeping.
 *
 * `messages.read_at` has existed since the first migration and nothing has
 * ever written to it. That was harmless while nothing read it either — the
 * moment a badge counts unread messages, a column nobody clears becomes a
 * number that only ever goes up. A notification that cannot be dismissed stops
 * being a notification within a day; people simply learn to look past it.
 *
 * Marking read uses the admin client. There is no RLS policy for updating
 * somebody else's message — quite rightly, since the body must stay theirs —
 * and adding one would open a write surface on message content just to stamp a
 * timestamp. The write here cannot touch anything else: it is scoped to one
 * job, to messages the viewer did not send, and it only ever sets a timestamp
 * on rows where it is currently null.
 *
 * Always call this from `after()`, never during render. Marking read is a
 * write, and a page that writes while rendering is what broke the enquiry
 * screen — see the note in src/app/(app)/app/enquiries/[id]/page.tsx.
 */
export async function markMessagesRead(jobId: string, viewerId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    await admin
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("job_id", jobId)
      .neq("sender_id", viewerId)
      .is("read_at", null);
  } catch (error) {
    // A badge that clears late is a small annoyance; a job page that fails to
    // load because of one is not.
    console.error("[unread] could not mark messages read", error);
  }
}

/**
 * How many messages are waiting for this person, across every job they can see.
 *
 * Counted with the caller's own client rather than the admin one, so Row Level
 * Security decides which jobs are theirs. The owner sees customers' messages;
 * a customer sees only the ones on their own jobs.
 */
export async function countUnreadMessages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string,
): Promise<number> {
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .neq("sender_id", viewerId)
    .is("read_at", null);

  return count ?? 0;
}
