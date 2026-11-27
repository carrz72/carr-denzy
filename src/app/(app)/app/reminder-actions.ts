"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, requireOwner, requireStaff } from "@/lib/auth";
import { sendInvoiceReminder } from "@/lib/email";
import { addDays, londonWallTimeToIso, todayInLondon } from "@/lib/dates";
import type { ChaseEntity } from "@/types/database";

/**
 * the owner's say over the reminders.
 *
 * Two kinds live here:
 *
 *   * Controls over the automatic emails to customers: pause an invoice until
 *     the day they said they would pay, stop reminders on one invoice, quote
 *     or job, stop them for one customer, or send one now.
 *   * His own to-do list: "Remind me" on a job, customer, request or invoice,
 *     ticked off, pushed back or deleted from the Today screen.
 *
 * Every action is staff-only twice over: the require* call here and the RLS
 * policies on chase_controls and owner_reminders.
 */

export interface ReminderActionResult {
  ok: boolean;
  formError?: string;
  message?: string;
}

const uuid = z.string().uuid();
const entitySchema = z.enum(["invoice", "quote", "job"]);

function refresh() {
  revalidatePath("/app", "layout");
}

// --- Controls over the automatic emails --------------------------------------

/** "They have said they will pay by …": no reminders up to and including that day. */
export async function pauseUntil(
  entity: ChaseEntity,
  entityId: string,
  date: string,
  note: string,
): Promise<ReminderActionResult> {
  const user = await requireStaff();
  if (!entitySchema.safeParse(entity).success || !uuid.safeParse(entityId).success) {
    return { ok: false, formError: "That could not be found." };
  }

  const today = todayInLondon();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) {
    return { ok: false, formError: "Pick today or a day after it." };
  }
  if (date > addDays(today, 120)) {
    return { ok: false, formError: "Pick a day within the next four months." };
  }

  const cleanNote = note.trim().slice(0, 300) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("chase_controls").upsert({
    entity,
    entity_id: entityId,
    paused_until: date,
    stopped: false,
    note: cleanNote,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  });

  if (error) {
    console.error("[reminders] pause failed", error.message);
    return { ok: false, formError: "That did not save. Try again." };
  }

  refresh();
  return { ok: true };
}

/** Turns the automatic reminders on one invoice, quote or job off, or back on. */
export async function setStopped(
  entity: ChaseEntity,
  entityId: string,
  stopped: boolean,
): Promise<ReminderActionResult> {
  const user = await requireStaff();
  if (!entitySchema.safeParse(entity).success || !uuid.safeParse(entityId).success) {
    return { ok: false, formError: "That could not be found." };
  }

  const supabase = await createClient();

  // Back on means back to normal: no pause, no stop, so the row goes.
  const { error } = stopped
    ? await supabase.from("chase_controls").upsert({
        entity,
        entity_id: entityId,
        stopped: true,
        paused_until: null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
    : await supabase.from("chase_controls").delete().eq("entity", entity).eq("entity_id", entityId);

  if (error) {
    console.error("[reminders] stop/start failed", error.message);
    return { ok: false, formError: "That did not save. Try again." };
  }

  refresh();
  return { ok: true };
}

/** Owner's switch on one customer: false stops every automatic reminder to them. */
export async function setClientAutoReminders(clientId: string, on: boolean): Promise<ReminderActionResult> {
  await requireStaff();
  if (!uuid.safeParse(clientId).success) return { ok: false, formError: "That customer was not found." };

  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ auto_reminders: on }).eq("id", clientId);

  if (error) {
    console.error("[reminders] client switch failed", error.message);
    return { ok: false, formError: "That did not save. Try again." };
  }

  refresh();
  return { ok: true };
}

