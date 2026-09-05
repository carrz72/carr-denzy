import type { LineKind } from "@/types/database";

/**
 * The shape of a quote or invoice line while it is being typed, and the
 * conversion from a saved row back into one.
 *
 * This lives outside the editor component on purpose. It used to sit in
 * `line-items.tsx`, which carries "use client" — so every server page that
 * wanted to prefill the editor was importing a client function and crashed at
 * request time with "Attempted to call linesFromItems() from the server".
 * That took out "Invoice this quote", and it would have taken out editing a
 * draft quote too.
 *
 * Nothing here touches the DOM or React, so both halves can use it.
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

export function newKey(): string {
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

/** Turns saved rows back into draft lines, for editing or copying onto an invoice. */
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
