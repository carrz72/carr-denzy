"use client";

import { useState, useTransition } from "react";
import {
  ArrowUUpLeftIcon,
  CheckIcon,
  XIcon,
  PaperPlaneTiltIcon,
  TrashIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError, TextAreaField } from "@/components/ui/field";
import { NotifyToggle } from "@/components/owner/invoice-actions";
import {
  deleteDraftQuote,
  recordQuoteAnswer,
  sendQuote,
  withdrawQuote,
} from "@/app/(app)/app/actions";

/**
 * Sending a quote is the moment it stops being editable and starts being an
 * offer, so it asks once. Not a modal — an inline confirm, because a dialog on
 * a phone covers the very figure the owner is trying to check.
 */
export function SendQuoteButton({
  quoteId,
  clientEmail,
  totalLabel,
}: {
  quoteId: string;
  clientEmail: string | null;
  totalLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function send() {
    setError(null);

    const formData = new FormData();
    formData.set("quote_id", quoteId);

    startTransition(async () => {
      const result = await sendQuote(formData);

      if (!result.ok) {
        setError(result.formError ?? "Could not send that quote.");
        setConfirming(false);
        return;
      }

      setSent(true);
      setConfirming(false);
      setWarning(result.warning ?? null);
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <p
          role="status"
          className="flex items-center gap-2 text-[0.9375rem] font-medium text-positive"
        >
          <CheckIcon size={18} weight="bold" aria-hidden="true" />
          Quote sent. The customer can accept or decline it in their account.
        </p>

        {warning ? (
          <p className="flex items-start gap-2.5 rounded-lg border border-caution/30 bg-caution-soft px-4 py-3 text-[0.9375rem] font-medium text-caution-ink">
            <WarningIcon size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
            {warning}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {confirming ? (
        <>
          <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
            {clientEmail
              ? `This emails the quote to ${clientEmail}. Once it is sent the prices are fixed — to change them you would raise a new quote.`
              : "This customer has no email address, so nothing will be emailed. The quote will still be marked as sent and they can see it if they sign in."}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              loading={isPending}
              onClick={send}
              icon={<PaperPlaneTiltIcon size={19} weight="fill" />}
            >
              Yes, send it
            </Button>
            <Button variant="quiet" size="lg" onClick={() => setConfirming(false)}>
              Not yet
            </Button>
          </div>
        </>
      ) : (
        <Button
          size="lg"
          fullWidth
          onClick={() => setConfirming(true)}
          icon={<PaperPlaneTiltIcon size={19} weight="fill" />}
        >
          Send {totalLabel} quote
        </Button>
      )}

      <FormError message={error} />
    </div>
  );
}

/** A small two-step destructive control: a quiet link, then a spelt-out confirm. */
function ConfirmLink({
  label,
  icon,
  explanation,
  confirmLabel,
  run,
  notifyLabel,
}: {
  label: string;
  icon: React.ReactNode;
  explanation: string;
  confirmLabel: string;
  run: (notify: boolean) => Promise<{ ok: boolean; formError?: string }>;
  /** Shows a "tell the customer" tick box, ticked by default. */
  notifyLabel?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);

  function go() {
    setError(null);
    startTransition(async () => {
      const result = await run(Boolean(notifyLabel) && notify);
      if (!result.ok) {
        setError(result.formError ?? "That did not work. Try again.");
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[0.9375rem] leading-relaxed text-ink-muted">{explanation}</p>
        {notifyLabel ? <NotifyToggle checked={notify} onChange={setNotify} label={notifyLabel} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" loading={isPending} onClick={go} icon={icon}>
            {confirmLabel}
          </Button>
          <Button variant="quiet" onClick={() => setConfirming(false)}>
            Not yet
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-ink-subtle hover:text-critical"
      >
        {icon}
        {label}
      </button>
      <FormError message={error} />
    </div>
  );
}

export function DeleteDraftQuoteButton({ quoteId, jobId }: { quoteId: string; jobId: string }) {
  const router = useRouter();

  return (
    <ConfirmLink
      label="Delete this draft"
      icon={<TrashIcon size={16} weight="bold" aria-hidden="true" />}
      explanation="This deletes the draft. It has never been sent, so the customer has not seen it."
      confirmLabel="Yes, delete it"
      run={async () => {
        const formData = new FormData();
        formData.set("quote_id", quoteId);
        const result = await deleteDraftQuote(formData);
        if (result.ok) router.push(`/app/jobs/${jobId}`);
        return result;
      }}
    />
  );
}

export function WithdrawQuoteButton({ quoteId, reference }: { quoteId: string; reference: string }) {
  const router = useRouter();

  return (
    <ConfirmLink
      label="Withdraw this quote"
      icon={<ArrowUUpLeftIcon size={16} weight="bold" aria-hidden="true" />}
      explanation={`${reference} stays on file marked Withdrawn, and the customer can no longer accept it. Their link will say so. If the price was wrong, withdraw it and send a new one.`}
      confirmLabel="Yes, withdraw it"
      notifyLabel="Email the customer to say it is withdrawn"
      run={async (notify) => {
        const formData = new FormData();
        formData.set("quote_id", quoteId);
        if (notify) formData.set("notify", "on");
        const result = await withdrawQuote(formData);
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}

/**
 * The customer answered by phone, text or in person. Records it for them, so
 * the quote stops being chased and "Invoice this quote" appears. Two clear
 * buttons, each with a confirm that names the outcome, because this speaks for
 * the customer.
 */
export function RecordQuoteAnswer({
  quoteId,
  clientName,
  totalLabel,
}: {
  quoteId: string;
  clientName: string;
  totalLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [choice, setChoice] = useState<"accept" | "decline" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    if (!choice) return;
    setError(null);

    const formData = new FormData();
    formData.set("quote_id", quoteId);
    formData.set("answer", choice);
    if (choice === "decline") formData.set("reason", reason);

    startTransition(async () => {
      const result = await recordQuoteAnswer(formData);
      if (!result.ok) {
        setError(result.formError ?? "Could not record that.");
        return;
      }
      setChoice(null);
      router.refresh();
    });
  }

  if (choice) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
          {choice === "accept"
            ? `Record that ${clientName} accepted ${totalLabel}? The quote is marked accepted and stops being chased.`
            : `Record that ${clientName} said no? The quote is marked declined and stops being chased.`}
        </p>

        {choice === "decline" ? (
          <TextAreaField
            id={`decline-reason-${quoteId}`}
            name="reason"
            label="What they said"
            hint="Optional. Only you see this."
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant={choice === "accept" ? "primary" : "destructive"}
            loading={isPending}
            onClick={confirm}
            icon={choice === "accept" ? <CheckIcon size={18} weight="bold" /> : <XIcon size={18} weight="bold" />}
          >
            {choice === "accept" ? "Yes, they accepted" : "Yes, they declined"}
          </Button>
          <Button variant="quiet" onClick={() => setChoice(null)}>
            Back
          </Button>
        </div>
        <FormError message={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm leading-relaxed text-ink-muted">
        Answered by phone, text or in person? Record it here.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="secondary" onClick={() => setChoice("accept")} icon={<CheckIcon size={18} />}>
          They said yes
        </Button>
        <Button variant="secondary" onClick={() => setChoice("decline")} icon={<XIcon size={18} />}>
          They said no
        </Button>
      </div>
    </div>
  );
}
