// Offline shell for the dashboard. Without this, a refresh or a cold start
// during an outage shows the browser's "no internet" page — and offline
// billing is unreachable exactly when it's needed.
//
// Strategy:
//   /_next/static/*  — cache first. Content-hashed, so a cached copy is never stale.
//   navigations      — network first, falling back to the last good copy of that
//                      page, then to any cached dashboard page. Nothing is
//                      served stale while online.
//   /api/*           — never cached. Stale orders or menus would be worse than
//                      an error; the POS has its own IndexedDB cache.
const VERSION = "v1";
const STATIC_CACHE = `carkhanaa-static-${VERSION}`;
const PAGE_CACHE = `carkhanaa-pages-${VERSION}`;
const FALLBACK_PAGE = "/dashboard/billing";

self.addEventListener("install", (event) => {
  // Warm the billing page so a device that installs the app and immediately
  // loses connectivity can still bill.
  event.waitUntil(
    caches.open(PAGE_CACHE)
      .then((cache) => cache.add(FALLBACK_PAGE))
      .catch(() => {}) // offline at install — the first online visit fills it
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always live

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      }))
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(PAGE_CACHE);
          return (await cache.match(request))
            || (await cache.match(FALLBACK_PAGE))
            || new Response("Offline — reopen once you're back online.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            });
        })
    );
  }
});
