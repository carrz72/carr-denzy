/**
 * Money.
 *
 * Every amount in this application is an integer number of pence. Floats are
 * never used for money — `0.1 + 0.2` is famously not `0.3`, and a customer
 * invoice is the last place to discover that.
 *
 * Quantities are integers multiplied by 1000, so 2.5 hours is 2500. This lets
 * a quantity of 0.25 exist without a decimal anywhere in the pipeline.
 *
 * These helpers mirror `line_amount_pence()` and `apply_rate_bp()` in
 * `supabase/migrations/20260810091000_functions.sql`. The database is the
 * authority; this is for previewing a total before it is saved. If you change
 * the rounding here, change it there too.
 */

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const gbpNoSymbol = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 34200 → "£342.00" */
export function formatPence(pence: number): string {
  return gbp.format(pence / 100);
}

/** 34200 → "342.00" — for use inside an input, where the £ is a prefix. */
export function formatPenceBare(pence: number): string {
  return gbpNoSymbol.format(pence / 100);
}

/**
 * Parses what a person actually types into a money field: "342", "£342.00",
 * "1,250.5", " 89.99 ". Returns null on anything it cannot read, so the caller
 * can show an error rather than silently storing a zero.
 */
export function parsePence(input: string): number | null {
  const cleaned = input.replace(/[£\s,]/g, "");
  if (cleaned === "") return null;
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  return Math.round(value * 100);
}

/** 2500 → "2.5" — trailing zeros trimmed, because "2.500 hours" reads badly. */
export function formatQuantity(quantityMilli: number): string {
  const value = quantityMilli / 1000;
  return String(Number(value.toFixed(3)));
}

/** "2.5" → 2500. Returns null if the text is not a positive quantity. */
export function parseQuantity(input: string): number | null {
  const cleaned = input.trim();
  if (cleaned === "") return null;
  if (!/^\d*(\.\d{0,3})?$/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;

  return Math.round(value * 1000);
}

/** Half-up to the nearest penny, matching the SQL function exactly. */
export function lineAmountPence(quantityMilli: number, unitPricePence: number): number {
  return Math.floor((quantityMilli * unitPricePence + 500) / 1000);
}

/** Applies a rate in basis points. 2000bp = 20%. Half-up, matching SQL. */
export function applyRateBp(amountPence: number, rateBp: number): number {
  return Math.floor((amountPence * rateBp + 5000) / 10000);
}

export interface TotallableLine {
  quantity_milli: number;
  unit_price_pence: number;
  vat_rate_bp: number;
  kind: "labour" | "materials" | "other";
}

export interface TotalsOptions {
  vatRegistered: boolean;
  cisEnabled: boolean;
  cisDeductionRateBp: number;
  reverseCharge: boolean;
}

export interface Totals {
  subtotalPence: number;
  vatPence: number;
  cisDeductionPence: number;
  totalPence: number;
}

/**
 * Preview totals for a set of lines. Used to keep the quote and invoice
 * builders responsive while typing; the saved figures always come back from
 * the database trigger.
 */
export function calculateTotals(lines: TotallableLine[], options: TotalsOptions): Totals {
  let subtotalPence = 0;
  let vatPence = 0;
  let labourPence = 0;

  for (const line of lines) {
    const amount = lineAmountPence(line.quantity_milli, line.unit_price_pence);
    subtotalPence += amount;

    if (options.vatRegistered && !options.reverseCharge) {
      vatPence += applyRateBp(amount, line.vat_rate_bp);
    }

    if (line.kind === "labour") {
      labourPence += amount;
    }
  }

  // CIS is deducted from labour only, never from materials.
  const cisDeductionPence = options.cisEnabled
    ? applyRateBp(labourPence, options.cisDeductionRateBp)
    : 0;

  return {
    subtotalPence,
    vatPence,
    cisDeductionPence,
    totalPence: subtotalPence + vatPence - cisDeductionPence,
  };
}

/** "20%" from 2000 basis points. */
export function formatRateBp(rateBp: number): string {
  return `${Number((rateBp / 100).toFixed(2))}%`;
}
