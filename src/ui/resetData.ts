import { clearAppData, isOwnCache } from "./appStorage.js";

/**
 * Remove everything this app has saved in the browser: the squad, the match
 * in progress, its offline caches and its service worker. Other sites on the
 * same origin (every aydabd.github.io project shares one) are left alone.
 */
export async function clearAllSavedData(appUrl: URL): Promise<void> {
	clearAppData();
	if ("caches" in globalThis) {
		for (const name of await caches.keys()) {
			if (isOwnCache(name)) await caches.delete(name);
		}
	}
	if ("serviceWorker" in navigator) {
		for (const registration of await navigator.serviceWorker.getRegistrations()) {
			if (registration.scope.startsWith(appUrl.href)) {
				await registration.unregister();
			}
		}
	}
}
