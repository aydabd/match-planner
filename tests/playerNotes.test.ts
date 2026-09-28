import { describe, expect, it } from "vitest";
import { buildHistory } from "../src/core/history.js";
import {
	EMPTY_PLAYER_NOTES_FILE,
	PlayerNotesError,
	parsePlayerNotesFile,
	playerNotesFileToJson,
	seasonFeedback,
	withAvailability,
	withDevelopment,
} from "../src/core/playerNotes.js";
import { makeMatchFile, NAMES } from "./support/matchFiles.js";

describe("PlayerNotesFile - parsing and round trip", () => {
	it("round-trips an empty file through JSON", () => {
		expect(
			parsePlayerNotesFile(
				JSON.parse(playerNotesFileToJson(EMPTY_PLAYER_NOTES_FILE)),
			),
		).toEqual(EMPTY_PLAYER_NOTES_FILE);
	});

	it("round-trips a file with availability and development entries", () => {
		const withAvail = withAvailability(EMPTY_PLAYER_NOTES_FILE, "alva", {
			matchId: "m1",
			status: "absent",
			reason: "injury",
			note: "Vrickad fotled",
		});
		const withBoth = withDevelopment(withAvail, "alva", {
			date: "2026-09-05",
			area: "physical",
			note: "Snabbare i vändningar",
		});
		expect(
			parsePlayerNotesFile(JSON.parse(playerNotesFileToJson(withBoth))),
		).toEqual(withBoth);
	});

	it.each([
		["not an object", "just a string"],
		["null", null],
		["the wrong schema version", { schemaVersion: 99, players: [] }],
		["players that is not a list", { schemaVersion: 1, players: {} }],
		[
			"an availability entry with no matchId",
			{
				schemaVersion: 1,
				players: [
					{ key: "a", availability: [{ status: "absent" }], development: [] },
				],
			},
		],
		[
			"an availability status that is not available or absent",
			{
				schemaVersion: 1,
				players: [
					{
						key: "a",
						availability: [{ matchId: "m1", status: "hurt" }],
						development: [],
					},
				],
			},
		],
		[
			"an absence reason that is not recognised",
			{
				schemaVersion: 1,
				players: [
					{
						key: "a",
						availability: [
							{ matchId: "m1", status: "absent", reason: "laziness" },
						],
						development: [],
					},
				],
			},
		],
		[
			"an availability note that is not a string",
			{
				schemaVersion: 1,
				players: [
					{
						key: "a",
						availability: [{ matchId: "m1", status: "available", note: 5 }],
						development: [],
					},
				],
			},
		],
		[
			"a player entry with no key",
			{
				schemaVersion: 1,
				players: [{ availability: [], development: [] }],
			},
		],
		[
			"a player entry whose availability is not a list",
			{
				schemaVersion: 1,
				players: [{ key: "a", availability: {}, development: [] }],
			},
		],
		[
			"a development entry with no date",
			{
				schemaVersion: 1,
				players: [
					{
						key: "a",
						availability: [],
						development: [{ area: "physical", note: "x" }],
					},
				],
			},
		],
		[
			"a development date that Date.parse would accept but isn't YYYY-MM-DD",
			{
				schemaVersion: 1,
				players: [
					{
						key: "a",
						availability: [],
						development: [
							{ date: "September 5, 2026", area: "physical", note: "x" },
						],
					},
				],
			},
		],
		[
			"a development area that is not recognised",
			{
				schemaVersion: 1,
				players: [
					{
						key: "a",
						availability: [],
						development: [{ date: "2026-09-05", area: "spiritual", note: "x" }],
					},
				],
			},
		],
	])("rejects %s", (_, raw) => {
		expect(() => parsePlayerNotesFile(raw)).toThrow(PlayerNotesError);
	});
});

