const CACHE_NAME = "vff-cache-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./schedule.json",
  "./schedule_extracted.csv",
  "./manifest.json",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        APP_SHELL.map(async (asset) => {
          try {
            const response = await fetch(asset, { cache: "no-store" });
            if (response.ok) {
              await cache.put(asset, response.clone());
            }
          } catch (err) {
            // Skip asset-level failures so SW install still succeeds.
          }
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone)));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  const url = new URL(request.url);
  const isScheduleRequest =
    url.pathname.endsWith("schedule.json") ||
    url.pathname.endsWith("schedule_extracted.csv") ||
    url.href.includes("/gviz/tq?tqx=out:csv");

  if (isScheduleRequest) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return (
          cached ||
          fetch(request)
            .then((response) => {
              if (response.ok) {
                const responseClone = response.clone();
                event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone)));
              }
              return response;
            })
            .catch(() => caches.match("./schedule.json") || caches.match("./schedule_extracted.csv"))
        );
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const responseClone = response.clone();
              event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone)));
            }
            return response;
          })
          .catch(() => caches.match(request))
      );
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
