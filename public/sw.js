// Minimal cache-first service worker. Bump CACHE_NAME on every deploy that
// changes cached files so old clients pick up the new version instead of
// being stuck on a stale cache.
const CACHE_NAME = "fotbollsbyten-v1";

self.addEventListener("install", (event) => {
	self.skipWaiting();
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) =>
				cache.addAll([".", "index.html", "manifest.webmanifest"]),
			),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") return;
	event.respondWith(
		caches.match(event.request).then((cached) => {
			const network = fetch(event.request)
				.then((response) => {
					if (response.ok) {
						const copy = response.clone();
						caches
							.open(CACHE_NAME)
							.then((cache) => cache.put(event.request, copy));
					}
					return response;
				})
				.catch(() => cached);
			return cached ?? network;
		}),
	);
});
