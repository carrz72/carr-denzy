"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { TotalsPanel } from "@/components/money-document";
import {
  applyRateBp,
  calculateTotals,
  formatPence,
  lineAmountPence,
  parsePence,
  parseQuantity,
} from "@/lib/money";
import { cn } from "@/lib/cn";
import type { LineKind, PriceItem } from "@/types/database";

/**
 * The line editor behind every quote and every invoice.
 *
 * Two decisions carry most of the weight here:
 *
 * 1. A line holds what the owner *typed*, as text, and is parsed for display
 *    only. Storing a parsed number per keystroke turns "1." into 1 and fights
 *    the person mid-entry; a half-typed price is a legitimate state.
 *
 * 2. The totals shown are a preview, computed by `calculateTotals`, which
 *    mirrors the SQL. Nothing here is submitted as a total — only the lines go
 *    to the server, and the database recomputes from them (spec FR-40, AC-5).
 *    So the worst a tampered payload can achieve is a wrong-looking preview on
 *    the tamperer's own screen.
 */

export interface DraftLine {
  key: string;
  description: string;
  kind: LineKind;
  /** As typed: "2.5", "1", "0.25". */
  quantity: string;
  /** As typed, in pounds: "45", "45.00", "1,250.50". */
  unitPrice: string;
  vatRateBp: number;
}

export interface SerialisedLine {
  description: string;
  kind: LineKind;
  quantity_milli: number;
  unit_price_pence: number;
  vat_rate_bp: number;
  sort_order: number;
}

const kindLabels: Record<LineKind, string> = {
  labour: "Labour",
  materials: "Materials",
  other: "Other",
};

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function emptyLine(vatRateBp = 0, key: string = newKey()): DraftLine {
  return {
    key,
    description: "",
    kind: "labour",
    quantity: "1",
    unitPrice: "",
    vatRateBp,
  };
}

/** Turns saved rows back into draft lines, for "copy this quote onto an invoice". */
export function linesFromItems(
  items: Array<{
    description: string;
    kind: LineKind;
    quantity_milli: number;
    unit_price_pence: number;
    vat_rate_bp: number;
  }>,
): DraftLine[] {
  return items.map((item) => ({
    key: newKey(),
    description: item.description,
    kind: item.kind,
    quantity: String(Number((item.quantity_milli / 1000).toFixed(3))),
    unitPrice: (item.unit_price_pence / 100).toFixed(2),
    vatRateBp: item.vat_rate_bp,
  }));
}

function serialise(lines: DraftLine[]): SerialisedLine[] {
  return lines
    .map((line) => ({
      description: line.description.trim(),
      kind: line.kind,
      quantity_milli: parseQuantity(line.quantity) ?? 0,
      unit_price_pence: parsePence(line.unitPrice) ?? 0,
      vat_rate_bp: line.vatRateBp,
    }))
    // A blank row the owner tabbed past is not an error — it is nothing. Only
    // lines with something to say are sent.
    .filter((line) => line.description !== "" && line.quantity_milli > 0)
    .map((line, index) => ({ ...line, sort_order: index }));
}

export interface LineItemEditorProps {
  /** Name of the hidden field carrying the JSON payload. */
  name?: string;
  initialLines?: DraftLine[];
  priceItems: PriceItem[];
  vatRegistered: boolean;
  cisEnabled: boolean;
  cisDeductionRateBp: number;
  defaultVatRateBp: number;
  /** Invoices only. Suppresses VAT on the preview the way the SQL does. */
  reverseCharge?: boolean;
  error?: string;
  onChange?: (state: { lines: SerialisedLine[]; totalPence: number }) => void;
}

