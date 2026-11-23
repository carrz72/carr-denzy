import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { pushToOwners, pushToProfiles } from "@/lib/push";

/**
 * Buzzes the owner's phone for reminders that have come due.
 *
 * Called every minute by the database (pg_cron + pg_net, see
 * 20261122120000_reminders.sql), but only when something is actually due, so
 * most minutes nothing calls it at all.
 *
 * The key it checks is made by the database and never leaves it except in
 * this call; nobody types or pastes it. Even without it, the worst anyone could
 * do here is make a due reminder arrive on time, because it only ever pushes
 * to the business's own devices about rows that are already due.
 *
 * Each reminder is claimed (pushed_at stamped) before it is sent, so two calls
 * landing together cannot buzz the phone twice for the same thing.
 */

const MAX_PER_CALL = 20;

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const admin = createAdminClient();

  const given = request.headers.get("x-reminder-key") ?? "";
  const { data: stored } = await admin.from("job_keys").select("key").eq("name", "due-reminders").maybeSingle();

  if (!stored?.key || given.length !== stored.key.length || given !== stored.key) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { data: due, error } = await admin
    .from("owner_reminders")
    .select("id")
    .is("done_at", null)
    .is("pushed_at", null)
    .lte("due_at", now)
    .order("due_at", { ascending: true })
    .limit(MAX_PER_CALL);

  if (error) {
    console.error("[due-reminders] read failed", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (!due?.length) return NextResponse.json({ ok: true, pushed: 0 });

  // Claim them. Only the rows this call stamped come back.
  const { data: claimed } = await admin
    .from("owner_reminders")
    .update({ pushed_at: now })
    .in(
      "id",
      due.map((row) => row.id),
    )
    .is("pushed_at", null)
    .select("id, title, kind, job_id, client_id, enquiry_id, invoice_id, quote_id, created_by");

  let pushed = 0;
  for (const reminder of claimed ?? []) {
    const url = reminder.invoice_id
      ? `/app/invoices/${reminder.invoice_id}`
      : reminder.quote_id
        ? `/app/quotes/${reminder.quote_id}`
        : reminder.job_id
          ? `/app/jobs/${reminder.job_id}`
          : reminder.enquiry_id
            ? `/app/enquiries/${reminder.enquiry_id}`
            : reminder.client_id
              ? `/app/clients/${reminder.client_id}`
              : "/app#to-do";

    const message = {
      title: reminder.kind === "manual" ? "Reminder" : "Don't forget",
      body: reminder.title,
      url,
      tag: `reminder-${reminder.id}`,
    };
    // A team member's own reminder goes to them; the owner's, and the automatic
    // money nudges, go to the owner.
    const { data: author } = reminder.created_by
      ? await admin.from("profiles").select("role").eq("id", reminder.created_by).maybeSingle()
      : { data: null };
    const result =
      author?.role === "staff" && reminder.created_by
        ? await pushToProfiles([reminder.created_by], message)
        : await pushToOwners(message);
    pushed += result.sent;
  }

  return NextResponse.json({ ok: true, reminders: (claimed ?? []).length, pushed });
}
