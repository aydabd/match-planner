import { describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS, teamScoped } from "../src/ui/appStorage.js";
import {
	clearSession,
	loadSession,
	type MatchSession,
	saveSession,
} from "../src/ui/sessionStorage.js";
import { activeTeamId } from "../src/ui/teamStorage.js";
import { BrokenStorage, useMemoryStorage } from "./support/memoryStorage.js";

const key = () => teamScoped(STORAGE_KEYS.session, activeTeamId());

function session(overrides: Partial<MatchSession> = {}): MatchSession {
	return {
		schemaVersion: 2,
		formatId: "7v7:2-3-1",
		plan: { periods: 3, periodSeconds: 1200, rotationSeconds: 600 },
		clock: {
			phase: "playing",
			period: 2,
			periodElapsed: 42,
			rotationElapsed: 42,
		},
		match: { opponent: "IFK Lund", venue: "", date: "" },
		substitutions: { kind: "free" },
		playerNames: { p1: "Alva" },
		schedulerPlayers: {
			p1: {
				id: "p1",
				totalSeconds: 42,
				zonesPlayed: ["mid"],
				loadInARow: 0,
				unavailable: false,
			},
		},
		schedulerOrder: ["p1"],
		keeperId: null,
		goalkeepers: [],
		timeline: [],
		pendingSwap: null,
		rotationIndex: 2,
		currentAssignment: { zones: { mid: ["p1"] }, bench: [] },
		tempSwaps: [],
		...overrides,
	};
}

describe("match session storage", () => {
	const { storage } = useMemoryStorage();

	it("drops a match saved before periods existed instead of guessing its plan", () => {
		storage().setItem(
			key(),
			JSON.stringify({
				schemaVersion: 1,
				formatId: "7v7",
				rotationSeconds: 600,
			}),
		);
		expect(loadSession()).toBeNull();
	});

	it("returns nothing when no match has been saved", () => {
		expect(loadSession()).toBeNull();
	});

	it("restores a saved match exactly", () => {
		saveSession(session());
		expect(loadSession()).toEqual(session());
	});

	it("treats a match saved without a load in a row as rested", () => {
		const old = JSON.parse(JSON.stringify(session()));
		delete old.schedulerPlayers.p1.loadInARow;
		storage().setItem(key(), JSON.stringify(old));
		expect(loadSession()?.schedulerPlayers.p1?.loadInARow).toBe(0);
	});

	it.each([
		["-5", "a negative number"],
		['"much"', "text"],
		["null", "null"],
		// JSON has no Infinity, but a number too large to hold reads as one.
		["1e999", "a number too large to hold"],
	])("drops a match whose load in a row is %s (%s)", (bad) => {
		const damaged = JSON.stringify(session()).replace(
			'"loadInARow":0',
			`"loadInARow":${bad}`,
		);
		expect(damaged).toContain(`"loadInARow":${bad}`);
		storage().setItem(key(), damaged);
		expect(loadSession()).toBeNull();
	});

	it("forgets the match after clearing", () => {
		saveSession(session());
		clearSession();
		expect(loadSession()).toBeNull();
		expect(storage().getItem(key())).toBeNull();
	});

	it.each([
		["corrupted JSON", "{not json"],
		["a non-object", "42"],
		["null", "null"],
		["an unknown schema version", JSON.stringify({ schemaVersion: 99 })],
		[
			"a version 2 session without its clock",
			JSON.stringify({ schemaVersion: 2, formatId: "7v7:2-3-1" }),
		],
		["a missing schema version", JSON.stringify({ formatId: "7v7" })],
		[
			"a version 2 session without a format",
			JSON.stringify({ ...session(), formatId: undefined }),
		],
		[
			"a version 2 session with an unknown format",
			JSON.stringify(session({ formatId: "13v13:1-1" })),
		],
		[
			"a version 2 session whose plan has no swap interval",
			JSON.stringify(
				session({ plan: { periods: 3, periodSeconds: 1200 } as never }),
			),
		],
		[
			"a version 2 session whose clock has an unknown phase",
			JSON.stringify(
				session({ clock: { ...session().clock, phase: "halftime" as never } }),
			),
		],
		[
			"a session without substitution rules",
			JSON.stringify({ ...session(), substitutions: undefined }),
		],
		[
			"a session with unknown substitution rules",
			JSON.stringify(session({ substitutions: { kind: "flying" } as never })),
		],
		[
			"a version 2 session without its players",
			JSON.stringify({ ...session(), schedulerOrder: undefined }),
		],
	])("ignores %s instead of crashing", (_, raw) => {
		storage().setItem(key(), raw);
		expect(loadSession()).toBeNull();
	});

	it("keeps working when the browser blocks storage", () => {
		vi.stubGlobal("localStorage", new BrokenStorage());
		expect(() => saveSession(session())).not.toThrow();
		expect(loadSession()).toBeNull();
		expect(() => clearSession()).not.toThrow();
	});
});
