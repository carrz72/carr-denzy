import "server-only";

import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { formatDate } from "@/lib/dates";
import { formatPence, formatQuantity, formatRateBp, lineAmountPence } from "@/lib/money";
import type { LineKind } from "@/types/database";

/**
 * The invoice, as a PDF file.
 *
 * Exists for one reason: a bare link in an email is not something an accounts
 * payable department can file, forward into their own system, or attach to a
 * purchase order. A PDF is. This mirrors the same figures shown on the portal
 * and print pages (`money-document.tsx`) — it is a different renderer, not a
 * different source of truth, so the numbers must never be allowed to drift.
 */

export interface InvoicePdfItem {
  description: string;
  kind: LineKind;
  quantity_milli: number;
  unit_price_pence: number;
  vat_rate_bp: number;
}

export interface InvoicePdfData {
  /**
   * Which document this is. Quotes and invoices are the same object with a
   * different word at the top, a different date label, and no bank details —
   * so they share this renderer rather than drifting into two layouts that
   * gradually stop looking like they came from the same business.
   */
  documentKind?: "invoice" | "quote";
  reference: string;
  issueDate: string | null;
  /** Invoices: payment due. Quotes: the date the price is held until. */
  dueDate: string | null;
  business: Record<string, unknown> | null;
  customerName: string;
  customerCompany: string | null;
  customerAddress: string | null;
  items: InvoicePdfItem[];
  subtotalPence: number;
  vatPence: number;
  cisDeductionPence: number;
  cisDeductionRateBp: number;
  totalPence: number;
  paidPence: number;
  vatRegistered: boolean;
  cisEnabled: boolean;
  reverseCharge: boolean;
  notes: string | null;
  footerNote: string | null;
  settled: boolean;
}

const kindLabels: Record<LineKind, string> = {
  labour: "Labour",
  materials: "Materials",
  other: "Other",
};

const styles = StyleSheet.create({
  page: { paddingVertical: 42, paddingHorizontal: 40, fontSize: 10, color: "#1a1a1a" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  businessName: { fontSize: 15, fontWeight: 700, marginBottom: 4 },
  muted: { color: "#555555", lineHeight: 1.5 },
  docTitle: { fontSize: 18, fontWeight: 700, textAlign: "right" },
  reference: { textAlign: "right", color: "#555555", marginTop: 2 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#dddddd",
  },
  metaLabel: { color: "#555555", marginBottom: 2 },
  metaValue: { fontWeight: 700 },
  table: { marginTop: 22 },
  tableHeadRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    paddingBottom: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    paddingVertical: 8,
  },
  colDescription: { flexGrow: 1, flexBasis: 0, paddingRight: 8 },
  colQty: { width: 55, textAlign: "right" },
  colEach: { width: 65, textAlign: "right" },
  colVat: { width: 55, textAlign: "right" },
  colAmount: { width: 70, textAlign: "right" },
  headCell: { fontSize: 8, textTransform: "uppercase", color: "#555555" },
  itemKind: { fontSize: 8.5, color: "#777777", marginTop: 2 },
  totals: { marginTop: 18, alignSelf: "flex-end", width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  totalLabel: { color: "#555555" },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
  },
  grandTotalLabel: { fontSize: 12, fontWeight: 700 },
  grandTotalValue: { fontSize: 12, fontWeight: 700 },
  section: {
    marginTop: 22,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#dddddd",
  },
  bankBox: {
    marginTop: 22,
    padding: 14,
    backgroundColor: "#f4f2ee",
    borderRadius: 4,
  },
  bankTitle: { fontSize: 9, textTransform: "uppercase", color: "#555555", marginBottom: 6 },
  bankRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
});

