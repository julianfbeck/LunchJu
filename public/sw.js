// Only the generic connection notice is cached. Never cache authenticated HTML,
// recipes, images, API responses, OAuth pages, MCP traffic or failed mutations.
const CACHE = "lunchju-offline-v1";
// Cloudflare serves offline.html at this canonical URL without a redirect.
const OFFLINE = "/offline";
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(
        new Request(OFFLINE, { cache: "reload", credentials: "omit" }),
      );
      if (!response.ok) throw new Error("Offline notice unavailable");
      await (await caches.open(CACHE)).put(OFFLINE, response);
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys())
          .filter(
            (name) => name.startsWith("lunchju-offline-") && name !== CACHE,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    url.origin !== self.location.origin ||
    url.pathname !== "/"
  )
    return;
  event.respondWith(
    fetch(request).catch(
      async () =>
        (await (await caches.open(CACHE)).match(OFFLINE)) ?? Response.error(),
    ),
  );
});
