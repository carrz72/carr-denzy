"use client";

import { useEffect } from "react";

const KEY = "carr-denzy:push-resynced";
const ONCE_A_DAY = 24 * 60 * 60 * 1000;

/**
 * Keeps this device's notifications alive without anybody touching Settings.
 *
 * A phone can lose its registration on the server without knowing: the push
 * service rotates the endpoint and the service worker's
 * `pushsubscriptionchange` never fires (common on Android), or two failed
 * sends removed the row. The phone still shows "on" and nothing arrives.
 *
 * So, at most once a day, when notifications are allowed and this browser
 * still holds a subscription, it is sent to the server again. That is an
 * upsert on the endpoint, so a healthy device just stays one row.
 *
 * Never prompts, never subscribes a device that was not already subscribed.
 */
export function PushResync() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    try {
      const last = Number(localStorage.getItem(KEY) ?? 0);
      if (Date.now() - last < ONCE_A_DAY) return;
    } catch {
      // Storage blocked: carry on, a resync is harmless.
    }

    let cancelled = false;

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription || cancelled) return;

        const response = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });

        if (response.ok) {
          try {
            localStorage.setItem(KEY, String(Date.now()));
          } catch {
            // Fine — it will just resync again next time.
          }
        }
      } catch {
        // Offline or unsupported. Try again on the next open.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