function text(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function InvoiceDocument(data: InvoicePdfData) {
  const isQuote = data.documentKind === "quote";
  const showVat = data.vatRegistered && !data.reverseCharge;
  const showBreakdown = data.vatRegistered || data.cisEnabled;
  const outstanding = data.totalPence - data.paidPence;

  const docLabel = isQuote ? "Quote" : "Invoice";

  const businessLines = [
    text(data.business, "address_line1"),
    text(data.business, "address_line2"),
    text(data.business, "city"),
    text(data.business, "postcode"),
  ].filter(Boolean);

  const accountName = text(data.business, "bank_account_name");
  const sortCode = text(data.business, "bank_sort_code");
  const accountNumber = text(data.business, "bank_account_number");
  // A quote is not a request for money, so it never carries bank details. The
  // one thing a quote PDF must not do is look like something to pay.
  const showBankDetails =
    !isQuote && !data.settled && (accountName || sortCode || accountNumber);

  return (
    <Document title={`${docLabel} ${data.reference}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.businessName}>
              {text(data.business, "trading_name") ?? "Carr Denzy Plumbing & Gas"}
            </Text>
            {text(data.business, "legal_name") ? (
              <Text style={styles.muted}>{text(data.business, "legal_name")}</Text>
            ) : null}
            {businessLines.length > 0 ? (
              <Text style={styles.muted}>{businessLines.join(", ")}</Text>
            ) : null}
            {text(data.business, "phone") ? (
              <Text style={styles.muted}>{text(data.business, "phone")}</Text>
            ) : null}
            {text(data.business, "email") ? (
              <Text style={styles.muted}>{text(data.business, "email")}</Text>
            ) : null}
            {data.business?.vat_registered === true && text(data.business, "vat_number") ? (
              <Text style={styles.muted}>VAT registration {text(data.business, "vat_number")}</Text>
            ) : null}
            {data.business?.cis_enabled === true && text(data.business, "utr") ? (
              <Text style={styles.muted}>UTR {text(data.business, "utr")}</Text>
            ) : null}
          </View>

          <View>
            <Text style={styles.docTitle}>{docLabel}</Text>
            <Text style={styles.reference}>{data.reference}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View>
            <Text style={styles.metaLabel}>{isQuote ? "Prepared for" : "Billed to"}</Text>
            <Text style={styles.metaValue}>{data.customerName}</Text>
            {data.customerCompany ? <Text>{data.customerCompany}</Text> : null}
            {data.customerAddress ? <Text style={styles.muted}>{data.customerAddress}</Text> : null}
          </View>

          <View>
            <Text style={styles.metaLabel}>{isQuote ? "Quoted on" : "Invoice date"}</Text>
            <Text style={styles.metaValue}>{formatDate(data.issueDate)}</Text>
            {data.dueDate ? (
              <>
                <Text style={[styles.metaLabel, { marginTop: 8 }]}>
                  {isQuote ? "Price held until" : "Payment due"}
                </Text>
                <Text style={styles.metaValue}>{formatDate(data.dueDate)}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeadRow}>
            <Text style={[styles.headCell, styles.colDescription]}>What for</Text>
            <Text style={[styles.headCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.headCell, styles.colEach]}>Each</Text>
            {showVat ? <Text style={[styles.headCell, styles.colVat]}>VAT</Text> : null}
            <Text style={[styles.headCell, styles.colAmount]}>Amount</Text>
          </View>

          {data.items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={styles.colDescription}>
                <Text>{item.description}</Text>
                <Text style={styles.itemKind}>{kindLabels[item.kind]}</Text>
              </View>
              <Text style={styles.colQty}>{formatQuantity(item.quantity_milli)}</Text>
              <Text style={styles.colEach}>{formatPence(item.unit_price_pence)}</Text>
              {showVat ? (
                <Text style={styles.colVat}>{formatRateBp(item.vat_rate_bp)}</Text>
              ) : null}
              <Text style={styles.colAmount}>
                {formatPence(lineAmountPence(item.quantity_milli, item.unit_price_pence))}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          {showBreakdown ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text>{formatPence(data.subtotalPence)}</Text>
            </View>
          ) : null}

          {data.vatRegistered && !data.reverseCharge ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>VAT</Text>
              <Text>{formatPence(data.vatPence)}</Text>
            </View>
          ) : null}

          {data.vatRegistered && data.reverseCharge ? (
            <Text style={[styles.muted, { marginTop: 5 }]}>
              VAT reverse charge applies — the customer accounts for the VAT.
            </Text>
          ) : null}

          {data.cisEnabled ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                CIS deducted from labour ({formatRateBp(data.cisDeductionRateBp)})
              </Text>
              <Text>{formatPence(-data.cisDeductionPence)}</Text>
            </View>
          ) : null}

          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>
              {isQuote ? "Total for the work" : "Invoice total"}
            </Text>
            <Text style={styles.grandTotalValue}>{formatPence(data.totalPence)}</Text>
          </View>

          {!isQuote && data.paidPence > 0 ? (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Paid so far</Text>
                <Text>{formatPence(data.paidPence)}</Text>
              </View>
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>Still to pay</Text>
                <Text style={styles.grandTotalValue}>{formatPence(Math.max(outstanding, 0))}</Text>
              </View>
            </>
          ) : null}
        </View>

        {data.notes ? (
          <View style={styles.section}>
            <Text style={styles.muted}>{data.notes}</Text>
          </View>
        ) : null}

        {showBankDetails ? (
          <View style={styles.bankBox}>
            <Text style={styles.bankTitle}>How to pay</Text>
            {accountName ? (
              <View style={styles.bankRow}>
                <Text style={styles.totalLabel}>Account name</Text>
                <Text style={{ fontWeight: 700 }}>{accountName}</Text>
              </View>
            ) : null}
            {sortCode ? (
              <View style={styles.bankRow}>
                <Text style={styles.totalLabel}>Sort code</Text>
                <Text style={{ fontWeight: 700 }}>{sortCode}</Text>
              </View>
            ) : null}
            {accountNumber ? (
              <View style={styles.bankRow}>
                <Text style={styles.totalLabel}>Account number</Text>
                <Text style={{ fontWeight: 700 }}>{accountNumber}</Text>
              </View>
            ) : null}
            <View style={styles.bankRow}>
              <Text style={styles.totalLabel}>Payment reference</Text>
              <Text style={{ fontWeight: 700 }}>{data.reference}</Text>
            </View>
          </View>
        ) : null}

        {/* Said outright on a quote, because a PDF with a total on it is the
            single easiest thing in this system to mistake for a bill. */}
        {isQuote ? (
          <View style={styles.section}>
            <Text style={styles.muted}>
              This is a quote, not a bill. Nothing is payable until the work is done and
              invoiced.
            </Text>
          </View>
        ) : null}

        {data.footerNote ? (
          <View style={styles.section}>
            <Text style={styles.muted}>{data.footerNote}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument {...{ documentKind: "invoice", ...data }} />);
}

/**
 * The same document, rendered as a quote.
 *
 * Quotes have no payment state, so `paidPence` and `settled` are pinned rather
 * than accepted from the caller — a quote PDF must never be able to display a
 * "still to pay" line.
 */
export async function renderQuotePdf(
  data: Omit<InvoicePdfData, "documentKind" | "paidPence" | "settled">,
): Promise<Buffer> {
  return renderToBuffer(
    <InvoiceDocument {...data} documentKind="quote" paidPence={0} settled={false} />,
  );
}
