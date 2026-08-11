"use client";

import { useState, useTransition } from "react";
import {
  CheckIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { FormError, SelectField, TextField } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import {
  createPriceItem,
  deletePriceItem,
  updatePriceItem,
} from "@/app/(app)/app/settings/prices/actions";
import { formatPence, formatPenceBare } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { LineKind, PriceItem } from "@/types/database";

/**
 * The owner's price list.
 *
 * Edited inline, in place, rather than in a modal. A modal for "change 85 to
 * 90" hides the rest of the list behind an overlay at exactly the moment the
 * owner wants to compare it against the neighbouring rates.
 *
 * Deleting asks first, and the confirmation names the item — a bare "Are you
 * sure?" is the dialogue people learn to dismiss without reading.
 */

const kindLabels: Record<LineKind, string> = {
  labour: "Labour",
  materials: "Materials",
  other: "Other",
};

const kindTones = {
  labour: "info",
  materials: "accent",
  other: "neutral",
} as const;

export function PriceListManager({ items }: { items: PriceItem[] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const labour = items.filter((item) => item.kind === "labour");
  const materials = items.filter((item) => item.kind === "materials");
  const other = items.filter((item) => item.kind === "other");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-subheading text-ink">Your price list</h2>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-muted">
              These are the lines you can drop into a quote or an invoice with one tap.
              Changing one here does not change any quote or invoice you have already
              sent.
            </p>
          </div>

          {!adding ? (
            <Button
              variant="secondary"
              onClick={() => {
                setAdding(true);
                setEditingId(null);
              }}
              icon={<PlusIcon size={18} weight="bold" />}
            >
              Add an item
            </Button>
          ) : null}
        </div>

        {adding ? (
          <div className="mt-6 border-t border-line pt-6">
            <PriceItemForm
              mode="create"
              onDone={() => setAdding(false)}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : null}
      </Card>

      {items.length === 0 && !adding ? (
        <EmptyState
          title="Your price list is empty"
          description="Add the things you charge for most often — a call-out, an hourly rate, a boiler service. They then appear as one-tap options whenever you build a quote or an invoice, so you are not retyping the same figures every week."
        />
      ) : null}

      {[
        { heading: "Labour", rows: labour },
        { heading: "Materials", rows: materials },
        { heading: "Other", rows: other },
      ].map((group) =>
        group.rows.length === 0 ? null : (
          <section key={group.heading}>
            <h3 className="text-label uppercase text-ink-subtle">{group.heading}</h3>

            <ul className="mt-3 flex flex-col gap-2">
              {group.rows.map((item) => (
                <li key={item.id}>
                  {editingId === item.id ? (
                    <Card>
                      <PriceItemForm
                        mode="edit"
                        item={item}
                        onDone={() => setEditingId(null)}
                        onCancel={() => setEditingId(null)}
                      />
                    </Card>
                  ) : (
                    <PriceRow
                      item={item}
                      confirming={confirmingId === item.id}
                      onEdit={() => {
                        setEditingId(item.id);
                        setAdding(false);
                      }}
                      onAskDelete={() => setConfirmingId(item.id)}
                      onCancelDelete={() => setConfirmingId(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

function PriceRow({
  item,
  confirming,
  onEdit,
  onAskDelete,
  onCancelDelete,
}: {
  item: PriceItem;
  confirming: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    const formData = new FormData();
    formData.set("id", item.id);

    startTransition(async () => {
      const result = await deletePriceItem(formData);
      if (!result.ok) setError(result.formError ?? "Could not remove that.");
      else onCancelDelete();
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-surface-raised p-4 shadow-subtle",
        confirming ? "border-critical/40" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{item.description}</p>
          <p className="mt-0.5 flex items-center gap-2 text-sm text-ink-subtle">
            <Badge tone={kindTones[item.kind]}>{kindLabels[item.kind]}</Badge>
            <span>per {item.unit}</span>
          </p>
        </div>

        <p className="font-mono text-lg font-semibold tabular-nums text-ink">
          {formatPence(item.unit_price_pence)}
        </p>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="flex size-11 items-center justify-center rounded-md text-ink-muted transition-colors duration-200 hover:bg-surface-sunken hover:text-ink"
          >
            <span className="sr-only">Edit {item.description}</span>
            <PencilSimpleIcon size={19} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={confirming ? onCancelDelete : onAskDelete}
            className="flex size-11 items-center justify-center rounded-md text-ink-muted transition-colors duration-200 hover:bg-critical-soft hover:text-critical"
          >
            <span className="sr-only">
              {confirming ? `Keep ${item.description}` : `Remove ${item.description}`}
            </span>
            {confirming ? (
              <XIcon size={19} aria-hidden="true" />
            ) : (
              <TrashIcon size={19} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* The confirmation names the thing being deleted, so it cannot be
          dismissed on autopilot. */}
      {confirming ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <p className="min-w-0 flex-1 text-[0.9375rem] text-ink">
            Remove <strong>{item.description}</strong> from your price list? Quotes and
            invoices that already use it are not affected.
          </p>

          <div className="flex gap-2">
            <Button size="sm" variant="destructive" loading={isPending} onClick={handleDelete}>
              Remove it
            </Button>
            <Button size="sm" variant="quiet" onClick={onCancelDelete} disabled={isPending}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PriceItemForm({
  mode,
  item,
  onDone,
  onCancel,
}: {
  mode: "create" | "edit";
  item?: PriceItem;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setErrors({});
    setFormError(null);

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createPriceItem(formData)
          : await updatePriceItem(formData);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      onDone();
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}

      <TextField
        name="description"
        label="What is it?"
        required
        placeholder="Standard call-out and first hour"
        defaultValue={item?.description ?? ""}
        error={errors.description}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          name="unit_price_pounds"
          label="Price"
          required
          inputMode="decimal"
          prefix="£"
          placeholder="85.00"
          hint="Excluding VAT"
          defaultValue={item ? formatPenceBare(item.unit_price_pence) : ""}
          error={errors.unit_price_pounds}
        />

        <TextField
          name="unit"
          label="Charged per"
          required
          placeholder="visit"
          defaultValue={item?.unit ?? "each"}
          error={errors.unit}
        />

        <SelectField
          name="kind"
          label="Type"
          required
          defaultValue={item?.kind ?? "labour"}
          error={errors.kind}
          // Labour vs materials is not cosmetic: if CIS is ever switched on,
          // the deduction applies to labour only.
          hint="Labour or materials"
        >
          <option value="labour">Labour</option>
          <option value="materials">Materials</option>
          <option value="other">Other</option>
        </SelectField>
      </div>

      <FormError message={formError} />

      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <Button
          type="submit"
          loading={isPending}
          icon={<CheckIcon size={18} weight="bold" />}
        >
          {mode === "create" ? "Add to the list" : "Save the change"}
        </Button>

        <Button variant="quiet" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
