"use client";

import { useState, useTransition } from "react";
import { CheckIcon, FloppyDiskIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { CheckField, FormError, TextAreaField, TextField } from "@/components/ui/field";
import { updateSettings } from "@/app/(app)/app/actions";
import type { Settings } from "@/types/database";

/**
 * Business settings.
 *
 * VAT and CIS are both engine-complete but switched off, because this business
 * is registered for neither. They are presented as two plain switches that
 * reveal the fields they require, rather than hidden behind a "advanced" screen
 * — the day the owner crosses the VAT threshold, turning it on here is the
 * whole job (locked decision: "not VAT registered, no CIS, but build the
 * engine").
 */
export function SettingsForm({ settings }: { settings: Settings }) {
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [vatRegistered, setVatRegistered] = useState(settings.vat_registered);
  const [cisEnabled, setCisEnabled] = useState(settings.cis_enabled);

  function handleSubmit(formData: FormData) {
    setErrors({});
    setFormError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await updateSettings(formData);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      setSaved(true);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <h2 className="text-label uppercase text-ink-subtle">The business</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          This is what prints at the top of every quote and invoice.
        </p>

        <div className="mt-5 flex flex-col gap-5">
          <TextField
            name="trading_name"
            label="Trading name"
            required
            defaultValue={settings.trading_name}
            error={errors.trading_name}
          />

          <TextField
            name="legal_name"
            label="Registered name"
            hint="Only if it differs from the trading name — a limited company, for instance."
            defaultValue={settings.legal_name ?? ""}
            error={errors.legal_name}
          />

          <TextField
            name="address_line1"
            label="Address"
            autoComplete="address-line1"
            defaultValue={settings.address_line1 ?? ""}
            error={errors.address_line1}
          />

          <TextField
            name="address_line2"
            label="Address line 2"
            autoComplete="address-line2"
            defaultValue={settings.address_line2 ?? ""}
            error={errors.address_line2}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="city"
              label="Town or city"
              autoComplete="address-level2"
              defaultValue={settings.city ?? ""}
              error={errors.city}
            />

            <TextField
              name="postcode"
              label="Postcode"
              autoComplete="postal-code"
              autoCapitalize="characters"
              defaultValue={settings.postcode ?? ""}
              error={errors.postcode}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="phone"
              label="Phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              defaultValue={settings.phone ?? ""}
              error={errors.phone}
            />

            <TextField
              name="email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              defaultValue={settings.email ?? ""}
              error={errors.email}
            />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-label uppercase text-ink-subtle">Getting paid</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Printed on every unpaid invoice. Bank transfer only — there is no card
          processing to set up.
        </p>

        <div className="mt-5 flex flex-col gap-5">
          <TextField
            name="bank_account_name"
            label="Account name"
            defaultValue={settings.bank_account_name ?? ""}
            error={errors.bank_account_name}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="bank_sort_code"
              label="Sort code"
              inputMode="numeric"
              placeholder="04-00-04"
              defaultValue={settings.bank_sort_code ?? ""}
              error={errors.bank_sort_code}
            />

            <TextField
              name="bank_account_number"
              label="Account number"
              inputMode="numeric"
              placeholder="12345678"
              defaultValue={settings.bank_account_number ?? ""}
              error={errors.bank_account_number}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="payment_terms_days"
              label="Payment terms"
              type="number"
              inputMode="numeric"
              min={0}
              max={180}
              required
              hint="Days. Used to set the due date on a new invoice."
              defaultValue={String(settings.payment_terms_days)}
              error={errors.payment_terms_days}
            />

            <TextField
              name="quote_valid_days"
              label="Quotes stay open for"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              required
              hint="Days. After this a quote expires by itself."
              defaultValue={String(settings.quote_valid_days)}
              error={errors.quote_valid_days}
            />
          </div>

          <TextAreaField
            name="invoice_footer_note"
            label="Footer note"
            hint="Sits at the very bottom of an invoice. Guarantee wording, or your Gas Safe number."
            rows={3}
            defaultValue={settings.invoice_footer_note ?? ""}
            error={errors.invoice_footer_note}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-label uppercase text-ink-subtle">Tax</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Both off. Turn one on the day it applies to you and every future
          document follows — nothing already issued changes.
        </p>

        <div className="mt-5 flex flex-col gap-5">
          <CheckField
            name="vat_registered"
            label="The business is VAT registered"
            hint="Adds VAT to quotes and invoices, and a VAT column to the line editor."
            checked={vatRegistered}
            onChange={(event) => setVatRegistered(event.target.checked)}
          />

          {vatRegistered ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                name="vat_number"
                label="VAT number"
                required
                defaultValue={settings.vat_number ?? ""}
                error={errors.vat_number}
              />

              <TextField
                name="default_vat_rate_bp"
                label="Usual rate"
                type="number"
                inputMode="numeric"
                min={0}
                max={10000}
                step={100}
                required
                hint="Basis points. 2000 is 20%."
                defaultValue={String(settings.default_vat_rate_bp)}
                error={errors.default_vat_rate_bp}
              />
            </div>
          ) : (
            <input type="hidden" name="default_vat_rate_bp" value={settings.default_vat_rate_bp} />
          )}

          <CheckField
            name="cis_enabled"
            label="CIS applies to my work"
            hint="For subcontracting to other builders. Deducts a percentage from labour, never from materials."
            checked={cisEnabled}
            onChange={(event) => setCisEnabled(event.target.checked)}
          />

          {cisEnabled ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                name="utr"
                label="Your UTR"
                required
                hint="Must appear on a CIS invoice."
                defaultValue={settings.utr ?? ""}
                error={errors.utr}
              />

              <TextField
                name="cis_deduction_rate_bp"
                label="Deduction rate"
                type="number"
                inputMode="numeric"
                min={0}
                max={10000}
                step={100}
                required
                hint="Basis points. 2000 is 20%, 3000 is 30% if unverified."
                defaultValue={String(settings.cis_deduction_rate_bp)}
                error={errors.cis_deduction_rate_bp}
              />
            </div>
          ) : (
            <input
              type="hidden"
              name="cis_deduction_rate_bp"
              value={settings.cis_deduction_rate_bp}
            />
          )}
        </div>
      </Card>

      <FormError message={formError} />

      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="submit"
          size="lg"
          loading={isPending}
          icon={<FloppyDiskIcon size={19} />}
        >
          Save settings
        </Button>

        {saved ? (
          <p
            role="status"
            className="flex items-center gap-2 text-[0.9375rem] font-medium text-positive"
          >
            <CheckIcon size={17} weight="bold" aria-hidden="true" />
            Saved
          </p>
        ) : null}
      </div>
    </form>
  );
}
