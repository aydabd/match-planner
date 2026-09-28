// Minimal cache-first service worker. The build (vite.config.ts) writes this
// file to sw.js with the cache named after the app version, so every release
// installs a fresh cache and the activate step removes the old one.
const CACHE_NAME = "__CACHE_NAME__";
// Every aydabd.github.io site shares one origin, so only this app's caches may
// be deleted. Same rule as isOwnCache in src/ui/appStorage.ts (values injected).
const CACHE_PREFIX = "__CACHE_PREFIX__";
const LEGACY_CACHES = __LEGACY_CACHES__;
const isOwnCache = (name) =>
	(name.startsWith(CACHE_PREFIX) && name.length > CACHE_PREFIX.length) ||
	LEGACY_CACHES.includes(name);

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
					keys
						.filter((k) => k !== CACHE_NAME && isOwnCache(k))
						.map((k) => caches.delete(k)),
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
