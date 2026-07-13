const CACHE_NAME = "pet-habit-7-15-final-hotfix-20260715";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./maggie-analytics.js",
  "./manifest.webmanifest",
  "./src/analytics/traffic-source.js",
  "./src/analytics/google-sheet-schema.js",
  "./src/core/result.js",
  "./src/config/environment.js",
  "./src/core/feature-flags.js",
  "./src/platform/web-platform-adapter.js",
  "./src/analytics/analytics-manager.js",
  "./src/data/repository.js",
  "./src/data/local-repository.js",
  "./src/data/pending-operations.js",
  "./src/data/mock-cloud-repository.js",
  "./src/data/supabase-cloud-repository.js",
  "./src/auth/supabase-auth-manager.js",
  "./src/core/conflict-manager.js",
  "./src/core/cloud-mapping-manager.js",
  "./src/core/cloud-migration-manager.js",
  "./src/core/save-manager.js",
  "./src/core/sync-manager.js",
  "./src/core/app-boot.js",
  "./src/platform-foundation-init.js",
  "./assets/icons/favicon.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/rooms/bedroom/empty_furniture_room_v1.png",
  "./assets/rooms/park/day.webp",
  "./assets/rooms/park/night.webp",
  "./assets/rooms/school/day.png",
  "./assets/pet-accessories/founder/founder_crown.png",
  "./assets/furniture/founder/first_resident_frame.png",
  "./assets/owner/boy/founder_b_01.png",
  "./assets/owner/boy/founder_b_02.png",
  "./assets/owner/girl/founder_g_01.png",
  "./assets/owner/girl/founder_g_02.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .catch(() => undefined)
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  let url;
  try{url = new URL(request.url);}catch(e){url = null;}
  if (url && (
    url.hostname === "script.google.com" ||
    url.hostname.endsWith(".googleusercontent.com") ||
    url.hostname.endsWith(".supabase.co") ||
    url.hostname === "cdn.jsdelivr.net" ||
    url.hostname === "accounts.google.com"
  )) return;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request, {cache:"no-store"}).then(response => {
        if (response && response.ok && url && url.origin === location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
      return network.catch(() => cached);
    })
  );
});
