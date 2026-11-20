import type { Settings } from "@/types/database";

/**
 * The business details printed on an invoice.
 *
 * Taken from live settings for a draft (so a preview is always what the
 * customer would get if it were sent now), frozen onto the invoice when it is
 * sent, and — for the payment fields only — refreshed on unpaid invoices when
 * the owner changes them. One builder, so the three can never disagree about
 * which fields an invoice carries.
 */
export function businessSnapshot(settings: Settings): Record<string, unknown> {
  return {
    trading_name: settings.trading_name,
    legal_name: settings.legal_name,
    address_line1: settings.address_line1,
    address_line2: settings.address_line2,
    city: settings.city,
    postcode: settings.postcode,
    phone: settings.phone,
    email: settings.email,
    vat_registered: settings.vat_registered,
    vat_number: settings.vat_number,
    cis_enabled: settings.cis_enabled,
    utr: settings.utr,
    bank_account_name: settings.bank_account_name,
    bank_sort_code: settings.bank_sort_code,
    bank_account_number: settings.bank_account_number,
    invoice_footer_note: settings.invoice_footer_note,
  };
}

/**
 * Fields that follow the owner's settings even after an invoice has been sent,
 * as long as it is still unpaid. These are how to pay and how to get in touch:
 * an invoice that keeps a closed bank account sends the customer's money to it.
 * Everything else (names, address, VAT and UTR numbers) stays as issued.
 */
export const LIVE_PAYMENT_FIELDS = [
  "bank_account_name",
  "bank_sort_code",
  "bank_account_number",
  "phone",
  "email",
] as const;

/** Statuses an invoice can be in while money is still owed on it. */
export const UNPAID_ISSUED_STATUSES = ["sent", "part_paid", "overdue"] as const;

/**
 * The business block to show for an invoice: live settings while it is a
 * draft (or has no snapshot), the frozen snapshot once it has been sent.
 */
export function businessForInvoice(
  invoice: { status: string; business_snapshot: unknown },
  settings: Settings,
): Record<string, unknown> {
  if (invoice.status === "draft" || !invoice.business_snapshot) {
    return businessSnapshot(settings);
  }
  return invoice.business_snapshot as Record<string, unknown>;
}
