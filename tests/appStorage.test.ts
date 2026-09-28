import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	clearAppData,
	readItem,
	removeItem,
	STORAGE_KEYS,
	writeItem,
} from "../src/ui/appStorage.js";
import { BrokenStorage, useMemoryStorage } from "./support/memoryStorage.js";

describe("appStorage", () => {
	const { storage } = useMemoryStorage();

	it("reads back what it wrote", () => {
		writeItem(STORAGE_KEYS.draft, "hello");
		expect(readItem(STORAGE_KEYS.draft)).toBe("hello");
		removeItem(STORAGE_KEYS.draft);
		expect(readItem(STORAGE_KEYS.draft)).toBeNull();
	});

	it("clears everything the app saves, and nothing else", () => {
		for (const key of Object.values(STORAGE_KEYS)) writeItem(key, "x");
		storage().setItem("another-app", "keep me");

		clearAppData();

		for (const key of Object.values(STORAGE_KEYS)) {
			expect(readItem(key)).toBeNull();
		}
		expect(storage().getItem("another-app")).toBe("keep me");
	});

	it("keeps working when the browser blocks storage", () => {
		vi.stubGlobal("localStorage", new BrokenStorage());
		expect(readItem(STORAGE_KEYS.draft)).toBeNull();
		expect(() => writeItem(STORAGE_KEYS.draft, "x")).not.toThrow();
		expect(() => removeItem(STORAGE_KEYS.draft)).not.toThrow();
		expect(() => clearAppData()).not.toThrow();
	});
});

/** Source code with // line comments and /* block comments *\/ removed. */
function withoutComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("single place for browser storage", () => {
	function sourceFiles(dir: string): string[] {
		return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
			const path = join(dir, entry.name);
			return entry.isDirectory() ? sourceFiles(path) : [path];
		});
	}

	it("only src/ui/appStorage.ts touches localStorage", () => {
		const offenders = sourceFiles("src")
			.filter((file) => file.endsWith(".ts"))
			.filter((file) => file !== join("src", "ui", "appStorage.ts"))
			// Any use of the name in code: property access, optional chaining,
			// aliasing (const ls = localStorage), passing it around. Comments
			// may mention it, so they are removed first.
			.filter((file) =>
				/\blocalStorage\b/.test(withoutComments(readFileSync(file, "utf8"))),
			);
		expect(offenders).toEqual([]);
	});
});
