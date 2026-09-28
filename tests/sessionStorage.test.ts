import { describe, expect, it, vi } from "vitest";
import {
	clearSession,
	loadSession,
	type MatchSession,
	saveSession,
} from "../src/ui/sessionStorage.js";
import { BrokenStorage, useMemoryStorage } from "./support/memoryStorage.js";

const KEY = "matchplanner:session:v1";

function session(overrides: Partial<MatchSession> = {}): MatchSession {
	return {
		schemaVersion: 1,
		formatId: "7v7",
		rotationSeconds: 600,
		playerNames: { p1: "Alva" },
		schedulerPlayers: {
			p1: {
				id: "p1",
				totalSeconds: 42,
				zonesPlayed: ["mid"],
				unavailable: false,
			},
		},
		schedulerOrder: ["p1"],
		rotationIndex: 2,
		elapsedSeconds: 42,
		currentAssignment: { zones: { mid: ["p1"] }, bench: [] },
		tempSwaps: [],
		...overrides,
	};
}

describe("match session storage", () => {
	const { storage } = useMemoryStorage();

	it("returns nothing when no match has been saved", () => {
		expect(loadSession()).toBeNull();
	});

	it("restores a saved match exactly", () => {
		saveSession(session());
		expect(loadSession()).toEqual(session());
	});

	it("forgets the match after clearing", () => {
		saveSession(session());
		clearSession();
		expect(loadSession()).toBeNull();
		expect(storage().getItem(KEY)).toBeNull();
	});

	it.each([
		["corrupted JSON", "{not json"],
		["a non-object", "42"],
		["null", "null"],
		["an unknown schema version", JSON.stringify({ schemaVersion: 2 })],
		["a missing schema version", JSON.stringify({ formatId: "7v7" })],
	])("ignores %s instead of crashing", (_, raw) => {
		storage().setItem(KEY, raw);
		expect(loadSession()).toBeNull();
	});

	it("keeps working when the browser blocks storage", () => {
		vi.stubGlobal("localStorage", new BrokenStorage());
		expect(() => saveSession(session())).not.toThrow();
		expect(loadSession()).toBeNull();
		expect(() => clearSession()).not.toThrow();
	});
});