describe("withAvailability - recording one match's availability", () => {
	it("adds a player who has no notes yet", () => {
		const file = withAvailability(EMPTY_PLAYER_NOTES_FILE, "alva", {
			matchId: "m1",
			status: "available",
		});
		expect(file.players).toEqual([
			{
				key: "alva",
				availability: [{ matchId: "m1", status: "available" }],
				development: [],
			},
		]);
	});

	it("replaces the entry for the same match instead of duplicating it", () => {
		const first = withAvailability(EMPTY_PLAYER_NOTES_FILE, "alva", {
			matchId: "m1",
			status: "available",
		});
		const second = withAvailability(first, "alva", {
			matchId: "m1",
			status: "absent",
			reason: "illness",
		});
		expect(second.players[0]?.availability).toEqual([
			{ matchId: "m1", status: "absent", reason: "illness" },
		]);
	});

	it("truncates an absurdly long note instead of rejecting it", () => {
		const file = withAvailability(EMPTY_PLAYER_NOTES_FILE, "alva", {
			matchId: "m1",
			status: "absent",
			reason: "other",
			note: "x".repeat(1000),
		});
		expect(file.players[0]?.availability[0]?.note?.length).toBeLessThanOrEqual(
			500,
		);
	});

	it("does not mutate the file it was given", () => {
		withAvailability(EMPTY_PLAYER_NOTES_FILE, "alva", {
			matchId: "m1",
			status: "available",
		});
		expect(EMPTY_PLAYER_NOTES_FILE.players).toEqual([]);
	});
});

describe("withDevelopment - recording a development note", () => {
	it("adds a note for a player who has no notes yet", () => {
		const file = withDevelopment(EMPTY_PLAYER_NOTES_FILE, "alva", {
			date: "2026-09-05",
			area: "mental",
			note: "Tar mer plats i omklädningsrummet",
		});
		expect(file.players[0]?.development).toEqual([
			{
				date: "2026-09-05",
				area: "mental",
				note: "Tar mer plats i omklädningsrummet",
			},
		]);
	});

	it("keeps only the newest LIMITS.developmentNotesPerPlayer notes", () => {
		let file = EMPTY_PLAYER_NOTES_FILE;
		for (let i = 0; i < 201; i++) {
			file = withDevelopment(file, "alva", {
				date: "2026-09-05",
				area: "physical",
				note: `note-${i}`,
			});
		}
		const notes = file.players[0]?.development ?? [];
		expect(notes).toHaveLength(200);
		expect(notes[0]?.note).toBe("note-1");
		expect(notes[199]?.note).toBe("note-200");
	});
});

describe("seasonFeedback - blind-spot flags from history and notes", () => {
	// The same 9 players in every match, so everyone's squadMatches equals
	// the match count - no randomness to make the threshold flaky.
	const SQUAD = NAMES.slice(0, 9);

	function season(count: number, seed = 200) {
		return Array.from({ length: count }, (_, i) =>
			makeMatchFile({
				matchId: `m${i}`,
				seed: seed + i,
				date: `2026-${String(3 + (i % 6)).padStart(2, "0")}-10`,
				names: SQUAD,
			}),
		);
	}

	it("flags a player with an absence that was never explained", () => {
		const history = buildHistory(season(1));
		const file = withAvailability(EMPTY_PLAYER_NOTES_FILE, "alva", {
			matchId: "m0",
			status: "absent",
		});
		const feedback = seasonFeedback(history, file);
		expect(feedback).toContainEqual({
			code: "unexplainedAbsences",
			playerId: "alva",
			count: 1,
		});
	});

	it("does not flag an absence with a reason given", () => {
		const history = buildHistory(season(1));
		const file = withAvailability(EMPTY_PLAYER_NOTES_FILE, "alva", {
			matchId: "m0",
			status: "absent",
			reason: "injury",
		});
		expect(seasonFeedback(history, file)).not.toContainEqual(
			expect.objectContaining({ code: "unexplainedAbsences" }),
		);
	});

	it("flags a player who has been in every squad but has no development notes", () => {
		const history = buildHistory(season(10));
		const feedback = seasonFeedback(history, EMPTY_PLAYER_NOTES_FILE);
		const withNoNotes = feedback.filter((f) => f.code === "noDevelopmentNotes");
		expect(withNoNotes.length).toBe(history.players.length);
	});

	it("does not flag a player who has at least one development note", () => {
		const history = buildHistory(season(10));
		const someKey = history.players[0]?.key as string;
		const file = withDevelopment(EMPTY_PLAYER_NOTES_FILE, someKey, {
			date: "2026-09-05",
			area: "technical",
			note: "Bra passningar",
		});
		const feedback = seasonFeedback(history, file);
		expect(feedback).not.toContainEqual(
			expect.objectContaining({
				code: "noDevelopmentNotes",
				playerId: someKey,
			}),
		);
	});
});