/** Chases one invoice today rather than waiting for the automatic reminder. */
export async function sendInvoiceReminderNow(invoiceId: string): Promise<ReminderActionResult> {
  await requireStaff();
  if (!(await hasPermission("manage_invoices")) && !(await hasPermission("record_payments"))) {
    return { ok: false, formError: "You do not have permission to do that. Ask the owner." };
  }
  if (!uuid.safeParse(invoiceId).success) return { ok: false, formError: "That invoice was not found." };

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, reference, status, due_date, total_pence, paid_pence, last_reminder_at, client:clients(full_name, email)")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!invoice) return { ok: false, formError: "That invoice was not found." };
  if (!["sent", "part_paid", "overdue"].includes(invoice.status)) {
    return { ok: false, formError: "Only an invoice that has been sent and is not paid can be chased." };
  }

  const outstanding = invoice.total_pence - invoice.paid_pence;
  if (outstanding <= 0) return { ok: false, formError: "Nothing is left to pay on this invoice." };
  if (!invoice.client?.email) {
    return { ok: false, formError: "This customer has no email address. Add one on their page, or give them a ring." };
  }

  // A double tap, or a second go after a slow connection, must not send two.
  if (invoice.last_reminder_at && Date.now() - new Date(invoice.last_reminder_at).getTime() < 60 * 60 * 1000) {
    return { ok: false, formError: "A reminder went out in the last hour. Give it a little while." };
  }

  const today = todayInLondon();
  const daysOverdue = invoice.due_date
    ? Math.round(
        (new Date(`${today}T12:00:00Z`).getTime() - new Date(`${invoice.due_date}T12:00:00Z`).getTime()) / 86_400_000,
      )
    : 0;

  const sent = await sendInvoiceReminder(
    invoice.client.email,
    invoice.client.full_name,
    invoice.reference,
    outstanding,
    daysOverdue,
    invoice.id,
    invoice.due_date,
  );

  if (!sent.sent) {
    return { ok: false, formError: "The email did not go. Check their address and try again." };
  }

  await supabase.from("invoices").update({ last_reminder_at: new Date().toISOString() }).eq("id", invoice.id);

  refresh();
  return { ok: true, message: `Reminder sent to ${invoice.client.email}.` };
}

// --- Settings ----------------------------------------------------------------

export async function saveReminderSettings(formData: FormData): Promise<ReminderActionResult> {
  await requireOwner();

  const every = Number(formData.get("invoice_reminder_every_days"));
  if (!Number.isInteger(every) || every < 3 || every > 30) {
    return { ok: false, formError: "Pick between 3 and 30 days between invoice reminders." };
  }

  const on = (name: string) => formData.get(name) === "on";
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({
      remind_invoices: on("remind_invoices"),
      invoice_reminder_every_days: every,
      remind_quotes: on("remind_quotes"),
      remind_visits: on("remind_visits"),
      nudge_unbilled: on("nudge_unbilled"),
      nudge_quotes: on("nudge_quotes"),
      nudge_promises: on("nudge_promises"),
    })
    .eq("id", true);

  if (error) {
    console.error("[reminders] settings failed", error.message);
    return { ok: false, formError: "Your settings did not save. Try again." };
  }

  refresh();
  return { ok: true };
}

// --- the owner's own reminders ----------------------------------------------------

export type WhenPreset = "hour" | "afternoon" | "evening" | "tomorrow" | "custom";

/** Turns "this evening" into a time, in London. */
function resolveWhen(preset: WhenPreset, date?: string, time?: string): string | null {
  const now = Date.now();
  const today = todayInLondon();
  const atToday = (clock: string) => {
    const iso = londonWallTimeToIso(today, clock);
    return new Date(iso).getTime() > now + 5 * 60_000 ? iso : londonWallTimeToIso(addDays(today, 1), clock);
  };

  switch (preset) {
    case "hour":
      return new Date(now + 60 * 60_000).toISOString();
    case "afternoon":
      return atToday("14:00");
    case "evening":
      return atToday("18:00");
    case "tomorrow":
      return londonWallTimeToIso(addDays(today, 1), "08:00");
    case "custom": {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !time || !/^\d{2}:\d{2}$/.test(time)) return null;
      const iso = londonWallTimeToIso(date, time);
      const at = new Date(iso).getTime();
      if (at < now - 60_000 || at > now + 366 * 86_400_000) return null;
      return iso;
    }
    default:
      return null;
  }
}

const reminderSchema = z.object({
  title: z.string().trim().min(2, "Say what the reminder is for").max(200, "Keep it shorter"),
  when: z.enum(["hour", "afternoon", "evening", "tomorrow", "custom"]),
  date: z.string().optional(),
  time: z.string().optional(),
  job_id: uuid.optional(),
  client_id: uuid.optional(),
  enquiry_id: uuid.optional(),
  invoice_id: uuid.optional(),
  quote_id: uuid.optional(),
});

