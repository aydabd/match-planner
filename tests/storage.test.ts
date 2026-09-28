import { describe, expect, it } from "vitest";
import {
	newRoster,
	parseRosterFile,
	rosterToJson,
	StorageError,
	squadFile,
} from "../src/core/storage.js";

/** The problem code a squad file is rejected with. */
function problemOf(data: unknown): string | undefined {
	try {
		parseRosterFile(data);
	} catch (err) {
		if (err instanceof StorageError) return err.problem.code;
		throw err;
	}
	return undefined;
}

const validPlayers = [
	{ id: "p1", name: "Liam P" },
	{ id: "p2", name: "Christos" },
];

describe("newRoster / rosterToJson / parseRosterFile round trip", () => {
	it("round-trips a roster through JSON without loss", () => {
		const roster = newRoster({
			formatId: "7v7:2-3-1",
			rotationSeconds: 600,
			players: validPlayers,
		});
		const json = rosterToJson(roster);
		const parsed = parseRosterFile(JSON.parse(json));
		expect(parsed).toEqual(roster);
	});
});

describe("parseRosterFile - rejects malformed or hostile input", () => {
	it("rejects non-objects", () => {
		expect(() => parseRosterFile("just a string")).toThrow(StorageError);
		expect(() => parseRosterFile(null)).toThrow(StorageError);
		expect(() => parseRosterFile(42)).toThrow(StorageError);
	});

	it("rejects an unknown or missing schemaVersion", () => {
		expect(
			problemOf({
				schemaVersion: 99,
				formatId: "7v7",
				rotationSeconds: 600,
				players: validPlayers,
			}),
		).toBe("schemaVersion");
		expect(() =>
			parseRosterFile({
				formatId: "7v7",
				rotationSeconds: 600,
				players: validPlayers,
			}),
		).toThrow(StorageError);
	});

	it.each([
		["7v7", "7v7:2-3-1"],
		["9v9:3-3-2", "9v9:3-3-2"],
		["11v11:4-2-1-2-1", "11v11:4-2-1-2-1"],
	])(
		"accepts the format %s (custom formations too) and stores it as %s",
		(formatId, stored) => {
			const roster = parseRosterFile({
				schemaVersion: 1,
				formatId,
				rotationSeconds: 600,
				players: validPlayers,
			});
			expect(roster.formatId).toBe(stored);
		},
	);

	it("rejects an unregistered formatId", () => {
		expect(
			problemOf({
				schemaVersion: 1,
				formatId: "13v13",
				rotationSeconds: 600,
				players: validPlayers,
			}),
		).toBe("unknownFormat");
	});

	it("rejects a formation that does not fit the team size", () => {
		expect(
			problemOf({
				schemaVersion: 1,
				formatId: "7v7:2-3-2",
				rotationSeconds: 600,
				players: validPlayers,
			}),
		).toBe("unknownFormat");
	});

	it.each([
		["under 1 minute", 30],
		["over 30 minutes", 999 * 60],
		["not whole minutes", 90],
	])("rejects minutes between swaps %s", (_, rotationSeconds) => {
		expect(() =>
			parseRosterFile({
				schemaVersion: 1,
				formatId: "7v7",
				rotationSeconds,
				players: validPlayers,
			}),
		).toThrow(StorageError);
	});

	it.each([60, 600, 1800])("accepts %i seconds between swaps", (seconds) => {
		const roster = parseRosterFile({
			schemaVersion: 1,
			formatId: "7v7",
			rotationSeconds: seconds,
			players: validPlayers,
		});
		expect(roster.rotationSeconds).toBe(seconds);
	});

	it("rejects a non-positive rotationSeconds", () => {
		expect(() =>
			parseRosterFile({
				schemaVersion: 1,
				formatId: "7v7",
				rotationSeconds: 0,
				players: validPlayers,
			}),
		).toThrow(StorageError);
		expect(() =>
			parseRosterFile({
				schemaVersion: 1,
				formatId: "7v7",
				rotationSeconds: -5,
				players: validPlayers,
			}),
		).toThrow(StorageError);
	});

	it("accepts an empty squad only when asked to (the setup draft)", () => {
		const empty = {
			schemaVersion: 1,
			formatId: "7v7",
			rotationSeconds: 600,
			players: [],
		};
		expect(() => parseRosterFile(empty)).toThrow(StorageError);
		expect(parseRosterFile(empty, { allowEmptySquad: true }).players).toEqual(
			[],
		);
	});

	it("rejects an empty squad", () => {
		expect(
			problemOf({
				schemaVersion: 1,
				formatId: "7v7",
				rotationSeconds: 600,
				players: [],
			}),
		).toBe("emptySquad");
	});

	it("rejects duplicate player ids", () => {
		expect(
			problemOf({
				schemaVersion: 1,
				formatId: "7v7",
				rotationSeconds: 600,
				players: [
					{ id: "p1", name: "A" },
					{ id: "p1", name: "B" },
				],
			}),
		).toBe("duplicateId");
	});

	it("rejects a player missing a name or id", () => {
		expect(() =>
			parseRosterFile({
				schemaVersion: 1,
				formatId: "7v7",
				rotationSeconds: 600,
				players: [{ id: "p1" }],
			}),
		).toThrow(StorageError);
		expect(() =>
			parseRosterFile({
				schemaVersion: 1,
				formatId: "7v7",
				rotationSeconds: 600,
				players: [{ name: "A" }],
			}),
		).toThrow(StorageError);
	});

	it("does not execute or interpret script-like content in a name - it stays an inert string", () => {
		const hostile = {
			schemaVersion: 1,
			formatId: "7v7",
			rotationSeconds: 600,
			players: [{ id: "p1", name: "<script>alert(1)</script>" }],
		};
		const parsed = parseRosterFile(hostile);
		expect(parsed.players[0]?.name).toBe("<script>alert(1)</script>");
		// The UI layer is responsible for rendering this via textContent, never
		// innerHTML - see src/ui/render.ts - so this string is inert HTML text.
	});

	it("truncates absurdly long names instead of rejecting them outright", () => {
		const longName = "A".repeat(500);
		const parsed = parseRosterFile({
			schemaVersion: 1,
			formatId: "7v7",
			rotationSeconds: 600,
			players: [{ id: "p1", name: longName }],
		});
		expect(parsed.players[0]?.name.length).toBeLessThanOrEqual(40);
	});
});

