"use client";

import { useEffect } from "react";

/**
 * The number on the installed app's icon.
 *
 * The badges on the navigation only help once somebody is already inside the
 * app, and a push notification only helps if it is caught as it arrives. This
 * is the third case, and for a one-man business the most common one: the phone
 * is picked up an hour later, the notification has been swiped away with
 * fourteen others, and nothing on the home screen says there is a job waiting.
 *
 * Two things keep this honest:
 *
 *   * **The app is the authority.** Whatever the service worker guessed while
 *     the app was closed is overwritten with the real count the moment it
 *     opens, so the number cannot drift upward for ever.
 *   * **Zero clears it.** `setAppBadge(0)` shows a dot on some platforms rather
 *     than nothing, so an empty count calls `clearAppBadge` instead.
 *
 * Unsupported everywhere it is unsupported — a browser tab rather than an
 * installed app, Firefox, older iOS — and that is fine: the call is guarded
 * and the app behaves exactly as it did before.
 */
export function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;

    // Wrapped because Safari rejects the promise when the page is not an
    // installed web app, and an unhandled rejection in a layout would surface
    // as a console error on every page load for no reason.
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [count]);

  return null;
}
