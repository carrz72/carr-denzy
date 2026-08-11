"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudSlashIcon, ArrowsClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import {
  countOutboxItems,
  flushOutbox,
  isOnline,
  onOutboxChange,
  retryFailedItems,
  startOutboxWatcher,
} from "@/lib/outbox";
import { cn } from "@/lib/cn";

/**
 * Registers the service worker, keeps the outbox draining, and tells the owner
 * the truth about both.
 *
 * This component is the thing that makes the offline outbox real: without it
 * `startOutboxWatcher()` is never called, and a note typed with no signal sits
 * in IndexedDB for ever. Mounted once, in the signed-in shell.
 *
 * The banner appears only when there is something to say. A permanent
 * connection indicator trains people to ignore it, which is exactly the wrong
 * habit for the one moment it matters.
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [retrying, setRetrying] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await countOutboxItems());
  }, []);

  useEffect(() => {
    // `navigator.onLine` is only read once mounted: on the server it does not
    // exist, and assuming offline would flash a banner on every first paint.
    setOnline(isOnline());
    void refresh();

    const stopWatcher = startOutboxWatcher();
    const stopListening = onOutboxChange(() => void refresh());

    const goOnline = () => {
      setOnline(true);
      void flushOutbox().then(refresh);
      askWorkerToFlush();
    };

    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      stopWatcher();
      stopListening();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [refresh]);

  // Registration is separate from the watcher because it should happen once per
  // load regardless of queue state.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    /*
     * Never in development.
     *
     * The worker caches hashed assets cache-first, and a dev server rebuilds
     * those constantly — Turbopack and webpack even name them differently. A
     * worker left registered against localhost serves fragments of a previous
     * build and produces exactly the symptom you cannot debug: a page that is
     * "not working" for no reason visible in the source.
     *
     * It also actively unregisters anything already installed, because a
     * worker registered during an earlier session outlives the code change
     * that stopped registering it.
     */
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister();
      });
      return;
    }

    // After load, so registering never competes with the first paint.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("[sw] registration failed", error);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  async function handleRetry() {
    setRetrying(true);
    try {
      await retryFailedItems();
      await refresh();
      askWorkerToFlush();
    } finally {
      setRetrying(false);
    }
  }

  if (online && pending === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "no-print sticky top-16 z-(--z-sticky) border-b",
        online
          ? "border-info/25 bg-info-soft text-info-ink"
          : "border-caution/30 bg-caution-soft text-caution-ink",
      )}
    >
      <div className="container-page flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-sm font-medium">
        <CloudSlashIcon size={17} weight="fill" aria-hidden="true" className="shrink-0" />

        <span>
          {!online
            ? "No signal. You can carry on — anything you write is saved on this phone."
            : pending === 1
              ? "1 note still to send."
              : `${pending} notes still to send.`}
        </span>

        {online && pending > 0 ? (
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className={cn(
              "ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5",
              "underline underline-offset-4 transition-opacity duration-200",
              "hover:opacity-80 disabled:opacity-50",
            )}
          >
            <ArrowsClockwiseIcon
              size={15}
              weight="bold"
              aria-hidden="true"
              className={retrying ? "animate-spin" : undefined}
            />
            {retrying ? "Sending…" : "Send them now"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Nudges the worker for browsers with no Background Sync (Safari, Firefox). */
function askWorkerToFlush(): void {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.ready
    .then((registration) => registration.active?.postMessage({ type: "flush-outbox" }))
    .catch(() => {
      // No worker yet. The in-page flush already ran.
    });
}
