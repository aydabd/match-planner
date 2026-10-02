import { describe, expect, it } from "vitest";
import { collectTeams, describeData } from "../src/core/importCollect.js";
import { classifyFiles } from "../src/core/importPlan.js";
import type { Opened } from "../src/core/importUnlock.js";
import {
	EMPTY_PLAYER_NOTES_FILE,
	withDevelopment,
} from "../src/core/playerNotes.js";
import { newRoster } from "../src/core/storage.js";
import { makeMatchFile } from "./support/matchFiles.js";

const TEAM_A = "11111111-1111-4111-8111-111111111111";
const TEAM_B = "22222222-2222-4222-8222-222222222222";
const note = (text: string) =>
	withDevelopment(EMPTY_PLAYER_NOTES_FILE, "alva", {
		date: "2026-09-01",
		area: "physical",
		note: text,
	});
const squad = () =>
	newRoster({ formatId: "7v7", players: [{ id: "p1", name: "Alva" }] });
const plain = (value: unknown, path: string) =>
	classifyFiles([{ path, text: JSON.stringify(value) }]).files[0];
const payload = (p: object, path = "x.json"): Opened => ({
	path,
	kind: "payload",
	payload: { schemaVersion: 1, ...p } as never,
});

describe("collectTeams", () => {
	it("puts plain files and export bundles in one team-less group", () => {
		const files = [
			plain(makeMatchFile({ matchId: "m1" }), "a.json"),
			plain(squad(), "b.json"),
			plain(note("a"), "c.json"),
		].flatMap((f) => (f ? [f] : []));
		const bundle: Opened = {
			path: "e.json",
			kind: "bundle",
			bundle: {
				schemaVersion: 1,
				roster: squad(),
				matches: [makeMatchFile({ matchId: "m2", seed: 2 })],
				playerNotes: note("b"),
			},
		};
		const [group, ...rest] = collectTeams(files, [bundle]);
		expect(rest).toEqual([]);
		expect(group?.teamId).toBeNull();
		expect(group?.data.matches.map((m) => m.audit.matchId).sort()).toEqual([
			"m1",
			"m2",
		]);
		expect(group?.data.squads).toHaveLength(2);
		expect(group?.data.notes).toHaveLength(2);
	});

	it("leaves out an empty squad in a bundle", () => {
		const bundle: Opened = {
			path: "e.json",
			kind: "bundle",
			bundle: {
				schemaVersion: 1,
				roster: newRoster({ formatId: "7v7" }),
				matches: [],
				playerNotes: EMPTY_PLAYER_NOTES_FILE,
			},
		};
		expect(collectTeams([], [bundle])).toEqual([]);
	});

	it("groups Drive-format payloads by team, with the marker's name", () => {
		const m = makeMatchFile({ matchId: "m1" });
		const groups = collectTeams(
			[],
			[
				payload({ kind: "match", teamId: TEAM_B, match: m }),
				payload({ kind: "team", teamId: TEAM_A, teamName: "Lag A" }),
				payload({
					kind: "notes",
					teamId: TEAM_A,
					deviceId: "d",
					playerNotes: note("a"),
				}),
				payload({
					kind: "squad",
					teamId: TEAM_A,
					deviceId: "d",
					roster: squad(),
				}),
			],
		);
		expect(groups.map((g) => [g.teamId, g.name])).toEqual([
			[TEAM_A, "Lag A"],
			[TEAM_B, ""],
		]);
		expect(describeData(groups[0]?.data ?? emptyData())).toEqual({
			matches: 0,
			squads: 1,
			notePlayers: 1,
		});
		expect(groups[1]?.data.matches).toHaveLength(1);
	});
});

function emptyData() {
	return { matches: [], notes: [], squads: [] };
}

describe("describeData", () => {
	it("counts matches once per id and note players once per player", () => {
		const m = makeMatchFile({ matchId: "same" });
		expect(
			describeData({
				matches: [m, m],
				notes: [note("a"), note("b")],
				squads: [],
			}),
		).toEqual({ matches: 1, squads: 0, notePlayers: 1 });
	});
});
