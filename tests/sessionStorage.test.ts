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

/** A match saved by the app before periods existed (session version 1). */
const VERSION_1 = {
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
};

describe("match session storage", () => {
	const { storage } = useMemoryStorage();

	it("resumes a match saved before periods existed, in period 1 of the team size's match", () => {
		storage().setItem(key(), JSON.stringify(VERSION_1));

		expect(loadSession()).toEqual(
			session({
				formatId: "7v7",
				plan: { periods: 3, periodSeconds: 1200, rotationSeconds: 600 },
				clock: {
					phase: "playing",
					period: 1,
					periodElapsed: 42,
					rotationElapsed: 42,
				},
				match: { opponent: "", venue: "", date: "" },
			}),
		);
	});

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
