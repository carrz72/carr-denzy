/* eslint-disable no-undef */

/**
 * Carr Denzy service worker.
 *
 * Three jobs, and deliberately no more:
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
 *   3. Receive push notifications, so a new enquiry buzzes the phone rather
 *      than waiting in an inbox nobody checks on a job. This too can only
 *      happen here: the app is closed at the moment it matters.
 *
 * What it deliberately does NOT do is cache HTML. Every page behind /app and
 * /portal is specific to who is signed in, and a cached page served to the next
 * visitor on a shared device would be a data leak. Documents are always fetched
 * from the network; only assets and the offline page come from the cache.
 */

// Bumped when the cached asset set changes. Old caches are swept on activate.
const VERSION = "v2";
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

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  // A push with no readable payload still has to show something. Browsers
  // penalise — and on some platforms forcibly display a generic notification
  // for — a push event that shows nothing at all, so there is no silent path.
  let data = {
    title: "Carr Denzy",
    body: "Something needs your attention.",
    url: "/app",
    tag: "carr-denzy",
    urgent: false,
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      const text = event.data.text();
      if (text) data.body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // The tag collapses repeats: three enquiries in a minute become one
      // updated notification rather than three separate buzzes. Emergencies
      // get their own tag so they are never collapsed into routine ones.
      tag: data.urgent ? `${data.tag}-urgent` : data.tag,
      // Always re-alert, even when replacing a notification with the same tag.
      //
      // This was `Boolean(data.urgent)`, which meant a second enquiry arriving
      // while the first was still sitting in the notification shade replaced it
      // SILENTLY — no sound, no buzz, no banner. The count on screen went up
      // and nothing told anybody. For a one-man trade business the second
      // enquiry is a second job, and a job nobody hears about is a job lost.
      //
      // Collapsing still happens, so the shade stays tidy; it just never
      // happens quietly.
      renotify: true,
      requireInteraction: Boolean(data.urgent),
      // Vibration only fires on Android; iOS ignores it silently.
      vibrate: data.urgent ? [200, 100, 200, 100, 200] : [150],
      data: { url: data.url },
      actions: [{ action: "open", title: "Open" }],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || "/app";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Reuse an already-open window rather than stacking a second copy of the
      // app on top of the one the owner already had. Tapping a notification
      // should feel like switching to the app, not launching a new one.
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }

      return self.clients.openWindow(target);
    }),
  );
});

/**
 * Fires when the push service rotates a subscription out from under us.
 *
 * Without this the phone quietly stops receiving notifications and nobody
 * finds out until an enquiry is missed. Re-subscribing and telling the server
 * keeps it alive.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const old = event.oldSubscription || (await self.registration.pushManager.getSubscription());
        const applicationServerKey = old?.options?.applicationServerKey;
        if (!applicationServerKey) return;

        const fresh = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: fresh, replaces: old?.endpoint ?? null }),
        });
      } catch {
        // Nothing useful to do from here — the app re-registers on next open.
      }
    })(),
  );
});
