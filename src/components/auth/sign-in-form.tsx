"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardTextIcon,
  EnvelopeSimpleIcon,
  EnvelopeOpenIcon,
  PaperPlaneTiltIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { FormError, TextField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { finishSignIn } from "@/app/auth/complete/actions";

/** Digits in the emailed code (Supabase: Auth → Email → Email OTP length). */
const CODE_LENGTH = 8;

/** Where this device remembers the last email used, like any other site. */
const EMAIL_KEY = "carr-denzy:last-email";

/** Digits only, so a code pasted as "1234 5678" or "Your code is 12345678" still works. */
function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

function isGmail(address: string): boolean {
  return /@(gmail|googlemail)\.com$/i.test(address.trim());
}

/** The Gmail app on an iPhone opens from its own link; everywhere else, the website. */
function gmailHref(): string {
  if (typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return "googlegmail://";
  }
  return "https://mail.google.com/mail/";
}

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
export function SignInForm({
  next,
  initialError,
  phone,
}: {
  next?: string;
  initialError?: string;
  /** The business phone, from Settings, for the "ring us" fallback. */
  phone: string;
}) {
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
  const [canPaste, setCanPaste] = useState(false);

  // Remember the email on this device, the way other sites do, so next time
  // it is already filled in. Only ever in this browser; never sent anywhere.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {
      // Private browsing or blocked storage: just start empty.
    }
    setCanPaste(typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function");
  }, []);


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
          `We could not send that just now. Try again in a moment, or ring us on ${phone}.`,
        );
        return;
      }

      try {
        window.localStorage.setItem(EMAIL_KEY, trimmed);
      } catch {
        // Not remembered this time; nothing else depends on it.
      }

      // Always report success, even for an address with no account. Saying
      // "no such user" would let anyone test whether a given email is a
      // customer of ours.
      setCode("");
      setCodeError(undefined);
      setSent(true);
    } catch {
      setFormError(
        `We could not reach our system just then. Try again in a moment, or ring us on ${phone}.`,
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
    await verifyCode(code);
  }

  // Typing or pasting the last digit signs you in; no button press needed.
  function changeCode(raw: string) {
    const next = cleanCode(raw);
    setCode(next);
    setCodeError(undefined);
    if (next.length === CODE_LENGTH && !codeBusy) void verifyCode(next);
  }

  async function pasteCode() {
    try {
      const text = await navigator.clipboard.readText();
      const next = cleanCode(text);
      if (!next) {
        setCodeError("There is no code on your clipboard. Copy it from the email first.");
        return;
      }
      changeCode(next);
    } catch {
      setCodeError("Your browser would not let us paste. Long-press the box and choose Paste.");
    }
  }

  async function verifyCode(value: string) {
    setCodeError(undefined);

    const trimmedCode = cleanCode(value);

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
          we have emailed a code. It is in the subject line too, so you can usually read
          it straight from the notification.
        </p>

        {isGmail(email) ? (
          <a
            href={gmailHref()}
            target="_blank"
            rel="noopener"
            className="mt-4 inline-flex min-h-11 items-center gap-2 font-medium text-accent hover:underline hover:underline-offset-4"
          >
            <EnvelopeOpenIcon size={18} aria-hidden="true" />
            Open Gmail
          </a>
        ) : null}

        <form onSubmit={handleVerifyCode} noValidate className="mt-6 flex flex-col gap-3 text-left">
          <TextField
            autoFocus
            name="code"
            label="Enter the code"
            hint="It signs you in as soon as the last digit goes in. Tapping the link in the email works too, but in the installed app the code keeps you signed in on the app."
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={CODE_LENGTH + 4}
            placeholder={"•".repeat(CODE_LENGTH)}
            className="text-center font-mono text-2xl tracking-[0.3em]"
            value={code}
            onChange={(event) => changeCode(event.target.value)}
            error={codeError}
          />

          {canPaste ? (
            <Button
              type="button"
              variant="secondary"
              onClick={pasteCode}
              icon={<ClipboardTextIcon size={18} />}
            >
              Paste code
            </Button>
          ) : null}

          <Button type="submit" loading={codeBusy} loadingLabel="Signing you in…">
            Sign in
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
        loadingLabel="Sending your code…"
        icon={<EnvelopeSimpleIcon size={19} />}
      >
        Email me a sign-in code
      </Button>
    </form>
  );
}
