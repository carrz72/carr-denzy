"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, PlusIcon, UserCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { FormError, TextField } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import { addTeamMember, removeTeamMember, updateTeamMember } from "@/app/(app)/app/settings/team/actions";
import type { StaffLevel, StaffPermissionName } from "@/types/database";

export type TeamPermissions = { level: StaffLevel } & Record<StaffPermissionName, boolean>;

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  lastSignIn: string | null;
  permissions: TeamPermissions;
}

const LEVELS: { value: StaffLevel; label: string; blurb: string }[] = [
  {
    value: "jobs",
    label: "Jobs only",
    blurb: "Sees jobs, the diary, addresses and phone numbers. Adds notes and photos. No prices or money.",
  },
  {
    value: "jobs_quotes",
    label: "Jobs and quotes",
    blurb: "As above, plus adds jobs and customers, books visits, and makes and sends quotes. No invoices.",
  },
  {
    value: "office",
    label: "Office",
    blurb: "Everything except Settings and the team: jobs, quotes, invoices and payments.",
  },
];

/** What each level ticks. the owner can then change any box. */
const PRESETS: Record<StaffLevel, Omit<TeamPermissions, "level">> = {
  jobs: {
    see_all_jobs: false,
    manage_jobs: false,
    see_prices: false,
    manage_quotes: false,
    manage_invoices: false,
    record_payments: false,
  },
  jobs_quotes: {
    see_all_jobs: true,
    manage_jobs: true,
    see_prices: true,
    manage_quotes: true,
    manage_invoices: false,
    record_payments: false,
  },
  office: {
    see_all_jobs: true,
    manage_jobs: true,
    see_prices: true,
    manage_quotes: true,
    manage_invoices: true,
    record_payments: true,
  },
};

const BOXES: { name: StaffPermissionName; label: string; hint: string }[] = [
  { name: "see_all_jobs", label: "Sees every job", hint: "Off: only the jobs you give them on the job page." },
  { name: "manage_jobs", label: "Adds and changes jobs and customers", hint: "Also books visits and handles new requests." },
  { name: "see_prices", label: "Sees prices, quotes and invoices", hint: "Read only." },
  { name: "manage_quotes", label: "Makes and sends quotes", hint: "" },
  { name: "manage_invoices", label: "Makes and sends invoices", hint: "" },
  { name: "record_payments", label: "Records payments", hint: "" },
];

function summary(p: TeamPermissions): string {
  const level = LEVELS.find((l) => l.value === p.level)?.label ?? "Custom";
  const extras: string[] = [];
  extras.push(p.see_all_jobs ? "every job" : "only jobs given to them");
  return `${level} · ${extras.join(", ")}`;
}

