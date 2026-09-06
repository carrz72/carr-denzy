"use client";

import { useState, useTransition } from "react";
import {
  CheckIcon,
  PlusIcon,
  TrashIcon,
  UserCirclePlusIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { FormError, SelectField, TextField } from "@/components/ui/field";
import {
  addClientMember,
  removeClientMember,
  setMemberRole,
} from "@/app/(app)/app/clients/member-actions";
import { cn } from "@/lib/cn";
import type { ClientMember } from "@/types/database";

/**
 * Who else can see this account.
 *
 * One component for both sides — the owner's customer page and the customer's
 * own portal — because the rules are the same and writing it twice is how the
 * two drift apart. `audience` only changes the wording; what a person is
 * allowed to do is decided by RLS, not by which screen they are looking at.
 *
 * The distinction the copy has to earn is manager vs viewer: a viewer sees
 * everything and can answer nothing, and the difference matters most at the
 * moment a quote arrives.
 */
export function ClientMembers({
  clientId,
  clientName,
  members,
  audience,
  canManage,
}: {
  clientId: string;
  clientName: string;
  members: ClientMember[];
  audience: "owner" | "customer";
  /** False for a viewer: the whole panel becomes read-only. */
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const forOwner = audience === "owner";
  const firstName = clientName.split(" ")[0] ?? clientName;

  function run(
    action: (data: FormData) => Promise<{ ok: boolean; formError?: string; errors?: Record<string, string>; warning?: string }>,
    data: FormData,
    onDone?: () => void,
  ) {
    setErrors({});
    setFormError(null);
    setWarning(null);

    startTransition(async () => {
      const result = await action(data);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      setWarning(result.warning ?? null);
      onDone?.();
    });
  }

  function handleAdd(formData: FormData) {
    run(addClientMember, formData, () => setAdding(false));
  }

  function changeRole(member: ClientMember, role: string) {
    const data = new FormData();
    data.set("id", member.id);
    data.set("client_id", clientId);
    data.set("role", role);
    run(setMemberRole, data);
  }

  function remove(member: ClientMember) {
    const data = new FormData();
    data.set("id", member.id);
    data.set("client_id", clientId);
    run(removeClientMember, data);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-label uppercase text-ink-subtle">
            {forOwner ? "Who else can see this" : "People on your account"}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            {forOwner
              ? `Anyone here signs in with their own email and sees ${firstName}'s jobs, quotes and invoices. They also get the quote and invoice emails.`
              : "Add your partner, a colleague or your letting agent. They sign in with their own email and see the same jobs, quotes and invoices as you."}
          </p>
        </div>

        {canManage && !adding ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAdding(true)}
            icon={<PlusIcon size={16} weight="bold" />}
          >
            Add someone
          </Button>
        ) : null}
      </div>

      {adding ? (
        <form action={handleAdd} className="mt-5 flex flex-col gap-4 border-t border-line pt-5">
          <input type="hidden" name="client_id" value={clientId} />

          <TextField
            name="email"
            label="Their email"
            type="email"
            inputMode="email"
            required
            hint="We send them a link. There is no password to set up."
            error={errors.email}
          />

          <SelectField
            name="role"
            label="What they can do"
            defaultValue="viewer"
            hint="You can change this later."
          >
            <option value="viewer">Look only — cannot accept quotes</option>
            <option value="manager">Everything, including accepting quotes</option>
          </SelectField>

          <FormError message={formError} />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={isPending} icon={<UserCirclePlusIcon size={18} />}>
              Send them a link
            </Button>
            <Button variant="quiet" onClick={() => setAdding(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {warning ? (
        <p className="mt-4 flex items-start gap-2.5 rounded-lg border border-caution/30 bg-caution-soft px-4 py-3 text-[0.9375rem] font-medium text-caution-ink">
          <WarningIcon size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
          {warning}
        </p>
      ) : null}

      {!adding && formError ? (
        <div className="mt-4">
          <FormError message={formError} />
        </div>
      ) : null}

      {members.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-2 border-t border-line pt-5">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface p-3.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block wrap-anywhere font-medium text-ink">{member.email}</span>
                <span className="mt-0.5 block text-sm text-ink-subtle">
                  {member.role === "manager" ? "Can accept quotes" : "Look only"}
                  {member.profile_id ? "" : " · has not signed in yet"}
                </span>
              </span>

              {canManage ? (
                <>
                  <SelectField
                    name={`role-${member.id}`}
                    label="What they can do"
                    hideLabel
                    value={member.role}
                    disabled={isPending}
                    containerClassName="w-full sm:w-52"
                    onChange={(event) => changeRole(member, event.target.value)}
                  >
                    <option value="viewer">Look only</option>
                    <option value="manager">Can accept quotes</option>
                  </SelectField>

                  <button
                    type="button"
                    onClick={() => remove(member)}
                    disabled={isPending}
                    title={`Remove ${member.email}`}
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-md text-ink-subtle",
                      "transition-colors duration-200 hover:bg-critical-soft hover:text-critical",
                      "active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
                    )}
                  >
                    <TrashIcon size={17} aria-hidden="true" />
                    <span className="sr-only">Remove {member.email}</span>
                  </button>
                </>
              ) : (
                <span className="text-sm text-ink-subtle">
                  {member.role === "manager" ? "Manager" : "Viewer"}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : !adding ? (
        <p className="mt-4 flex items-center gap-2 text-[0.9375rem] text-ink-muted">
          <CheckIcon size={17} weight="bold" className="shrink-0 text-positive" aria-hidden="true" />
          {forOwner ? "Nobody else — just the customer." : "Just you at the moment."}
        </p>
      ) : null}

      {!canManage ? (
        <p className="mt-4 text-sm text-ink-subtle">
          You can see this account but not change who else has access. Ask whoever set it up.
        </p>
      ) : null}
    </Card>
  );
}
