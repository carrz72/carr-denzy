import { formatPence, formatQuantity, formatRateBp, lineAmountPence } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { LineKind } from "@/types/database";

/**
 * The read-only half of a quote or an invoice.
 *
 * Deliberately shared by all four screens that show one — the owner's copy, the
 * customer's copy, and the printed version of each. A customer ringing up to
 * query a figure and the owner reading it back must be looking at identical
 * arithmetic, laid out identically; two renderers would eventually disagree.
 *
 * No component here holds state or a handler, so it stays on the server and
 * ships no JavaScript.
 */

export interface DocumentLine {
  id?: string;
  description: string;
  kind: LineKind;
  quantity_milli: number;
  unit_price_pence: number;
  vat_rate_bp: number;
}

const kindLabels: Record<LineKind, string> = {
  labour: "Labour",
  materials: "Materials",
  other: "Other",
};

export function DocumentLines({
  items,
  vatRegistered,
  reverseCharge = false,
  className,
}: {
  items: DocumentLine[];
  vatRegistered: boolean;
  reverseCharge?: boolean;
  className?: string;
}) {
  const showVat = vatRegistered && !reverseCharge;

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <caption className="sr-only">What this covers, line by line</caption>

        <thead>
          <tr className="border-b border-line-strong">
            <th scope="col" className="py-2.5 pr-4 text-label uppercase text-ink-subtle">
              What for
            </th>
            <th scope="col" className="py-2.5 px-4 text-right text-label uppercase text-ink-subtle">
              Qty
            </th>
            <th scope="col" className="py-2.5 px-4 text-right text-label uppercase text-ink-subtle">
              Each
            </th>
            {showVat ? (
              <th scope="col" className="py-2.5 px-4 text-right text-label uppercase text-ink-subtle">
                VAT
              </th>
            ) : null}
            <th scope="col" className="py-2.5 pl-4 text-right text-label uppercase text-ink-subtle">
              Amount
            </th>
          </tr>
        </thead>

        <tbody>
          {items.map((item, index) => (
            <tr key={item.id ?? index} className="border-b border-line align-top">
              <td className="py-3.5 pr-4">
                <span className="block font-medium text-ink">{item.description}</span>
                <span className="mt-0.5 block text-sm text-ink-subtle">
                  {kindLabels[item.kind]}
                </span>
              </td>

              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-ink-muted">
                {formatQuantity(item.quantity_milli)}
              </td>

              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-ink-muted">
                {formatPence(item.unit_price_pence)}
              </td>

              {showVat ? (
                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-ink-muted">
                  {formatRateBp(item.vat_rate_bp)}
                </td>
              ) : null}

              <td className="py-3.5 pl-4 text-right font-mono font-semibold tabular-nums text-ink">
                {formatPence(lineAmountPence(item.quantity_milli, item.unit_price_pence))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The totals block.
 *
 * Rows that would read "£0.00" are omitted rather than shown as zero: a plumber
 * who is not VAT-registered must not issue a document carrying a VAT line, and
 * a subtotal identical to the total is noise.
 */
export function TotalsPanel({
  subtotalPence,
  vatPence,
  cisDeductionPence,
  totalPence,
  paidPence,
  vatRegistered,
  cisEnabled,
  cisDeductionRateBp,
  reverseCharge = false,
  totalLabel = "Total",
  className,
}: {
  subtotalPence: number;
  vatPence: number;
  cisDeductionPence: number;
  totalPence: number;
  /** Pass to show "paid so far" and "still to pay". Invoices only. */
  paidPence?: number;
  vatRegistered: boolean;
  cisEnabled: boolean;
  cisDeductionRateBp: number;
  reverseCharge?: boolean;
  totalLabel?: string;
  className?: string;
}) {
  const showBreakdown = vatRegistered || cisEnabled;
  const outstanding = paidPence === undefined ? null : totalPence - paidPence;

  return (
    <div className={cn("rounded-lg border border-line bg-surface-sunken p-5", className)}>
      <dl className="flex flex-col gap-2.5">
        {showBreakdown ? <TotalRow label="Subtotal" valuePence={subtotalPence} /> : null}

        {vatRegistered && !reverseCharge ? <TotalRow label="VAT" valuePence={vatPence} /> : null}

        {vatRegistered && reverseCharge ? (
          <p className="text-sm text-ink-muted">
            VAT reverse charge applies — the customer accounts for the VAT.
          </p>
        ) : null}

        {cisEnabled ? (
          <TotalRow
            label={`CIS deducted from labour (${formatRateBp(cisDeductionRateBp)})`}
            valuePence={-cisDeductionPence}
          />
        ) : null}

        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
          <dt className="font-display text-subheading text-ink">{totalLabel}</dt>
          <dd className="font-mono text-heading font-bold tabular-nums text-ink">
            {formatPence(totalPence)}
          </dd>
        </div>

        {outstanding !== null && paidPence !== undefined && paidPence > 0 ? (
          <>
            <TotalRow label="Paid so far" valuePence={paidPence} />
            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
              <dt className="font-medium text-ink">Still to pay</dt>
              <dd
                className={cn(
                  "font-mono text-subheading font-bold tabular-nums",
                  outstanding > 0 ? "text-critical" : "text-positive",
                )}
              >
                {formatPence(Math.max(outstanding, 0))}
              </dd>
            </div>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function TotalRow({ label, valuePence }: { label: string; valuePence: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[0.9375rem] text-ink-muted">{label}</dt>
      <dd className="font-mono tabular-nums text-ink">{formatPence(valuePence)}</dd>
    </div>
  );
}

/**
 * The business's own details, as printed at the head of an invoice.
 *
 * Reads from the snapshot stored on the invoice, not from live settings — the
 * address on a document issued eighteen months ago must still be the address it
 * was issued from.
 */
export function BusinessBlock({
  snapshot,
  className,
}: {
  snapshot: Record<string, unknown> | null;
  className?: string;
}) {
  if (!snapshot) return null;

  const text = (key: string): string | null => {
    const value = snapshot[key];
    return typeof value === "string" && value.trim() !== "" ? value : null;
  };

  const lines = [
    text("address_line1"),
    text("address_line2"),
    text("city"),
    text("postcode"),
  ].filter(Boolean);

  return (
    <div className={cn("text-sm leading-relaxed text-ink-muted", className)}>
      <p className="font-display text-subheading text-ink">
        {text("trading_name") ?? "Carr Denzy Plumbing & Gas"}
      </p>

      {text("legal_name") ? <p>{text("legal_name")}</p> : null}
      {lines.length > 0 ? <p className="mt-1">{lines.join(", ")}</p> : null}

      {text("phone") ? <p className="mt-1 tabular">{text("phone")}</p> : null}
      {text("email") ? <p>{text("email")}</p> : null}

      {snapshot.vat_registered === true && text("vat_number") ? (
        <p className="mt-1">VAT registration {text("vat_number")}</p>
      ) : null}
      {snapshot.cis_enabled === true && text("utr") ? <p>UTR {text("utr")}</p> : null}
    </div>
  );
}

/**
 * Bank details, for a business that takes payment by transfer and nothing else.
 * Shown on the customer's copy of every unpaid invoice — burying this is the
 * single most reliable way to be paid late.
 */
export function BankDetails({
  snapshot,
  reference,
  className,
}: {
  snapshot: Record<string, unknown> | null;
  reference: string;
  className?: string;
}) {
  const text = (key: string): string | null => {
    const value = snapshot?.[key];
    return typeof value === "string" && value.trim() !== "" ? value : null;
  };

  const accountName = text("bank_account_name");
  const sortCode = text("bank_sort_code");
  const accountNumber = text("bank_account_number");

  if (!accountName && !sortCode && !accountNumber) return null;

  return (
    <div className={cn("rounded-lg border border-accent-line bg-accent-soft p-5", className)}>
      <h3 className="text-label uppercase text-accent-ink">How to pay</h3>

      <dl className="mt-3 flex flex-col gap-2">
        {accountName ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-sm text-ink-muted">Account name</dt>
            <dd className="font-medium text-ink">{accountName}</dd>
          </div>
        ) : null}

        {sortCode ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-sm text-ink-muted">Sort code</dt>
            <dd className="font-mono font-medium tabular-nums text-ink">{sortCode}</dd>
          </div>
        ) : null}

        {accountNumber ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-sm text-ink-muted">Account number</dt>
            <dd className="font-mono font-medium tabular-nums text-ink">{accountNumber}</dd>
          </div>
        ) : null}

        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-accent-line pt-2">
          <dt className="text-sm text-ink-muted">Payment reference</dt>
          <dd className="font-mono font-semibold tabular-nums text-ink">{reference}</dd>
        </div>
      </dl>

      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        Please quote the reference so the payment can be matched to this invoice.
      </p>
    </div>
  );
}