describe("squadFile - what the coach saves to share the team", () => {
	const SAVED_BY = {
		createdAt: "2026-09-28T10:15:00.000Z",
		createdBy: "Aydin",
		appVersion: "0.5.0",
	};

	it("holds the whole setup and is named after team size and formation", () => {
		const roster = newRoster({
			formatId: "11v11:4-2-1-2-1",
			rotationSeconds: 480,
			players: validPlayers,
		});

		const file = squadFile(roster, SAVED_BY);

		expect(file.fileName).toBe("trupp-11v11-4-2-1-2-1.json");
		expect(parseRosterFile(JSON.parse(file.json))).toEqual({
			...roster,
			audit: SAVED_BY,
		});
	});

	it("always writes the current format id, never the original 7v7 one", () => {
		const file = squadFile(
			newRoster({
				formatId: "7v7",
				rotationSeconds: 600,
				players: validPlayers,
			}),
			SAVED_BY,
		);

		expect(file.fileName).toBe("trupp-7v7-2-3-1.json");
		expect(JSON.parse(file.json).formatId).toBe("7v7:2-3-1");
	});
});

describe("squad file version 2", () => {
	const AUDIT = {
		createdAt: "2026-09-28T10:15:00.000Z",
		createdBy: "Aydin",
		appVersion: "0.5.0",
	};
	const PLAYERS = [
		{ id: "p1", name: "Alva", goalkeeper: true },
		{ id: "p2", name: "Bo", goalkeeper: false },
	];

	function file(overrides: Record<string, unknown> = {}) {
		return {
			schemaVersion: 2,
			formatId: "9v9:3-3-2",
			rotationSeconds: 480,
			periods: 3,
			periodSeconds: 1500,
			match: {
				opponent: "IFK Lund",
				venue: "Klostergården",
				date: "2026-10-04",
			},
			players: PLAYERS,
			audit: AUDIT,
			...overrides,
		};
	}

	it("keeps the whole team setup, goalkeepers and audit", () => {
		expect(parseRosterFile(file())).toEqual(file());
	});

	it("reads a version 1 file with the team size's match length and no keepers", () => {
		expect(
			parseRosterFile({
				schemaVersion: 1,
				formatId: "11v11:4-4-2",
				rotationSeconds: 600,
				players: [{ id: "p1", name: "Alva" }],
			}),
		).toEqual({
			schemaVersion: 2,
			formatId: "11v11:4-4-2",
			rotationSeconds: 600,
			periods: 2,
			periodSeconds: 2400,
			match: { opponent: "", venue: "", date: "" },
			players: [{ id: "p1", name: "Alva", goalkeeper: false }],
		});
	});

	it("does not require match details or an audit record", () => {
		const { match: _match, audit: _audit, ...rest } = file();
		expect(parseRosterFile(rest)).toMatchObject({
			match: { opponent: "", venue: "", date: "" },
		});
		expect(parseRosterFile(rest)).not.toHaveProperty("audit");
	});

	it.each([
		["too many periods", { periods: 5 }, "periods"],
		["no periods", { periods: 0 }, "periods"],
		["periods that are not whole minutes", { periodSeconds: 1530 }, "periods"],
		["periods that are too long", { periodSeconds: 60 * 60 }, "periods"],
		[
			"an opponent name that is too long",
			{ match: { opponent: "x".repeat(61), venue: "", date: "" } },
			"matchDetails",
		],
		[
			"a date that is not a date",
			{ match: { opponent: "", venue: "", date: "next Sunday" } },
			"matchDetails",
		],
		[
			"an audit time that is not a time",
			{ audit: { ...AUDIT, createdAt: "yesterday" } },
			"audit",
		],
		[
			"an audit without a version",
			{ audit: { ...AUDIT, appVersion: 3 } },
			"audit",
		],
		[
			"a goalkeeper flag that is not true or false",
			{ players: [{ id: "p1", name: "Alva", goalkeeper: "yes" }] },
			"invalidPlayer",
		],
	])("refuses %s", (_, overrides, code) => {
		expect(problemOf(file(overrides))).toBe(code);
	});

	it("measures text after trimming spaces, like player names", () => {
		const padded = `  ${"x".repeat(60)}  `;
		const roster = parseRosterFile(
			file({
				match: { opponent: padded, venue: "", date: "" },
				audit: { ...AUDIT, createdBy: `  ${"y".repeat(40)}  ` },
			}),
		);
		expect(roster.match.opponent).toBe("x".repeat(60));
		expect(roster.audit?.createdBy).toBe("y".repeat(40));
	});

	it("accepts a kickoff time as well as a date", () => {
		const withTime = file({
			match: { opponent: "", venue: "", date: "2026-10-04T10:30" },
		});
		expect(parseRosterFile(withTime).match.date).toBe("2026-10-04T10:30");
	});
});

describe("newRoster", () => {
	it("fills the team size's defaults", () => {
		expect(newRoster({ formatId: "5v5:1-2-1" })).toEqual({
			schemaVersion: 2,
			formatId: "5v5:1-2-1",
			rotationSeconds: 300,
			periods: 3,
			periodSeconds: 900,
			match: { opponent: "", venue: "", date: "" },
			players: [],
		});
	});
});

describe("squadFile audit", () => {
	it("records who saved the file, when, and with which app version", () => {
		const roster = newRoster({ formatId: "7v7:2-3-1", players: validPlayers });
		const audit = {
			createdAt: "2026-09-28T10:15:00.000Z",
			createdBy: "Aydin",
			appVersion: "0.5.0",
		};

		const saved = JSON.parse(squadFile(roster, audit).json);

		expect(saved.audit).toEqual(audit);
		expect(saved.schemaVersion).toBe(2);
	});
});
