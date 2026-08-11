/* eslint-disable no-undef */

/**
 * Carr Denzy service worker.
 *
 * Two jobs, and deliberately no more:
 *
 *   1. Keep the app openable with no signal. Static assets are cached so the
 *      shell paints, and a failed navigation lands on a written offline page
 *      rather than the browser's dinosaur.
 *
 *   2. Replay the offline outbox through Background Sync, so a note typed in a
 *      basement sends itself even if the owner closed the app on the way out.
 *      That is the promise made in src/lib/outbox.ts, and it can only be kept
 *      from here — the page is gone by then.
 *
 * What it deliberately does NOT do is cache HTML. Every page behind /app and
 * /portal is specific to who is signed in, and a cached page served to the next
 * visitor on a shared device would be a data leak. Documents are always fetched
 * from the network; only assets and the offline page come from the cache.
 */

const VERSION = "v1";
const ASSET_CACHE = `carr-denzy-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ASSET_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== ASSET_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Assets that are content-hashed or static, and safe to serve from cache. */
function isCacheableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/fonts/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch anything that changes state, and never touch another origin.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Auth and API responses are per-user and short-lived. Straight to network.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(ASSET_CACHE);
        const offline = await cache.match(OFFLINE_URL);
        return offline ?? Response.error();
      }),
    );
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          // Only cache a clean, complete response. A 206 or an opaque error
          // cached here would be served back forever.
          if (response.ok && response.status === 200) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }

          return response;
        });
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// Outbox replay
// ---------------------------------------------------------------------------

const DB_NAME = "carr-denzy-outbox";
const STORE = "outbox";

/** Opens the queue the page writes to. Never creates or upgrades it. */
function openOutboxDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAll(db) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(STORE)) {
      resolve([]);
      return;
    }

    const transaction = db.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).getAll();

    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

function remove(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Sends everything queued.
 *
 * Delivery is idempotent on the server — every item carries a `client_key`
 * covered by a unique index — so a replay that overlaps with the page draining
 * the same queue is harmless rather than a duplicated note.
 */
async function replayOutbox() {
  let db;

  try {
    db = await openOutboxDb();
  } catch {
    return;
  }

  const items = await readAll(db);

  for (const item of items) {
    if (item.id === undefined) continue;

    const formData = new FormData();
    for (const [key, value] of Object.entries(item.payload ?? {})) {
      formData.set(key, String(value));
    }

    try {
      const response = await fetch("/api/outbox", {
        method: "POST",
        body: formData,
        headers: { "x-outbox-kind": item.kind },
      });

      // Left in the queue on failure, never dropped. The page surfaces it with
      // a Retry after three attempts.
      if (response.ok) await remove(db, item.id);
    } catch {
      return; // Still no network. Sync will fire again.
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "carr-denzy-outbox") {
    event.waitUntil(replayOutbox());
  }
});

// Safari and Firefox have no Background Sync, so the page asks directly.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "flush-outbox") {
    event.waitUntil(replayOutbox());
  }
});
