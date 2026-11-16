// Security release: app code requires a network connection. No offline shell.
const RELEASE_VERSION = "2026.11.12-rc1";
const WORKER_VERSION = 6;
const LEGACY_CACHE_PATTERN = /^min-gym-app-shell-v([1-5])$/;
const LEGACY_SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
const APP_SCOPE = new URL(self.registration.scope);

function isInAppScope(url) {
  return url.origin === APP_SCOPE.origin &&
    url.pathname.startsWith(APP_SCOPE.pathname);
}

async function isOwnedLegacyCache(name) {
  if (!LEGACY_CACHE_PATTERN.test(name)) return false;
  const cache = await caches.open(name);
  const requests = await cache.keys();
  const indexUrl = new URL("./index.html", APP_SCOPE).href;
  // CacheStorage is shared by an origin, not separated by worker scope.
  // Require this app's shell and reject entries belonging to another scope.
  return requests.some(request => request.url === indexUrl) &&
    requests.every(request => {
      const url = new URL(request.url);
      return isInAppScope(url) || url.href === LEGACY_SDK_URL;
    });
}

// No skipWaiting or clients.claim: existing documents retain their worker
// until closed. Never replace a user's in-memory training session on update.
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (await isOwnedLegacyCache(name)) await caches.delete(name);
    }
  })());
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!isInAppScope(url)) return;
  const isAppResource = request.mode === "navigate" ||
    ["document", "script", "style", "image", "font", "manifest"].includes(request.destination) ||
    /\.(?:html?|m?js)$/i.test(url.pathname);
  if (!isAppResource) return;
  // Bypass HTTP cache too. Network errors fail; no stale code is substituted.
  event.respondWith(fetch(request, { cache: "no-store" }));
});

// Read-only version probe for release verification. No activation command.
self.addEventListener("message", event => {
  if (event.data?.type === "GET_RELEASE_VERSION" && event.ports?.[0]) {
    event.ports[0].postMessage({
      release: RELEASE_VERSION,
      workerVersion: WORKER_VERSION,
      appCodePolicy: "network-only"
    });
  }
});
