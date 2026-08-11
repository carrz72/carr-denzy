"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EnvelopeSimpleIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { FormError, TextField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { finishSignIn } from "@/app/auth/complete/actions";

const errorMessages: Record<string, string> = {
  expired: "That sign-in link has expired. Put your email in again and we will send a fresh one.",
  invalid: "That sign-in link did not work. Links can only be used once — here is a new one.",
  missing: "We could not complete the sign-in. Please try again.",
};

/**
 * Magic-link sign-in.
 *
 * No password field, deliberately. The owner is one person who will use this
 * on two devices, and customers use it perhaps four times a year — a password
 * would be forgotten every single time, and a forgotten-password flow is more
 * code and more attack surface than the thing it replaces.
 */
export function SignInForm({ next, initialError }: { next?: string; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(
    initialError ? (errorMessages[initialError] ?? errorMessages.missing!) : null,
  );
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | undefined>();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(undefined);
    setFormError(null);

    const trimmed = email.trim().toLowerCase();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setFieldError("Please check the email address — it needs an @ and a domain");
      return;
    }

    setBusy(true);

    try {
      const supabase = createClient();
      const callback = new URL("/auth/callback", window.location.origin);
      if (next) callback.searchParams.set("next", next);

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: callback.toString() },
      });

      if (error) {
        setFormError(
          "We could not send that just now. Try again in a moment, or ring us on 07934 633583.",
        );
        return;
      }

      // Always report success, even for an address with no account. Saying
      // "no such user" would let anyone test whether a given email is a
      // customer of ours.
      setSent(true);
    } catch {
      setFormError(
        "We could not reach our system just then. Try again in a moment, or ring us on 07934 633583.",
      );
    } finally {
      setBusy(false);
    }
  }

  // The link in the email opens in the phone's browser, not an installed home
  // screen app — those run in separate storage, so signing in there never
  // reaches the app. Typing the code back in here avoids that switch entirely.
  async function handleVerifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCodeError(undefined);

    const trimmedCode = code.trim();

    if (!trimmedCode) {
      setCodeError("Enter the code from the email");
      return;
    }

    setCodeBusy(true);

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: trimmedCode,
        type: "email",
      });

      if (error) {
        setCodeError(
          /expired/i.test(error.message)
            ? "That code has expired. Send a new one below."
            : "That code did not match. Check it and try again.",
        );
        return;
      }

      const result = await finishSignIn();
      router.replace(next ?? result.destination);
    } catch {
      setCodeError("We could not reach our system just then. Try again in a moment.");
    } finally {
      setCodeBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="animate-rise text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-xl bg-positive-soft text-positive">
          <PaperPlaneTiltIcon size={28} weight="fill" aria-hidden="true" />
        </span>

        <h2 className="mt-5 font-display text-subheading text-ink">Check your email</h2>

        <p className="mt-3 leading-relaxed text-ink-muted">
          If we have an account for <strong className="text-ink">{email.trim()}</strong>,
          a sign-in link is on its way. It works once and lasts an hour.
        </p>

        <form onSubmit={handleVerifyCode} noValidate className="mt-6 flex flex-col gap-3 text-left">
          <TextField
            name="code"
            label="Or enter the code from the email"
            hint="Using the installed app? The link opens in your browser instead, so type the code here to stay signed in on the app."
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            error={codeError}
          />

          <Button type="submit" loading={codeBusy} loadingLabel="Checking…">
            Confirm code
          </Button>
        </form>

        <p className="mt-5 text-sm leading-relaxed text-ink-subtle">
          Nothing arrived after a couple of minutes? Check your spam folder, then{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
          >
            try a different address
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <TextField
        name="email"
        label="Your email address"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoFocus
        required
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldError}
      />

      <FormError message={formError} />

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={busy}
        loadingLabel="Sending your link…"
        icon={<EnvelopeSimpleIcon size={19} />}
      >
        Email me a sign-in link
      </Button>
    </form>
  );
}
