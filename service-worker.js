const CACHE_NAME = "min-gym-app-shell-v5";
const CACHE_PREFIX = "min-gym-app-shell-";
const SUPABASE_LIBRARY_URL =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./supabase.js",
  "./workspace.js",
  "./src/utils.js",
  "./src/storage.js",
  "./src/exercises.js",
  "./src/plans.js",
  "./src/sessions.js",
  "./src/history.js",
  "./src/statistics.js",
  "./src/app.js",
  "./auth.js",
  "./src/pwa.js"
];
const APP_FILE_URLS = new Set(
  APP_SHELL.map((path) => new URL(path, self.registration.scope).href)
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);

      try {
        await cache.add(SUPABASE_LIBRARY_URL);
      } catch (error) {
        console.warn("Supabase-biblioteket kunde inte förhandslagras:", error);
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME
          )
          .map((cacheName) => caches.delete(cacheName))
      );

      await self.clients.claim();
    })()
  );
});

async function fetchAndCache(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    if (response.ok || response.type === "opaque") {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

async function fetchNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put("./index.html", response.clone());
    }

    return response;
  } catch (error) {
    const cachedResponse = await cache.match("./index.html");

    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);
  const isAppNavigation =
    request.mode === "navigate" && requestUrl.origin === self.location.origin;
  const isAppFile = APP_FILE_URLS.has(requestUrl.href);
  const isSupabaseLibrary = requestUrl.href === SUPABASE_LIBRARY_URL;

  if (isAppNavigation) {
    event.respondWith(fetchNavigation(request));
    return;
  }

  if (isAppFile || isSupabaseLibrary) {
    event.respondWith(fetchAndCache(request));
  }
});
