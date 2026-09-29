import { describe, expect, it } from "vitest";
import { buildHistory } from "../src/core/history.js";
import {
	EMPTY_PLAYER_NOTES_FILE,
	PlayerNotesError,
	parsePlayerNotesFile,
	playerNotesFileToJson,
	seasonFeedback,
	withAvailability,
	withCheckpoint,
	withDevelopment,
} from "../src/core/playerNotes.js";
import { makeMatchFile, NAMES, playerIdMapFor } from "./support/matchFiles.js";

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

	it("round-trips a file with a checkpoint entry", () => {
		const withCp = withCheckpoint(
			EMPTY_PLAYER_NOTES_FILE,
			"alva",
			"technical",
			1,
			"2026-09-05",
		);
		expect(
			parsePlayerNotesFile(JSON.parse(playerNotesFileToJson(withCp))),
		).toEqual(withCp);
	});

	it("defaults checkpoints to an empty list for a file saved before #109", () => {
		expect(
			parsePlayerNotesFile({
				schemaVersion: 1,
				players: [{ key: "a", availability: [], development: [] }],
			}),
		).toEqual({
			schemaVersion: 1,
			players: [
				{ key: "a", availability: [], development: [], checkpoints: [] },
			],
		});
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
		[
			"a checkpoint with an area that is not recognised",
			{
				schemaVersion: 1,
				players: [
					{
						key: "a",
						availability: [],
						development: [],
						checkpoints: [{ area: "spiritual", level: 1, date: "2026-09-05" }],
					},
				],
			},
		],
		[
			"checkpoints that is not a list",
			{
				schemaVersion: 1,
				players: [
					{ key: "a", availability: [], development: [], checkpoints: {} },
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
				checkpoints: [],
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

describe("withCheckpoint - marking a development level reached", () => {
	it("adds a level for a player who has no notes yet", () => {
		const file = withCheckpoint(
			EMPTY_PLAYER_NOTES_FILE,
			"alva",
			"technical",
			1,
			"2026-09-05",
		);
		expect(file.players[0]?.checkpoints).toEqual([
			{ area: "technical", level: 1, date: "2026-09-05" },
		]);
	});

	it("keeps other areas and levels untouched", () => {
		const first = withCheckpoint(
			EMPTY_PLAYER_NOTES_FILE,
			"alva",
			"technical",
			1,
			"2026-01-01",
		);
		const second = withCheckpoint(first, "alva", "mental", 1, "2026-02-01");
		expect(second.players[0]?.checkpoints).toEqual([
			{ area: "technical", level: 1, date: "2026-01-01" },
			{ area: "mental", level: 1, date: "2026-02-01" },
		]);
	});

	it("does not mutate the file it was given", () => {
		withCheckpoint(
			EMPTY_PLAYER_NOTES_FILE,
			"alva",
			"technical",
			1,
			"2026-09-05",
		);
		expect(EMPTY_PLAYER_NOTES_FILE.players).toEqual([]);
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

	it("flags a player with an absence that was never explained", async () => {
		const files = season(1);
		const history = buildHistory(files, await playerIdMapFor(files));
		const alvaKey = history.players.find((p) => p.name === "Alva")
			?.key as string;
		const file = withAvailability(EMPTY_PLAYER_NOTES_FILE, alvaKey, {
			matchId: "m0",
			status: "absent",
		});
		const feedback = seasonFeedback(history, file);
		expect(feedback).toContainEqual({
			code: "unexplainedAbsences",
			playerId: alvaKey,
			count: 1,
		});
	});

	it("does not flag an absence with a reason given", async () => {
		const files = season(1);
		const history = buildHistory(files, await playerIdMapFor(files));
		const alvaKey = history.players.find((p) => p.name === "Alva")
			?.key as string;
		const file = withAvailability(EMPTY_PLAYER_NOTES_FILE, alvaKey, {
			matchId: "m0",
			status: "absent",
			reason: "injury",
		});
		expect(seasonFeedback(history, file)).not.toContainEqual(
			expect.objectContaining({ code: "unexplainedAbsences" }),
		);
	});

	it("flags a player who has been in every squad but has no development notes", async () => {
		const files = season(10);
		const history = buildHistory(files, await playerIdMapFor(files));
		const feedback = seasonFeedback(history, EMPTY_PLAYER_NOTES_FILE);
		const withNoNotes = feedback.filter((f) => f.code === "noDevelopmentNotes");
		expect(withNoNotes.length).toBe(history.players.length);
	});

	it("does not flag a player who has at least one development note", async () => {
		const files = season(10);
		const history = buildHistory(files, await playerIdMapFor(files));
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