function PermissionFields({ initial }: { initial: TeamPermissions }) {
  const [p, setP] = useState<TeamPermissions>(initial);

  const setLevel = (level: StaffLevel) => setP({ level, ...PRESETS[level] });

  const toggle = (name: StaffPermissionName, on: boolean) => {
    const next = { ...p, [name]: on };
    // Same rules the database keeps, shown as they happen.
    if (name === "manage_jobs" && on) next.see_all_jobs = true;
    if (name === "see_all_jobs" && !on) next.manage_jobs = false;
    if ((name === "manage_quotes" || name === "manage_invoices" || name === "record_payments") && on) next.see_prices = true;
    if (name === "see_prices" && !on) {
      next.manage_quotes = false;
      next.manage_invoices = false;
      next.record_payments = false;
    }
    setP(next);
  };

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-sm font-medium text-ink">What they can do</legend>
        {LEVELS.map((level) => (
          <label
            key={level.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-raised p-4",
              "transition-[border-color,background-color] duration-200 hover:border-line-strong",
              p.level === level.value && "border-accent bg-accent-soft",
            )}
          >
            <input
              type="radio"
              name="level"
              value={level.value}
              checked={p.level === level.value}
              onChange={() => setLevel(level.value)}
              className="mt-1 size-4 accent-[var(--color-accent)]"
            />
            <span>
              <span className="block font-medium text-ink">{level.label}</span>
              <span className="mt-0.5 block text-sm leading-snug text-ink-muted">{level.blurb}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-ink">Fine-tune</legend>
        {BOXES.map((box) => (
          <label
            key={box.name}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-1 py-1.5 hover:bg-surface-sunken"
          >
            <input
              type="checkbox"
              name={box.name}
              checked={p[box.name]}
              onChange={(event) => toggle(box.name, event.target.checked)}
              className="mt-1 size-4 accent-[var(--color-accent)]"
            />
            <span>
              <span className="block text-[0.9375rem] text-ink">{box.label}</span>
              {box.hint ? <span className="block text-sm text-ink-muted">{box.hint}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

export function TeamManager({ members }: { members: TeamMember[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null); // "new" or a member id
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string; formError?: string; errors?: Record<string, string> }>) {
    setError(null);
    setErrors({});
    setDone(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.formError ?? null);
        setErrors(result.errors ?? {});
        return;
      }
      setDone(result.message ?? "Saved.");
      setOpen(null);
      setConfirmRemove(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {done ? (
        <p role="status" className="flex items-start gap-2 font-medium text-positive">
          <CheckIcon size={18} weight="bold" aria-hidden="true" className="mt-1 shrink-0" />
          {done}
        </p>
      ) : null}

      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-label uppercase text-ink-subtle">People</h2>
          {open !== "new" ? (
            <Button data-help="add-staff" size="sm" variant="secondary" icon={<PlusIcon size={16} weight="bold" />} onClick={() => setOpen("new")}>
              Add someone
            </Button>
          ) : null}
        </div>

        {members.length === 0 && open !== "new" ? (
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            Nobody yet. Add a helper, an apprentice or someone who does your paperwork, and choose
            what they can see. They sign in with their own email.
          </p>
        ) : null}

        {open === "new" ? (
          <form action={(formData) => run(() => addTeamMember(formData))} className="mt-5 flex flex-col gap-5 border-t border-line pt-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField name="full_name" label="Their name" required autoComplete="off" error={errors.full_name} />
              <TextField
                name="email"
                label="Their email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                required
                autoComplete="off"
                error={errors.email}
                hint="They sign in with this. Not one they use as a customer."
              />
            </div>
            <PermissionFields initial={{ level: "jobs", ...PRESETS.jobs }} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={isPending}>Add and email them</Button>
              <Button variant="quiet" onClick={() => setOpen(null)}>Cancel</Button>
            </div>
            <FormError message={error} />
          </form>
        ) : null}

        {members.length > 0 ? (
          <ul className="mt-4 flex flex-col divide-y divide-line border-t border-line">
            {members.map((member) => (
              <li key={member.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <UserCircleIcon size={26} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{member.name}</p>
                      <p className="break-all text-sm text-ink-muted">{member.email}</p>
                      <p className="mt-1 text-sm text-ink-muted">{summary(member.permissions)}</p>
                      <p className="text-sm text-ink-subtle">
                        {member.lastSignIn ? `Last signed in ${formatDateTime(member.lastSignIn)}` : "Not signed in yet"}
                      </p>
                    </div>
                  </div>
                  {open !== member.id ? (
                    <Button size="sm" variant="secondary" onClick={() => { setOpen(member.id); setConfirmRemove(null); }}>
                      Change
                    </Button>
                  ) : null}
                </div>

                {open === member.id ? (
                  <form
                    action={(formData) => run(() => updateTeamMember(formData))}
                    className="mt-5 flex flex-col gap-5"
                  >
                    <input type="hidden" name="profile_id" value={member.id} />
                    <PermissionFields initial={member.permissions} />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" loading={isPending}>Save</Button>
                      <Button variant="quiet" onClick={() => setOpen(null)}>Cancel</Button>
                    </div>
                    <FormError message={error} />

                    <div className="border-t border-line pt-4">
                      {confirmRemove === member.id ? (
                        <div className="flex flex-col gap-3">
                          <p className="text-[0.9375rem] text-ink-muted">
                            {member.name} will lose access straight away. Jobs given to them go back
                            to nobody in particular. Nothing they did is deleted.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="destructive" loading={isPending} onClick={() => run(() => removeTeamMember(member.id))}>
                              Yes, remove them
                            </Button>
                            <Button variant="quiet" onClick={() => setConfirmRemove(null)}>Keep them</Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="quiet" onClick={() => setConfirmRemove(member.id)}>
                          Remove from the team
                        </Button>
                      )}
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <p className="text-sm leading-relaxed text-ink-muted">
        These limits are enforced by the database, not just hidden: someone on &ldquo;Jobs
        only&rdquo; cannot open an invoice even with its link. You get a notification on your
        phone when a team member finishes a job, sends a quote or invoice, or records a payment.
      </p>
    </div>
  );
}
