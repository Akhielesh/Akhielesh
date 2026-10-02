/* Adminak service worker: offline app shell + web push notifications. */
const SHELL = "adminak-shell-v2";
const ASSETS = "adminak-assets-v2";
// The console can live under a prefix (akhielesh.com/adminak/); the registration scope says where.
const BASE = new URL(self.registration.scope).pathname; // always ends with "/"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([BASE, `${BASE}manifest.webmanifest`, `${BASE}icon.svg`, `${BASE}theme.js`]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const local = url.pathname.slice(BASE.length - 1);
  // Never cache API responses, calendar feeds or health checks.
  if (local.startsWith("/api/") || local.startsWith("/calendar/") || local === "/healthz") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(BASE, copy));
          return response;
        })
        .catch(() => caches.match(BASE).then((cached) => cached || Response.error())),
    );
    return;
  }

  if (local.startsWith("/assets/")) {
    // Hashed, immutable assets: cache-first.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Adminak", body: "You have a new alert.", url: `${BASE}alerts`, severity: "medium", tag: "alerts" };
  try {
    data = Object.assign(data, event.data ? event.data.json() : {});
  } catch (e) {
    data.body = event.data ? event.data.text() : data.body;
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: `${BASE}icon-192.png`,
      badge: `${BASE}icon-192.png`,
      tag: data.tag,
      renotify: true,
      requireInteraction: data.severity === "critical",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || BASE;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
