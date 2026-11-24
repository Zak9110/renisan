// Renisan Platform Service Worker (M5 PWA Offline Cache)
// Caches app shell, public opportunity/admissions data, and user's saved lists for
// flaky connectivity in Iraq. Never caches OTP/auth/admin endpoints or mutations.

// DATA_CACHE holds personal responses: AccountClient deletes it on logout and account deletion.
const STATIC_CACHE = "renisan-static-v1";
const DATA_CACHE = "renisan-data-v1";

const PRECACHE_URLS = ["/manifest.webmanifest", "/icons/icon-192.svg", "/icons/icon-512.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheableApi(pathname) {
  return (
    pathname === "/api/opportunities" ||
    pathname.startsWith("/api/opportunities/") ||
    pathname === "/api/admissions" ||
    pathname === "/api/lists" ||
    pathname === "/api/deadlines"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache auth, OTP, admin, cron, or calendar secret feeds
  if (
    url.pathname.startsWith("/api/auth/") ||
    url.pathname.startsWith("/api/admin/") ||
    url.pathname.startsWith("/api/account") ||
    url.pathname.startsWith("/api/telegram/") ||
    url.pathname.startsWith("/api/notifications/") ||
    url.pathname.startsWith("/api/calendar/") ||
    /^\/(ar|ckb|kmr|en)\/(admin|account)(\/|$)/.test(url.pathname)
  ) {
    return;
  }

  // Network-first with offline cache fallback for public/saved GET APIs
  if (isCacheableApi(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || Response.error()),
    );
    return;
  }

  // Cache-first for immutable Next static assets and icons
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Network-first with cached page fallback for document navigations
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || Response.error()),
    );
  }
});