export function LineItemEditor({
  name = "items",
  initialLines,
  priceItems,
  vatRegistered,
  cisEnabled,
  cisDeductionRateBp,
  defaultVatRateBp,
  reverseCharge = false,
  error,
  onChange,
}: LineItemEditorProps) {
  const defaultVat = vatRegistered ? defaultVatRateBp : 0;

  // Fixed key: this runs during SSR and again on hydration, and a random one
  // would differ between the two, mismatching every id derived from it.
  const [lines, setLines] = useState<DraftLine[]>(
    () => (initialLines?.length ? initialLines : [emptyLine(defaultVat, "line-1")]),
  );

  const serialised = useMemo(() => serialise(lines), [lines]);

  const totals = useMemo(
    () =>
      calculateTotals(serialised, {
        vatRegistered,
        cisEnabled,
        cisDeductionRateBp,
        reverseCharge,
      }),
    [serialised, vatRegistered, cisEnabled, cisDeductionRateBp, reverseCharge],
  );

  // `onChange` is usually an inline arrow, so depending on it directly would
  // fire this effect on every parent render. The ref keeps it current without
  // making it a dependency.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    onChangeRef.current?.({ lines: serialised, totalPence: totals.totalPence });
  }, [serialised, totals.totalPence]);

  const update = useCallback((key: string, patch: Partial<DraftLine>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setLines((current) => {
      const next = current.filter((line) => line.key !== key);
      // Never leave the owner staring at nothing with no obvious way back.
      return next.length ? next : [emptyLine(defaultVat)];
    });
  }, [defaultVat]);

  const move = useCallback((key: string, direction: -1 | 1) => {
    setLines((current) => {
      const index = current.findIndex((line) => line.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;

      const moving = current[index];
      const displaced = current[target];
      if (!moving || !displaced) return current;

      const next = [...current];
      next[index] = displaced;
      next[target] = moving;
      return next;
    });
  }, []);

  function addBlank() {
    setLines((current) => [...current, emptyLine(defaultVat)]);
  }

  function addFromPriceList(priceItemId: string) {
    const item = priceItems.find((entry) => entry.id === priceItemId);
    if (!item) return;

    setLines((current) => [
      ...current,
      {
        key: newKey(),
        description: item.description,
        kind: item.kind,
        quantity: "1",
        unitPrice: (item.unit_price_pence / 100).toFixed(2),
        vatRateBp: defaultVat,
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name={name} value={JSON.stringify(serialised)} readOnly />

      <ul className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const quantityMilli = parseQuantity(line.quantity);
          const unitPricePence = parsePence(line.unitPrice);

          const amount =
            quantityMilli !== null && unitPricePence !== null
              ? lineAmountPence(quantityMilli, unitPricePence)
              : null;

          return (
            <li
              key={line.key}
              className="rounded-lg border border-line bg-surface-raised p-4 shadow-subtle sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-label uppercase text-ink-subtle">
                  Line {index + 1}
                </span>

                <div className="flex items-center gap-1">
                  <IconButton
                    label={`Move line ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => move(line.key, -1)}
                  >
                    <ArrowUpIcon size={17} />
                  </IconButton>
                  <IconButton
                    label={`Move line ${index + 1} down`}
                    disabled={index === lines.length - 1}
                    onClick={() => move(line.key, 1)}
                  >
                    <ArrowDownIcon size={17} />
                  </IconButton>
                  <IconButton
                    label={`Remove line ${index + 1}`}
                    tone="critical"
                    onClick={() => remove(line.key)}
                  >
                    <TrashIcon size={17} />
                  </IconButton>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-4">
                <TextField
                  label="What is it for"
                  name={`line-description-${line.key}`}
                  value={line.description}
                  onChange={(event) => update(line.key, { description: event.target.value })}
                  placeholder="Replace 15mm compression elbow under sink"
                  autoComplete="off"
                  required
                />

                <div
                  className={cn(
                    "grid gap-4",
                    vatRegistered ? "sm:grid-cols-4" : "sm:grid-cols-3",
                  )}
                >
                  <SelectField
                    label="Type"
                    name={`line-kind-${line.key}`}
                    value={line.kind}
                    onChange={(event) =>
                      update(line.key, { kind: event.target.value as LineKind })
                    }
                    required
                  >
                    {(Object.keys(kindLabels) as LineKind[]).map((kind) => (
                      <option key={kind} value={kind}>
                        {kindLabels[kind]}
                      </option>
                    ))}
                  </SelectField>

                  <TextField
                    label="How many"
                    name={`line-quantity-${line.key}`}
                    value={line.quantity}
                    onChange={(event) => update(line.key, { quantity: event.target.value })}
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    error={
                      line.quantity.trim() !== "" && quantityMilli === null
                        ? "Enter a number, for example 2.5"
                        : undefined
                    }
                  />

                  <TextField
                    label="Price each"
                    name={`line-price-${line.key}`}
                    value={line.unitPrice}
                    onChange={(event) => update(line.key, { unitPrice: event.target.value })}
                    inputMode="decimal"
                    prefix="£"
                    autoComplete="off"
                    required
                    error={
                      line.unitPrice.trim() !== "" && unitPricePence === null
                        ? "Enter an amount, for example 45.00"
                        : undefined
                    }
                  />

                  {vatRegistered ? (
                    <SelectField
                      label="VAT"
                      name={`line-vat-${line.key}`}
                      value={String(line.vatRateBp)}
                      onChange={(event) =>
                        update(line.key, { vatRateBp: Number(event.target.value) })
                      }
                    >
                      <option value="0">Zero rated</option>
                      <option value="500">5% reduced</option>
                      <option value="2000">20% standard</option>
                    </SelectField>
                  ) : null}
                </div>
              </div>

              <p className="mt-4 flex items-baseline justify-between border-t border-line pt-3 text-sm">
                <span className="text-ink-muted">Line total</span>
                <span className="font-mono text-base font-semibold tabular-nums text-ink">
                  {amount === null ? "—" : formatPence(amount)}
                  {vatRegistered && !reverseCharge && amount !== null && line.vatRateBp > 0 ? (
                    <span className="ml-2 text-xs font-normal text-ink-subtle">
                      + {formatPence(applyRateBp(amount, line.vatRateBp))} VAT
                    </span>
                  ) : null}
                </span>
              </p>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="text-sm font-medium text-critical">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <Button
          variant="secondary"
          onClick={addBlank}
          icon={<PlusIcon size={18} weight="bold" />}
        >
          Add a line
        </Button>

        {priceItems.length > 0 ? (
          <SelectField
            label="Or take one from your price list"
            name="price-list-picker"
            value=""
            containerClassName="min-w-56 flex-1"
            onChange={(event) => {
              addFromPriceList(event.target.value);
              // Reset so the same item can be added twice in a row.
              event.target.value = "";
            }}
          >
            <option value="">Choose…</option>
            {priceItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.description} — {formatPence(item.unit_price_pence)} / {item.unit}
              </option>
            ))}
          </SelectField>
        ) : null}
      </div>

      <TotalsPanel
        subtotalPence={totals.subtotalPence}
        vatPence={totals.vatPence}
        cisDeductionPence={totals.cisDeductionPence}
        totalPence={totals.totalPence}
        vatRegistered={vatRegistered}
        cisEnabled={cisEnabled}
        cisDeductionRateBp={cisDeductionRateBp}
        reverseCharge={reverseCharge}
      />
    </div>
  );
}

function IconButton({
  label,
  tone = "neutral",
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone?: "neutral" | "critical";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "flex size-11 items-center justify-center rounded-md",
        "transition-colors duration-200 [transition-timing-function:var(--ease-standard)]",
        "disabled:pointer-events-none disabled:opacity-30",
        tone === "critical"
          ? "text-ink-subtle hover:bg-critical-soft hover:text-critical"
          : "text-ink-subtle hover:bg-surface-sunken hover:text-ink",
      )}
    >
      <span aria-hidden="true">{children}</span>
      <span className="sr-only">{label}</span>
    </button>
  );
}
