"use client";

import { useCallback, useEffect, useState } from "react";
import { BellIcon, BellSlashIcon, CheckIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";

/**
 * Turns phone notifications on for this device.
 *
 * Per device, not per account, and the wording says so — the owner will do
 * this on a phone and possibly a tablet, and needs to understand why turning
 * it on in one place did not turn it on in the other.
 *
 * The permission prompt is deliberately NOT fired on page load. A browser
 * permanently blocks notifications for a site if the prompt is dismissed, and
 * a prompt that appears unrequested gets dismissed. It fires on a deliberate
 * tap, after the reason has been read.
 */

type State =
  | "checking"
  | "unsupported"
  | "blocked"
  | "off"
  | "on"
  | "working"
  | "needs-install";

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!vapidPublicKey) {
      setState("unsupported");
      return;
    }

    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      // iOS only exposes PushManager to an app installed to the home screen.
      // Telling somebody on iOS Safari "not supported" is wrong and unhelpful;
      // telling them to install it is the actual fix.
      const isIos = /iP(hone|ad|od)/.test(navigator.userAgent);
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;

      setState(isIos && !standalone ? "needs-install" : "unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    } catch {
      setState("off");
    }
  }, [vapidPublicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * The VAPID key travels as base64url; PushManager wants raw bytes.
   *
   * Returns an explicitly-allocated ArrayBuffer rather than `Uint8Array.from`,
   * whose result TypeScript widens to `ArrayBufferLike` — which could be a
   * SharedArrayBuffer and so is rejected by `applicationServerKey`.
   */
  function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(normalised);

    const buffer = new ArrayBuffer(raw.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);

    return buffer;
  }

  async function enable() {
    setError(null);
    setState("working");

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        // Required by every browser: a push must always show something. This is
        // what stops push being usable for silent tracking.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey!),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });

      if (!response.ok) {
        // Do not leave a live browser subscription pointing at a server that
        // does not know about it — that is a phone that will never buzz and a
        // toggle that claims otherwise.
        await subscription.unsubscribe().catch(() => {});
        throw new Error("Server did not accept the registration");
      }

      setState("on");
    } catch (caught) {
      console.error("[push] enable failed", caught);
      setError("That did not switch on. Try again, or check notifications are allowed for this site in your browser settings.");
      setState("off");
    }
  }

  async function disable() {
    setError(null);
    setState("working");

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setState("off");
    } catch (caught) {
      console.error("[push] disable failed", caught);
      setError("That did not switch off. Try again.");
      setState("on");
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className={
            state === "on"
              ? "flex size-11 shrink-0 items-center justify-center rounded-md bg-positive-soft text-positive"
              : "flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-muted"
          }
        >
          {state === "on" ? <BellIcon size={22} weight="fill" /> : <BellSlashIcon size={22} />}
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="font-display text-subheading text-ink">Notifications on this device</h2>

          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-muted">
            {state === "on"
              ? "This device will buzz when a new enquiry comes in, even when the app is closed."
              : "Get a buzz on your phone the moment somebody sends a job request, instead of finding it in your email later."}
          </p>

          {/* Per-device is the single most confusing thing about web push, so
              it is stated rather than left to be discovered. */}
          <p className="mt-2 text-sm text-ink-subtle">
            This is per device. Turning it on here does not turn it on for your other
            phone or tablet.
          </p>

          <div className="mt-5">
            {state === "checking" ? (
              <p className="text-sm text-ink-subtle">Checking…</p>
            ) : null}

            {state === "off" || state === "working" ? (
              <Button
                loading={state === "working"}
                loadingLabel="Switching on…"
                onClick={enable}
                icon={<BellIcon size={18} weight="fill" />}
              >
                Turn notifications on
              </Button>
            ) : null}

            {state === "on" ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="flex items-center gap-1.5 text-[0.9375rem] font-medium text-positive">
                  <CheckIcon size={17} weight="bold" aria-hidden="true" />
                  On for this device
                </p>
                <Button variant="quiet" size="sm" onClick={disable}>
                  Turn off
                </Button>
              </div>
            ) : null}

            {state === "needs-install" ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-caution/30 bg-caution-soft p-4">
                <WarningIcon
                  size={19}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-caution"
                  aria-hidden="true"
                />
                <p className="text-[0.9375rem] leading-relaxed text-ink">
                  On an iPhone, notifications only work once the app is added to your
                  home screen. Tap <strong>Share</strong>, then{" "}
                  <strong>Add to Home Screen</strong>, open it from there, and this will
                  be waiting for you.
                </p>
              </div>
            ) : null}

            {state === "blocked" ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-caution/30 bg-caution-soft p-4">
                <WarningIcon
                  size={19}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-caution"
                  aria-hidden="true"
                />
                <p className="text-[0.9375rem] leading-relaxed text-ink">
                  Notifications are blocked for this site in your browser, so we cannot
                  ask again from here. Open the padlock beside the address bar, set
                  Notifications to Allow, then reload this page.
                </p>
              </div>
            ) : null}

            {state === "unsupported" ? (
              <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
                {vapidPublicKey
                  ? "This browser cannot do notifications. Chrome on Android, or the app added to your home screen on iPhone, both can."
                  : "Notifications are not configured on the server yet."}
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="mt-3 text-sm font-medium text-critical">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
