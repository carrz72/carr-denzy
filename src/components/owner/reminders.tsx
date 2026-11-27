"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlarmIcon,
  BellRingingIcon,
  BellSlashIcon,
  CalendarCheckIcon,
  CheckIcon,
  ClockIcon,
  PaperPlaneTiltIcon,
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { CheckField, FormError, SelectField, TextField } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
  completeReminder,
  createReminder,
  deleteReminder,
  pauseUntil,
  saveReminderSettings,
  sendInvoiceReminderNow,
  setClientAutoReminders,
  setStopped,
  snoozeReminder,
  updateReminder,
  type WhenPreset,
} from "@/app/(app)/app/reminder-actions";
import type { ChaseEntity, Settings } from "@/types/database";

// ---------------------------------------------------------------------------
// Invoice: pause, stop, send now
// ---------------------------------------------------------------------------

export function InvoiceReminders({
  invoiceId,
  line,
  state,
  lastSentLabel,
  note,
  paused,
  stopped,
  canChase,
  clientEmail,
  today,
}: {
  invoiceId: string;
  line: string;
  state: "on" | "paused" | "off";
  lastSentLabel: string | null;
  note: string | null;
  paused: boolean;
  stopped: boolean;
  /** Sent, not paid, not cancelled. */
  canChase: boolean;
  clientEmail: string | null;
  /** YYYY-MM-DD in London, the earliest promise date. */
  today: string;
}) {
  const [mode, setMode] = useState<"idle" | "promise" | "confirm-send">("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<{ ok: boolean; formError?: string; message?: string }>, after?: string) {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError(result.formError ?? "That did not work. Try again.");
        return;
      }
      setMode("idle");
      setDone(result.message ?? after ?? null);
    });
  }

  function savePromise(formData: FormData) {
    const date = String(formData.get("promise_date") ?? "");
    const promiseNote = String(formData.get("promise_note") ?? "");
    run(() => pauseUntil("invoice", invoiceId, date, promiseNote), "Saved. Reminders are paused until then.");
  }

  const Icon = state === "on" ? BellRingingIcon : state === "paused" ? PauseIcon : BellSlashIcon;

  return (
    <Card>
      <h2 className="text-label uppercase text-ink-subtle">Payment reminders</h2>

      <p className="mt-3 flex items-start gap-2.5 text-[0.9375rem] leading-relaxed text-ink">
        <Icon
          size={19}
          weight="duotone"
          aria-hidden="true"
          className={cn(
            "mt-0.5 shrink-0",
            state === "on" ? "text-accent" : state === "paused" ? "text-caution" : "text-ink-subtle",
          )}
        />
        <span>{line}</span>
      </p>

      {note ? (
        <p className="mt-3 rounded-md bg-surface-sunken px-4 py-3 text-sm leading-relaxed text-ink-muted">
          <span className="font-medium text-ink">Your note:</span> {note}
        </p>
      ) : null}

      {lastSentLabel ? <p className="mt-2 text-sm text-ink-subtle">Last reminder sent {lastSentLabel}.</p> : null}

      {done ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-[0.9375rem] font-medium text-positive">
          <CheckIcon size={18} weight="bold" aria-hidden="true" />
          {done}
        </p>
      ) : null}

      {canChase ? (
        <div className="mt-4 flex flex-col gap-2.5 border-t border-line pt-4">
          {mode === "promise" ? (
            <form action={savePromise} className="flex flex-col gap-3">
              <TextField
                name="promise_date"
                type="date"
                label="They said they would pay by"
                min={today}
                defaultValue={today}
                required
              />
              <TextField
                name="promise_note"
                label="Note for yourself"
                placeholder="Rang Tuesday, paying when they get paid on Friday"
                maxLength={300}
                optionalLabel
              />
              <p className="text-sm leading-relaxed text-ink-muted">
                No reminders go to them until then. If it has not come by that day, reminders start again and
                your phone gets a nudge.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={pending}>
                  Save
                </Button>
                <Button type="button" variant="quiet" onClick={() => setMode("idle")} disabled={pending}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : mode === "confirm-send" ? (
            <div className="flex flex-col gap-3">
              <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
                This emails a reminder to <strong className="text-ink wrap-anywhere">{clientEmail}</strong> now.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  loading={pending}
                  icon={<PaperPlaneTiltIcon size={17} weight="bold" />}
                  onClick={() => run(() => sendInvoiceReminderNow(invoiceId))}
                >
                  Send it
                </Button>
                <Button variant="quiet" onClick={() => setMode("idle")} disabled={pending}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                variant="secondary"
                fullWidth
                icon={<CalendarCheckIcon size={18} />}
                onClick={() => setMode("promise")}
                disabled={pending}
              >
                {paused ? "Change the promised date" : "They've said when they'll pay"}
              </Button>

              {paused ? (
                <Button
                  variant="quiet"
                  fullWidth
                  icon={<PlayIcon size={17} />}
                  loading={pending}
                  onClick={() => run(() => setStopped("invoice", invoiceId, false), "Reminders are back on.")}
                >
                  Cancel the pause
                </Button>
              ) : null}

              {clientEmail ? (
                <Button
                  variant="secondary"
                  fullWidth
                  icon={<PaperPlaneTiltIcon size={18} />}
                  onClick={() => setMode("confirm-send")}
                  disabled={pending}
                >
                  Send a reminder now
                </Button>
              ) : null}

              <Button
                variant="quiet"
                fullWidth
                icon={stopped ? <BellRingingIcon size={17} /> : <BellSlashIcon size={17} />}
                loading={pending}
                onClick={() =>
                  run(
                    () => setStopped("invoice", invoiceId, !stopped),
                    stopped ? "Reminders are back on." : "Stopped. Nothing more goes to them about this invoice.",
                  )
                }
              >
                {stopped ? "Turn reminders back on" : "Stop reminders on this invoice"}
              </Button>
            </>
          )}

          <FormError message={error} />
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// One switch: quote reminder, visit reminders, a customer's reminders
// ---------------------------------------------------------------------------

function Switch({
  label,
  hint,
  checked,
  onChange,
  pending,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  pending: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-sunken p-4",
        pending && "opacity-60",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]"
      />
      <span>
        <span className="font-medium text-ink">{label}</span>
        <span className="mt-1 block text-sm leading-relaxed text-ink-muted">{hint}</span>
      </span>
    </label>
  );
}

/** Reminders on one quote or job, on or off. */
export function ReminderSwitch({
  entity,
  entityId,
  stopped,
  label,
  hint,
}: {
  entity: ChaseEntity;
  entityId: string;
  stopped: boolean;
  label: string;
  hint: string;
}) {
  const [on, setOn] = useState(!stopped);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Switch
        label={label}
        hint={hint}
        checked={on}
        pending={pending}
        onChange={(next) => {
          setOn(next);
          setError(null);
          startTransition(async () => {
            const result = await setStopped(entity, entityId, !next);
            if (!result.ok) {
              setOn(!next);
              setError(result.formError ?? "That did not save.");
            }
          });
        }}
      />
      <FormError message={error} />
    </div>
  );
}

/** The owner's switch for one customer. */
export function ClientRemindersSwitch({ clientId, on: initial }: { clientId: string; on: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Switch
        label="Send this customer automatic reminders"
        hint="Payment reminders, quote reminders and the day-before email. Untick for a regular who pays in their own time, or anyone you would rather ring."
        checked={on}
        pending={pending}
        onChange={(next) => {
          setOn(next);
          setError(null);
          startTransition(async () => {
            const result = await setClientAutoReminders(clientId, next);
            if (!result.ok) {
              setOn(!next);
              setError(result.formError ?? "That did not save.");
            }
          });
        }}
      />
      <FormError message={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Remind me
// ---------------------------------------------------------------------------

export interface ReminderLinks {
  job_id?: string;
  client_id?: string;
  enquiry_id?: string;
  invoice_id?: string;
  quote_id?: string;
}

const WHEN_OPTIONS: { value: WhenPreset; label: string }[] = [
  { value: "hour", label: "In an hour" },
  { value: "afternoon", label: "This afternoon" },
  { value: "evening", label: "This evening" },
  { value: "tomorrow", label: "Tomorrow morning" },
  { value: "custom", label: "Pick a time" },
];

type FormWhen = WhenPreset | "keep";

/** An existing reminder being changed: its id and when it is set for now. */
interface EditingReminder {
  id: string;
  whenLabel: string;
  dueDate: string;
  dueTime: string;
}

function ReminderForm({
  links,
  defaultTitle,
  onDone,
  today,
  editing,
}: {
  links: ReminderLinks;
  defaultTitle: string;
  onDone: (message: string) => void;
  today: string;
  editing?: EditingReminder;
}) {
  const [when, setWhen] = useState<FormWhen>(editing ? "keep" : "tomorrow");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options: { value: FormWhen; label: string }[] = editing
    ? [{ value: "keep", label: `Keep: ${editing.whenLabel.toLowerCase()}` }, ...WHEN_OPTIONS]
    : WHEN_OPTIONS;

  function submit(formData: FormData) {
    formData.set("when", when);
    setError(null);
    startTransition(async () => {
      if (editing) {
        const result = await updateReminder(editing.id, formData);
        if (!result.ok) {
          setError(result.formError ?? "That did not save.");
          return;
        }
        onDone("Reminder updated.");
        return;
      }

      for (const [key, value] of Object.entries(links)) if (value) formData.set(key, value);
      const result = await createReminder(formData);
      if (!result.ok) {
        setError(result.formError ?? "That reminder did not save.");
        return;
      }
      const label = WHEN_OPTIONS.find((option) => option.value === when)?.label.toLowerCase() ?? "then";
      onDone(when === "custom" ? "Reminder set. Your phone will buzz then." : `Reminder set for ${label}.`);
    });
  }

  // Changing an existing reminder starts the day and time pickers on its
  // current time (or today, if that has already gone).
  const startDate = editing && editing.dueDate >= today ? editing.dueDate : today;
  const startTime = editing && editing.dueDate >= today ? editing.dueTime : "09:00";

  return (
    <form action={submit} className="flex flex-col gap-3">
      <TextField name="title" label="What for?" defaultValue={defaultTitle} maxLength={200} required autoFocus />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium text-ink">When?</legend>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={when === option.value}
              onClick={() => setWhen(option.value)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors duration-150",
                when === option.value
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-surface text-ink hover:border-line-strong",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {when === "custom" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="date" type="date" label="Day" min={today} defaultValue={startDate} required />
          <TextField name="time" type="time" label="Time" defaultValue={startTime} required />
        </div>
      ) : null}

      <FormError message={error} />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} icon={<AlarmIcon size={18} weight="bold" />}>
          {editing ? "Save" : "Set reminder"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => onDone("")} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * "Remind me" on a job, customer, request or invoice. At the chosen time the owner's
 * phone buzzes, and tapping it opens this page.
 */
export function RemindMe({
  links,
  defaultTitle,
  today,
  className,
}: {
  links: ReminderLinks;
  defaultTitle: string;
  today: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Card className={className}>
      {open ? (
        <>
          <h2 className="mb-4 text-label uppercase text-ink-subtle">Remind me</h2>
          <ReminderForm
            links={links}
            defaultTitle={defaultTitle}
            today={today}
            onDone={(text) => {
              setOpen(false);
              setMessage(text || null);
            }}
          />
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <Button
            variant="secondary"
            fullWidth
            icon={<AlarmIcon size={18} weight="bold" />}
            onClick={() => {
              setMessage(null);
              setOpen(true);
            }}
          >
            Remind me about this
          </Button>
          {message ? (
            <p role="status" className="flex items-center gap-2 text-sm font-medium text-positive">
              <CheckIcon size={16} weight="bold" aria-hidden="true" />
              {message}{" "}
              <Link href="/app#to-do" className="text-accent underline underline-offset-4">
                See your list
              </Link>
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// To do, on the Today screen
// ---------------------------------------------------------------------------

export interface TodoItem {
  id: string;
  title: string;
  /** Where the item leads: the job, customer, invoice... */
  href: string | null;
  /** "Due now", "Tomorrow at 08:00". Worked out on the server. */
  whenLabel: string;
  /** When it is set for, in London: "2026-11-28" and "08:00". For Edit. */
  dueDate: string;
  dueTime: string;
  due: boolean;
  automatic: boolean;
}

export function TodoList({
  items,
  today,
  laterCount = 0,
}: {
  items: TodoItem[];
  today: string;
  /** Reminders set for after tomorrow, not listed yet. */
  laterCount?: number;
}) {
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Card id="to-do" className="scroll-mt-24">
      <div className="mb-1.5 flex items-center justify-between gap-4">
        <h2 className="font-display text-subheading text-ink">To do</h2>
        {!adding ? (
          <Button
            variant="quiet"
            size="sm"
            icon={<PlusIcon size={16} weight="bold" />}
            onClick={() => {
              setMessage(null);
              setAdding(true);
            }}
          >
            Add
          </Button>
        ) : null}
      </div>

      {adding ? (
        <div className="mb-4 mt-3 rounded-lg border border-line bg-surface-sunken p-4">
          <ReminderForm
            links={{}}
            defaultTitle=""
            today={today}
            onDone={(text) => {
              setAdding(false);
              setMessage(text || null);
            }}
          />
        </div>
      ) : null}

      {message ? (
        <p role="status" className="mb-3 flex items-center gap-2 text-sm font-medium text-positive">
          <CheckIcon size={16} weight="bold" aria-hidden="true" />
          {message}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm leading-relaxed text-ink-muted">
          Nothing to remember. Tap &ldquo;Remind me&rdquo; on a job or customer, or Add, and your phone will buzz
          when it is time.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <TodoRow key={item.id} item={item} today={today} />
          ))}
        </ul>
      )}

      {laterCount > 0 ? (
        <p className="mt-3 text-sm text-ink-subtle">
          {laterCount === 1 ? "1 more reminder" : `${laterCount} more reminders`} set for later. They appear here
          the day before.
        </p>
      ) : null}
    </Card>
  );
}

function TodoRow({ item, today }: { item: TodoItem; today: string }) {
  const [pending, startTransition] = useTransition();
  const [gone, setGone] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function act(task: () => Promise<{ ok: boolean; formError?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setGone(false);
        setError(result.formError ?? "That did not save.");
      }
    });
  }

  if (gone) return null;

  if (editing) {
    return (
      <li className="rounded-md border border-line bg-surface-sunken p-4">
        <ReminderForm
          links={{}}
          defaultTitle={item.title}
          today={today}
          editing={{ id: item.id, whenLabel: item.whenLabel, dueDate: item.dueDate, dueTime: item.dueTime }}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      className={cn(
        "rounded-md border bg-surface p-3",
        item.due ? "border-caution/40 bg-caution-soft" : "border-line",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={`Done: ${item.title}`}
          disabled={pending}
          onClick={() => {
            setGone(true);
            act(() => completeReminder(item.id));
          }}
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-line-strong bg-surface text-transparent transition-colors duration-150 hover:border-positive hover:text-positive"
        >
          <CheckIcon size={14} weight="bold" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          {item.href ? (
            <Link href={item.href} className="font-medium text-ink hover:underline hover:underline-offset-4">
              {item.title}
            </Link>
          ) : (
            <span className="font-medium text-ink">{item.title}</span>
          )}
          <span
            className={cn(
              "mt-0.5 flex items-center gap-1.5 text-xs",
              item.due ? "font-semibold text-caution-ink" : "text-ink-subtle",
            )}
          >
            <ClockIcon size={13} aria-hidden="true" />
            {item.whenLabel}
            {item.automatic ? " · added for you" : ""}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 pl-10">
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => snoozeReminder(item.id, "hour"))}
          className="min-h-9 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-ink-muted hover:border-line-strong hover:text-ink"
        >
          In an hour
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => snoozeReminder(item.id, "tomorrow"))}
          className="min-h-9 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-ink-muted hover:border-line-strong hover:text-ink"
        >
          Tomorrow
        </button>
        <button
          type="button"
          aria-label={`Edit: ${item.title}`}
          disabled={pending}
          onClick={() => {
            setError(null);
            setEditing(true);
          }}
          className="flex min-h-9 items-center gap-1 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-ink-muted hover:border-line-strong hover:text-ink"
        >
          <PencilSimpleIcon size={13} weight="bold" aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          aria-label={`Delete: ${item.title}`}
          disabled={pending}
          onClick={() => {
            setGone(true);
            act(() => deleteReminder(item.id));
          }}
          className="ml-auto flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-ink-subtle hover:text-critical"
        >
          <XIcon size={13} weight="bold" aria-hidden="true" />
          Delete
        </button>
      </div>

      {error ? <p className="mt-2 text-sm text-critical">{error}</p> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Settings → Reminders
// ---------------------------------------------------------------------------

export function ReminderSettingsForm({ settings }: { settings: Settings }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveReminderSettings(formData);
      if (!result.ok) setError(result.formError ?? "That did not save.");
      else setSaved(true);
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-6">
      <Card>
        <h2 className="font-display text-subheading text-ink">Emails to customers</h2>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-muted">
          Sent automatically each morning. You can still turn them off for one customer, invoice, quote or
          job on its own page.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <CheckField
            name="remind_invoices"
            label="Payment reminders"
            hint="When an invoice goes past its due date, and again every few days until it is paid."
            defaultChecked={settings.remind_invoices}
          />
          <SelectField
            name="invoice_reminder_every_days"
            label="Days between payment reminders"
            required
            defaultValue={String(settings.invoice_reminder_every_days)}
          >
            {[3, 5, 7, 10, 14, 21, 30].map((days) => (
              <option key={days} value={days}>
                Every {days} days
              </option>
            ))}
          </SelectField>
          <CheckField
            name="remind_quotes"
            label="Quote reminders"
            hint="One email three days before a quote runs out."
            defaultChecked={settings.remind_quotes}
          />
          <CheckField
            name="remind_visits"
            label="See you tomorrow"
            hint="The day before a visit: the time, the address and your number in case it no longer suits. Not sent for a visit booked in the last day, or for each day of a long job."
            defaultChecked={settings.remind_visits}
          />
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-subheading text-ink">Nudges for you</h2>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-muted">
          Added to your To do list on the Today screen, with a buzz on your phone. They tick themselves off
          once sorted.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <CheckField
            name="nudge_unbilled"
            label="Finished job not invoiced"
            hint="Two days after a job is marked finished with no invoice."
            defaultChecked={settings.nudge_unbilled}
          />
          <CheckField
            name="nudge_quotes"
            label="Quote ran out with no answer"
            hint="A prompt to give them a ring."
            defaultChecked={settings.nudge_quotes}
          />
          <CheckField
            name="nudge_promises"
            label="Promised payment did not come"
            hint="When a customer said they would pay by a day and it has passed."
            defaultChecked={settings.nudge_promises}
          />
        </div>
      </Card>

      <FormError message={error} />

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={pending}>
          Save
        </Button>
        {saved ? (
          <p role="status" className="flex items-center gap-2 text-[0.9375rem] font-medium text-positive">
            <CheckIcon size={18} weight="bold" aria-hidden="true" />
            Saved
          </p>
        ) : null}
      </div>
    </form>
  );
}
