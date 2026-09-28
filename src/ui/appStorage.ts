/**
 * The only module that touches the browser's localStorage. It lists every key
 * the app saves, so "clear all saved data" can never miss one, and it absorbs
 * storage errors (private browsing, quota, disabled storage): the app keeps
 * working for the current tab, it just won't remember across reloads.
 */

/** Every key the app saves. Bump the version suffix if a value's shape changes. */
export const STORAGE_KEYS = {
	/** The squad being set up on the setup screen. */
	draft: "matchplanner:draft:v1",
	/** The match in progress, so a reload resumes it. */
	session: "matchplanner:session:v1",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** The saved value, or null if there is none or storage is unavailable. */
export function readItem(key: StorageKey): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function writeItem(key: StorageKey, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Not fatal: the in-memory state still works for this tab.
	}
}

export function removeItem(key: StorageKey): void {
	try {
		localStorage.removeItem(key);
	} catch {
		// Nothing saved, or storage unavailable: either way it is gone.
	}
}

/** Remove everything the app has saved, leaving other sites' data alone. */
export function clearAppData(): void {
	for (const key of Object.values(STORAGE_KEYS)) removeItem(key);
}