export async function createReminder(formData: FormData): Promise<ReminderActionResult> {
  const user = await requireStaff();

  const value = (name: string) => {
    const raw = formData.get(name);
    return typeof raw === "string" && raw !== "" ? raw : undefined;
  };

  const parsed = reminderSchema.safeParse({
    title: formData.get("title") ?? "",
    when: formData.get("when") ?? "",
    date: value("date"),
    time: value("time"),
    job_id: value("job_id"),
    client_id: value("client_id"),
    enquiry_id: value("enquiry_id"),
    invoice_id: value("invoice_id"),
    quote_id: value("quote_id"),
  });

  if (!parsed.success) {
    return { ok: false, formError: parsed.error.issues[0]?.message ?? "Check the reminder and try again." };
  }

  const dueAt = resolveWhen(parsed.data.when, parsed.data.date, parsed.data.time);
  if (!dueAt) return { ok: false, formError: "Pick a day and time that has not gone yet." };

  const supabase = await createClient();
  const { error } = await supabase.from("owner_reminders").insert({
    title: parsed.data.title,
    due_at: dueAt,
    kind: "manual",
    job_id: parsed.data.job_id ?? null,
    client_id: parsed.data.client_id ?? null,
    enquiry_id: parsed.data.enquiry_id ?? null,
    invoice_id: parsed.data.invoice_id ?? null,
    quote_id: parsed.data.quote_id ?? null,
    created_by: user.id,
  });

  if (error) {
    console.error("[reminders] create failed", error.message);
    return { ok: false, formError: "That reminder did not save. Try again." };
  }

  refresh();
  return { ok: true };
}

export async function completeReminder(id: string, done = true): Promise<ReminderActionResult> {
  await requireStaff();
  if (!uuid.safeParse(id).success) return { ok: false, formError: "That reminder was not found." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("owner_reminders")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) return { ok: false, formError: "That did not save. Try again." };
  refresh();
  return { ok: true };
}

/** Pushes a reminder back. It buzzes the phone again at the new time. */
export async function snoozeReminder(id: string, preset: WhenPreset): Promise<ReminderActionResult> {
  await requireStaff();
  if (!uuid.safeParse(id).success) return { ok: false, formError: "That reminder was not found." };

  const dueAt = resolveWhen(preset);
  if (!dueAt) return { ok: false, formError: "Pick when to be reminded." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("owner_reminders")
    .update({ due_at: dueAt, pushed_at: null, done_at: null })
    .eq("id", id);

  if (error) return { ok: false, formError: "That did not save. Try again." };
  refresh();
  return { ok: true };
}

const reminderEditSchema = z.object({
  title: reminderSchema.shape.title,
  // "keep" leaves the time alone, so a title fix on an overdue reminder
  // does not trip the "that time has gone" check.
  when: z.enum(["keep", "hour", "afternoon", "evening", "tomorrow", "custom"]),
  date: z.string().optional(),
  time: z.string().optional(),
});

/** Changes what a reminder says, when it goes off, or both. */
export async function updateReminder(id: string, formData: FormData): Promise<ReminderActionResult> {
  await requireStaff();
  if (!uuid.safeParse(id).success) return { ok: false, formError: "That reminder was not found." };

  const value = (name: string) => {
    const raw = formData.get(name);
    return typeof raw === "string" && raw !== "" ? raw : undefined;
  };

  const parsed = reminderEditSchema.safeParse({
    title: formData.get("title") ?? "",
    when: formData.get("when") ?? "",
    date: value("date"),
    time: value("time"),
  });
  if (!parsed.success) {
    return { ok: false, formError: parsed.error.issues[0]?.message ?? "Check the reminder and try again." };
  }

  const changes: { title: string; due_at?: string; pushed_at?: null } = { title: parsed.data.title };
  if (parsed.data.when !== "keep") {
    const dueAt = resolveWhen(parsed.data.when, parsed.data.date, parsed.data.time);
    if (!dueAt) return { ok: false, formError: "Pick a day and time that has not gone yet." };
    // A new time buzzes the phone again, even if the old one already had.
    changes.due_at = dueAt;
    changes.pushed_at = null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("owner_reminders").update(changes).eq("id", id).select("id");

  if (error) {
    console.error("[reminders] update failed", error.message);
    return { ok: false, formError: "That did not save. Try again." };
  }
  if (!data?.length) return { ok: false, formError: "That reminder was not found. It may have been deleted." };

  refresh();
  return { ok: true };
}

export async function deleteReminder(id: string): Promise<ReminderActionResult> {
  await requireStaff();
  if (!uuid.safeParse(id).success) return { ok: false, formError: "That reminder was not found." };

  const supabase = await createClient();
  const { error } = await supabase.from("owner_reminders").delete().eq("id", id);

  if (error) return { ok: false, formError: "That did not delete. Try again." };
  refresh();
  return { ok: true };
}
