// Previous production cache: pet-habit-v1-3-2-production-release-20261014
const CACHE_NAME = "pet-habit-v1-3-2-production-release-20261018";
const HTML_NETWORK_TIMEOUT_MS = 1200;

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
  "./src/adventure/adventure-foundation.js",
  "./src/adventure/forest-mini-game-pool-v1.js",
  "./src/adventure/mystery-forest-v1.js",
  "./src/adventure/forest-sudoku-v1.js",
  "./src/ui/movement-contract.js",
  "./src/ui/room-composition.js",
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
  "./src/core/player-save-exporter.js",
  "./src/core/sync-manager.js",
  "./src/core/app-boot.js",
  "./src/platform-foundation-init.js",
  "./assets/icons/favicon.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/rooms/bedroom/empty_furniture_room_v1.png",
  "./assets/rooms/home/home_garden_v1.jpg",
  "./assets/world/world_map_kingdom_20260906.png",
  "./assets/rooms/map/kingdom_map_v1.png",
  "./assets/rooms/map/destinations/destination_school_park_v1.png",
  "./assets/rooms/map/destinations/destination_mystery_forest_v1.png",
  "./assets/rooms/map/destinations/destination_supply_shop_v1.png",
  "./assets/rooms/map/destinations/destination_style_house_v1.png",
  "./assets/rooms/map/destinations/destination_wish_house_v1.png",
  "./assets/rooms/forest/mystery_forest_v1.png",
  "./assets/rooms/park/day.webp",
  "./assets/rooms/park/night.webp",
  "./assets/rooms/school/day.png",
  "./assets/pets/cat/normal.webp",
  "./assets/pets/cat/happy.webp",
  "./assets/pets/cat/lonely.webp",
  "./assets/pets/cat/sleep.webp",
  "./assets/pets/cat/juvenile_normal.webp",
  "./assets/pets/cat/juvenile_happy.webp",
  "./assets/pets/cat/juvenile_lonely.webp",
  "./assets/pets/cat/juvenile_sleep.webp",
  "./assets/pets/cat/growing_normal.webp",
  "./assets/pets/cat/growing_happy.webp",
  "./assets/pets/cat/growing_lonely.webp",
  "./assets/pets/cat/growing_sleep.webp",
  "./assets/pets/cat/teen_normal.webp",
  "./assets/pets/cat/teen_happy.webp",
  "./assets/pets/cat/teen_lonely.webp",
  "./assets/pets/cat/teen_sleep.webp",
  "./assets/pets/dog/normal.webp",
  "./assets/pets/dog/happy.webp",
  "./assets/pets/dog/lonely.webp",
  "./assets/pets/dog/sleep.webp",
  "./assets/pets/dog/juvenile_normal.webp",
  "./assets/pets/dog/juvenile_happy.webp",
  "./assets/pets/dog/juvenile_lonely.webp",
  "./assets/pets/dog/juvenile_sleep.webp",
  "./assets/pets/dog/growing_normal.webp",
  "./assets/pets/dog/growing_happy.webp",
  "./assets/pets/dog/growing_lonely.webp",
  "./assets/pets/dog/growing_sleep.webp",
  "./assets/pets/dog/teen_normal.webp",
  "./assets/pets/dog/teen_happy.webp",
  "./assets/pets/dog/teen_lonely.webp",
  "./assets/pets/dog/teen_sleep.webp",
  "./assets/pets/fox/normal.webp",
  "./assets/pets/fox/happy.webp",
  "./assets/pets/fox/lonely.webp",
  "./assets/pets/fox/sleep.webp",
  "./assets/pets/fox/juvenile_normal.webp",
  "./assets/pets/fox/juvenile_happy.webp",
  "./assets/pets/fox/juvenile_lonely.webp",
  "./assets/pets/fox/juvenile_sleep.webp",
  "./assets/pets/fox/growing_normal.webp",
  "./assets/pets/fox/growing_happy.webp",
  "./assets/pets/fox/growing_lonely.webp",
  "./assets/pets/fox/growing_sleep.webp",
  "./assets/pets/fox/teen_normal.webp",
  "./assets/pets/fox/teen_happy.webp",
  "./assets/pets/fox/teen_lonely.webp",
  "./assets/pets/fox/teen_sleep.webp",
  "./assets/pets/horse/normal.webp",
  "./assets/pets/horse/happy.webp",
  "./assets/pets/horse/lonely.webp",
  "./assets/pets/horse/sleep.webp",
  "./assets/pets/horse/juvenile_normal.webp",
  "./assets/pets/horse/juvenile_happy.webp",
  "./assets/pets/horse/juvenile_lonely.webp",
  "./assets/pets/horse/juvenile_sleep.webp",
  "./assets/pets/horse/growing_normal.webp",
  "./assets/pets/horse/growing_happy.webp",
  "./assets/pets/horse/growing_lonely.webp",
  "./assets/pets/horse/growing_sleep.webp",
  "./assets/pets/horse/teen_normal.webp",
  "./assets/pets/horse/teen_happy.webp",
  "./assets/pets/horse/teen_lonely.webp",
  "./assets/pets/horse/teen_sleep.webp",
  "./assets/pet-accessories/founder/founder_crown.png",
  "./assets/accessories/pet/forest_launch_balloon.png",
  "./assets/furniture/cream_pet_room/cream_paw_round_rug.webp",
  "./assets/furniture/cream_pet_room/cream_star_cushion.webp",
  "./assets/furniture/cream_pet_room/cream_hanging_plant.webp",
  "./assets/furniture/cream_pet_room/thumbs/cream_paw_round_rug.webp",
  "./assets/furniture/cream_pet_room/thumbs/cream_star_cushion.webp",
  "./assets/furniture/cream_pet_room/thumbs/cream_hanging_plant.webp",
  "./assets/furniture/pending/room_furniture_cream_wood_bed.png",
  "./assets/furniture/pending/room_furniture_cream_wood_wardrobe.png",
  "./assets/furniture/pending/room_furniture_cream_star_floor_lamp.png",
  "./assets/furniture/pending/thumbs/room_furniture_cream_wood_bed.png",
  "./assets/furniture/pending/thumbs/room_furniture_cream_wood_wardrobe.png",
  "./assets/furniture/pending/thumbs/room_furniture_cream_star_floor_lamp.png",
  "./assets/furniture/founder/first_resident_frame.png",
  "./assets/owner/boy/founder_b_01.png",
  "./assets/owner/boy/founder_b_02.png",
  "./assets/owner/boy/forest_explorer_b.png",
  "./assets/owner/girl/founder_g_01.png",
  "./assets/owner/girl/founder_g_02.png",
  "./assets/owner/girl/forest_explorer_g.png"
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
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("html_network_timeout")), HTML_NETWORK_TIMEOUT_MS);
    });
    const network = fetch(request, {cache:"no-store"})
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
        return response;
      });
    event.respondWith(
      Promise.race([network, timeout])
        .catch(() => caches.match("./index.html").then(cached => cached || network))
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

