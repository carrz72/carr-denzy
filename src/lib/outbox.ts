"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * The offline outbox (spec FR-64 … FR-67).
 *
 * A plumber works in basements, plant rooms and lift shafts. A note typed
 * there must never be lost because there was no signal — so every owner write
 * that can tolerate a delay is queued here first and replayed later.
 *
 * Replay strategy, in order of preference:
 *   1. Background Sync, where the browser supports it. Chromium only, but it
 *      replays even if the app has been closed.
 *   2. The `online` event, everywhere else. Safari and Firefox have no
 *      Background Sync, so the app must be open for the queue to drain. That
 *      is a documented limitation, not a silent failure.
 *
 * Items are never discarded on failure. After three attempts they are surfaced
 * to the owner with a Retry rather than dropped (spec FR-66).
 */

export type OutboxKind = "job-note";

export interface OutboxItem {
  id?: number;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: number;
  lastError?: string;
}

interface OutboxDB extends DBSchema {
  outbox: {
    key: number;
    value: OutboxItem;
    indexes: { "by-created": number };
  };
}

const DB_NAME = "carr-denzy-outbox";
const DB_VERSION = 1;
const MAX_ATTEMPTS = 3;

let dbPromise: Promise<IDBPDatabase<OutboxDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<OutboxDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore("outbox", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by-created", "createdAt");
      },
    });
  }

  return dbPromise;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export async function queueOutboxItem(
  item: Pick<OutboxItem, "kind" | "payload">,
): Promise<void> {
  try {
    const db = await getDb();
    await db.add("outbox", { ...item, attempts: 0, createdAt: Date.now() });

    await requestBackgroundSync();
    notifyChange();
  } catch (error) {
    console.error("[outbox] could not queue", error);
  }
}

export async function getOutboxItems(): Promise<OutboxItem[]> {
  try {
    const db = await getDb();
    // Oldest first — the queue replays in the order things were written, so a
    // later note never lands before the one it followed.
    return await db.getAllFromIndex("outbox", "by-created");
  } catch {
    return [];
  }
}

export async function countOutboxItems(): Promise<number> {
  try {
    const db = await getDb();
    return await db.count("outbox");
  } catch {
    return 0;
  }
}

async function removeItem(id: number): Promise<void> {
  const db = await getDb();
  await db.delete("outbox", id);
}

async function recordFailure(item: OutboxItem, message: string): Promise<void> {
  if (item.id === undefined) return;

  const db = await getDb();
  await db.put("outbox", { ...item, attempts: item.attempts + 1, lastError: message });
}

/**
 * Sends one queued item. Returns true when it is safely delivered and can be
 * removed from the queue.
 */
async function deliver(item: OutboxItem): Promise<boolean> {
  const formData = new FormData();
  for (const [key, value] of Object.entries(item.payload)) {
    formData.set(key, String(value));
  }

  const response = await fetch("/api/outbox", {
    method: "POST",
    body: formData,
    headers: { "x-outbox-kind": item.kind },
  });

  return response.ok;
}

/**
 * Drains the queue. Safe to call at any time — concurrent calls are harmless
 * because delivery is idempotent on the server via `client_key`.
 */
export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  if (!isOnline()) return { sent: 0, failed: 0 };

  const items = await getOutboxItems();
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    if (item.id === undefined) continue;

    // Stop retrying automatically after three goes; the item stays in the
    // queue and the UI offers a manual Retry.
    if (item.attempts >= MAX_ATTEMPTS) {
      failed += 1;
      continue;
    }

    try {
      if (await deliver(item)) {
        await removeItem(item.id);
        sent += 1;
      } else {
        await recordFailure(item, "The server rejected it");
        failed += 1;
      }
    } catch (error) {
      await recordFailure(item, error instanceof Error ? error.message : "Network error");
      failed += 1;
    }
  }

  if (sent > 0 || failed > 0) notifyChange();

  return { sent, failed };
}

/** Forces a retry of items that have already used up their automatic attempts. */
export async function retryFailedItems(): Promise<void> {
  const db = await getDb();
  const items = await db.getAll("outbox");

  for (const item of items) {
    if (item.id !== undefined && item.attempts >= MAX_ATTEMPTS) {
      await db.put("outbox", { ...item, attempts: 0, lastError: undefined });
    }
  }

  await flushOutbox();
}

export async function clearOutbox(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear("outbox");
    notifyChange();
  } catch {
    // Nothing to do — a missing database is an empty queue.
  }
}

async function requestBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;

    // `sync` is not in the standard ServiceWorkerRegistration type because it
    // is Chromium-only. Feature-detect rather than assume.
    const withSync = registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };

    if (withSync.sync) {
      await withSync.sync.register("carr-denzy-outbox");
    }
  } catch {
    // Background Sync unavailable or blocked. The `online` listener covers it.
  }
}

const CHANGE_EVENT = "carr-denzy-outbox-change";

function notifyChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export function onOutboxChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

/** Wires up automatic draining. Called once, from the offline indicator. */
export function startOutboxWatcher(): () => void {
  if (typeof window === "undefined") return () => {};

  const onReconnect = () => {
    void flushOutbox();
  };

  window.addEventListener("online", onReconnect);

  // Also try on load, in case the browser was offline when the app closed.
  if (isOnline()) void flushOutbox();

  return () => window.removeEventListener("online", onReconnect);
}
