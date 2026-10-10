const CACHE_NAME = "packetlab-shell-v1";
const APP_SCOPE = self.registration.scope;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const indexUrl = new URL("index.html", APP_SCOPE);
    const indexResponse = await fetch(indexUrl, { cache: "reload" });
    if (!indexResponse.ok) throw new Error("Unable to precache PacketLab shell.");
    const html = await indexResponse.clone().text();
    const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
      .map((match) => new URL(match[1], indexUrl).href);
    const shellUrls = [
      new URL("./", APP_SCOPE).href,
      indexUrl.href,
      new URL("manifest.webmanifest", APP_SCOPE).href,
      new URL("packetlab-icon.svg", APP_SCOPE).href,
      ...assetUrls
    ];
    await cache.addAll([...new Set(shellUrls)]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
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
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
          await cache.put(new URL("index.html", APP_SCOPE), response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) ||
          (await caches.match(new URL("./", APP_SCOPE))) ||
          (await caches.match(new URL("index.html", APP_SCOPE)));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
