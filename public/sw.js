const CACHE_NAME = "packetlab-shell-v3";
const APP_SCOPE = self.registration.scope;
const SCOPE_URL = new URL("./", APP_SCOPE);
const INDEX_URL = new URL("index.html", APP_SCOPE);
const METADATA_PATHS = new Set([
  "manifest.webmanifest",
  "packetlab-icon.svg",
  "packetlab-icon-192.png",
  "packetlab-icon-512.png",
  "packetlab-icon-maskable-512.png",
  "apple-touch-icon.png"
].map((path) => new URL(path, APP_SCOPE).pathname));

function fetchWithTimeout(request, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timeout));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const indexResponse = await fetch(INDEX_URL, { cache: "reload" });
    if (!indexResponse.ok) throw new Error("Unable to precache PacketLab shell.");
    const html = await indexResponse.clone().text();
    const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
      .map((match) => new URL(match[1], INDEX_URL).href);
    const shellUrls = [
      SCOPE_URL.href,
      INDEX_URL.href,
      new URL("manifest.webmanifest", APP_SCOPE).href,
      new URL("packetlab-icon.svg", APP_SCOPE).href,
      new URL("packetlab-icon-192.png", APP_SCOPE).href,
      new URL("packetlab-icon-512.png", APP_SCOPE).href,
      new URL("packetlab-icon-maskable-512.png", APP_SCOPE).href,
      new URL("apple-touch-icon.png", APP_SCOPE).href,
      ...assetUrls
    ];
    await cache.addAll([...new Set(shellUrls)]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Versioned cache rollover removes every unreferenced asset in older PacketLab shell caches.
    await Promise.all(keys.filter((key) => key.startsWith("packetlab-shell-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(APP_SCOPE)) return;

  if (request.mode === "navigate") {
    const isIndex = url.pathname === SCOPE_URL.pathname || url.pathname === INDEX_URL.pathname;
    if (!isIndex) {
      event.respondWith(fetchWithTimeout(request).catch(() => Response.error()));
      return;
    }

    event.respondWith((async () => {
      try {
        const response = await fetchWithTimeout(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          // Use canonical keys to discard query strings from navigation cache entries.
          await cache.put(SCOPE_URL, response.clone());
          await cache.put(INDEX_URL, response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(SCOPE_URL)) || (await cache.match(INDEX_URL)) || Response.error();
      }
    })());
    return;
  }

  if (METADATA_PATHS.has(url.pathname)) {
    const cache = caches.open(CACHE_NAME);
    const cached = cache.then((opened) => opened.match(request));
    const refresh = fetch(request).then(async (response) => {
      if (response.ok) {
        const opened = await cache;
        await opened.put(request, response.clone());
      }
      return response;
    }).catch(() => null);
    // Run the network refresh even when a cached response can be returned immediately.
    event.waitUntil(refresh.then(() => undefined));
    event.respondWith((async () => (await cached) || (await refresh) || Response.error())());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
