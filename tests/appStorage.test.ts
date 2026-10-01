import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	cacheName,
	clearAppData,
	isOwnCache,
	readItem,
	removeItem,
	STORAGE_KEYS,
	teamScoped,
	writeItem,
} from "../src/ui/appStorage.js";
import { BrokenStorage, useMemoryStorage } from "./support/memoryStorage.js";

const TEAM_SCOPED_KEYS = [
	STORAGE_KEYS.draft,
	STORAGE_KEYS.session,
	STORAGE_KEYS.reports,
	STORAGE_KEYS.matches,
	STORAGE_KEYS.playerNotes,
	STORAGE_KEYS.driveFolderId,
	STORAGE_KEYS.driveFolderName,
];

describe("appStorage", () => {
	const { storage } = useMemoryStorage();

	it("reads back what it wrote", () => {
		writeItem(STORAGE_KEYS.draft, "hello");
		expect(readItem(STORAGE_KEYS.draft)).toBe("hello");
		removeItem(STORAGE_KEYS.draft);
		expect(readItem(STORAGE_KEYS.draft)).toBeNull();
	});

	it("scopes a key to a team by suffixing it with the team id", () => {
		expect(teamScoped(STORAGE_KEYS.matches, "t1")).toBe(
			"matchplanner:matches:v1:t1",
		);
	});

	it("clears every team's scoped data, the coach name and the teams list, and nothing else", () => {
		writeItem(STORAGE_KEYS.coachName, "x");
		for (const teamId of ["t1", "t2"]) {
			for (const key of TEAM_SCOPED_KEYS) {
				writeItem(teamScoped(key, teamId), "x");
			}
		}
		writeItem(STORAGE_KEYS.teams, "x");
		storage().setItem("another-app", "keep me");

		clearAppData(["t1", "t2"]);

		expect(readItem(STORAGE_KEYS.coachName)).toBeNull();
		expect(readItem(STORAGE_KEYS.teams)).toBeNull();
		for (const teamId of ["t1", "t2"]) {
			for (const key of TEAM_SCOPED_KEYS) {
				expect(readItem(teamScoped(key, teamId))).toBeNull();
			}
		}
		expect(storage().getItem("another-app")).toBe("keep me");
	});

	it("leaves a team's data alone when it is not in the given team ids", () => {
		writeItem(teamScoped(STORAGE_KEYS.matches, "t1"), "keep me");
		clearAppData(["t2"]);
		expect(readItem(teamScoped(STORAGE_KEYS.matches, "t1"))).toBe("keep me");
	});

	it("keeps working when the browser blocks storage", () => {
		vi.stubGlobal("localStorage", new BrokenStorage());
		expect(readItem(STORAGE_KEYS.draft)).toBeNull();
		expect(() => writeItem(STORAGE_KEYS.draft, "x")).not.toThrow();
		expect(() => removeItem(STORAGE_KEYS.draft)).not.toThrow();
		expect(() => clearAppData(["t1"])).not.toThrow();
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

describe("offline cache names", () => {
	it("are named after the app version", () => {
		expect(cacheName("0.4.0")).toBe("matchplanner-v0.4.0");
	});

	it.each([
		["matchplanner-v0.4.0", true],
		["matchplanner-v0.3.1", true],
		["fotbollsbyten-v1", true],
		["another-app-cache", false],
		["matchplanner", false],
	])("%s belongs to this app: %s", (name, own) => {
		expect(isOwnCache(name)).toBe(own);
	});
});
