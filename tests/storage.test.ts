import { describe, expect, it } from "vitest";
import {
	parseRosterFile,
	rosterToJson,
	StorageError,
	serializeRoster,
	squadFile,
} from "../src/core/storage.js";

const validPlayers = [
	{ id: "p1", name: "Liam P" },
	{ id: "p2", name: "Christos" },
];

describe("serializeRoster / rosterToJson / parseRosterFile round trip", () => {
	it("round-trips a roster through JSON without loss", () => {
		const roster = serializeRoster("7v7:2-3-1", 600, validPlayers);
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
		expect(() =>
			parseRosterFile({
				schemaVersion: 99,
				formatId: "7v7",
				rotationSeconds: 600,
				players: validPlayers,
			}),
		).toThrow(/schemaVersion/);
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
		expect(() =>
			parseRosterFile({
				schemaVersion: 1,
				formatId: "13v13",
				rotationSeconds: 600,
				players: validPlayers,
			}),
		).toThrow(/formatId/);
	});

	it("rejects a formation that does not fit the team size", () => {
		expect(() =>
			parseRosterFile({
				schemaVersion: 1,
				formatId: "7v7:2-3-2",
				rotationSeconds: 600,
				players: validPlayers,
			}),
		).toThrow(/formatId/);
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
		expect(() =>
			parseRosterFile({
				schemaVersion: 1,
				formatId: "7v7",
				rotationSeconds: 600,
				players: [],
			}),
		).toThrow(/tom/);
	});

	it("rejects duplicate player ids", () => {
		expect(() =>
			parseRosterFile({
				schemaVersion: 1,
				formatId: "7v7",
				rotationSeconds: 600,
				players: [
					{ id: "p1", name: "A" },
					{ id: "p1", name: "B" },
				],
			}),
		).toThrow(/Dubblett/);
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
	it("holds the whole setup and is named after team size and formation", () => {
		const roster = serializeRoster("11v11:4-2-1-2-1", 480, validPlayers);

		const file = squadFile(roster);

		expect(file.fileName).toBe("trupp-11v11-4-2-1-2-1.json");
		expect(parseRosterFile(JSON.parse(file.json))).toEqual(roster);
	});

	it("always writes the current format id, never the original 7v7 one", () => {
		const file = squadFile(serializeRoster("7v7", 600, validPlayers));

		expect(file.fileName).toBe("trupp-7v7-2-3-1.json");
		expect(JSON.parse(file.json).formatId).toBe("7v7:2-3-1");
	});
});
