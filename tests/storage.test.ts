import { describe, expect, it } from "vitest";
import {
	parseRosterFile,
	rosterToJson,
	StorageError,
	serializeRoster,
} from "../src/core/storage.js";

const validPlayers = [
	{ id: "p1", name: "Liam P" },
	{ id: "p2", name: "Christos" },
];

describe("serializeRoster / rosterToJson / parseRosterFile round trip", () => {
	it("round-trips a roster through JSON without loss", () => {
		const roster = serializeRoster("7v7", 600, validPlayers);
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
