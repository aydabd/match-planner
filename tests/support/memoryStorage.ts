import { afterEach, beforeEach, vi } from "vitest";

/** In-memory stand-in for the browser's localStorage. */
export class MemoryStorage implements Storage {
	private items = new Map<string, string>();

	get length(): number {
		return this.items.size;
	}
	clear(): void {
		this.items.clear();
	}
	getItem(key: string): string | null {
		return this.items.get(key) ?? null;
	}
	key(index: number): string | null {
		return [...this.items.keys()][index] ?? null;
	}
	removeItem(key: string): void {
		this.items.delete(key);
	}
	setItem(key: string, value: string): void {
		this.items.set(key, String(value));
	}
}

/** Storage that fails like a browser in private mode or over quota. */
export class BrokenStorage extends MemoryStorage {
	override getItem(): string | null {
		throw new Error("SecurityError");
	}
	override setItem(): void {
		throw new Error("QuotaExceededError");
	}
	override removeItem(): void {
		throw new Error("SecurityError");
	}
}

/** Give every test in the calling file a fresh, empty localStorage. */
export function useMemoryStorage(): { storage: () => MemoryStorage } {
	let storage = new MemoryStorage();
	beforeEach(() => {
		storage = new MemoryStorage();
		vi.stubGlobal("localStorage", storage);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});
	return { storage: () => storage };
}
