import { describe, expect, it } from "vitest";
import { LIMITS } from "../src/core/limits.js";
import { EMPTY_PLAYER_NOTES_FILE } from "../src/core/playerNotes.js";
import { encryptJson, securePackageToJson } from "../src/core/securePackage.js";
import { readSquadFile, squadFromPackage } from "../src/core/squadImport.js";
import { newRoster } from "../src/core/storage.js";
import { makeMatchFile } from "./support/matchFiles.js";

const squad = () =>
	newRoster({ formatId: "7v7:2-3-1", players: [{ id: "p1", name: "Alva" }] });
const file = (value: unknown, path = "x.json") => ({
	path,
	text: JSON.stringify(value),
});
const TEAM = "123e4567-e89b-42d3-a456-426614174000";

describe("readSquadFile - the start page's Hämta trupp", () => {
	it("takes the squad from a squad file, whatever it is called", () => {
		expect(readSquadFile(file(squad(), "match-1.json"))).toEqual({
			kind: "squad",
			roster: squad(),
		});
	});

	it("says a match file or a notes file has no squad", () => {
		expect(readSquadFile(file(makeMatchFile()))).toEqual({ kind: "noSquad" });
		expect(readSquadFile(file(EMPTY_PLAYER_NOTES_FILE))).toEqual({
			kind: "noSquad",
		});
	});

	it("asks for a password for an encrypted file", async () => {
		const text = securePackageToJson(await encryptJson("hemligt-losen", {}));
		expect(readSquadFile({ path: "e.json", text })).toEqual({
			kind: "needsPassword",
		});
	});

	it("says why a squad file is not usable when the squad itself is wrong", () => {
		const empty = newRoster({ formatId: "7v7" });
		expect(readSquadFile(file(empty))).toEqual({
			kind: "refused",
			problem: { code: "emptySquad" },
		});
		const many = newRoster({
			formatId: "7v7",
			players: Array.from({ length: LIMITS.squadSize + 1 }, (_, i) => ({
				id: `p${i}`,
				name: `Spelare ${i}`,
			})),
		});
		expect(readSquadFile(file(many))).toEqual({
			kind: "refused",
			problem: { code: "tooManyPlayers", max: LIMITS.squadSize },
		});
	});

	it("calls text that is not JSON, or JSON that is none of ours, unreadable", () => {
		expect(readSquadFile({ path: "a.txt", text: "hej" })).toEqual({
			kind: "refused",
			problem: "unreadable",
		});
		expect(readSquadFile(file({ hej: 1 }))).toEqual({
			kind: "refused",
			problem: "unreadable",
		});
	});

	it("refuses a file over the size cap", () => {
		expect(
			readSquadFile({
				path: "big.json",
				text: `"${"a".repeat(LIMITS.importFileBytes)}"`,
			}),
		).toEqual({ kind: "refused", problem: "tooLarge" });
	});
});

describe("squadFromPackage", () => {
	const PASSWORD = "hemligt-losen";
	const pkg = async (data: unknown) => ({
		path: "e.json",
		text: securePackageToJson(await encryptJson(PASSWORD, data)),
		teamIdHint: null,
	});

	it("takes the squad from an encrypted export", async () => {
		const bundle = {
			schemaVersion: 1,
			roster: squad(),
			matches: [],
			playerNotes: EMPTY_PLAYER_NOTES_FILE,
		};
		expect(await squadFromPackage(await pkg(bundle), PASSWORD)).toEqual({
			kind: "squad",
			roster: squad(),
		});
	});

	it("says an export with no squad has none", async () => {
		const bundle = {
			schemaVersion: 1,
			roster: newRoster({ formatId: "7v7" }),
			matches: [],
			playerNotes: EMPTY_PLAYER_NOTES_FILE,
		};
		expect(await squadFromPackage(await pkg(bundle), PASSWORD)).toEqual({
			kind: "noSquad",
		});
	});

	it("takes the squad of a Drive-format squad file", async () => {
		const name = await import("../src/core/driveNames.js").then((m) =>
			m.driveFileName("squad", TEAM, "d1"),
		);
		const payload = {
			schemaVersion: 1,
			kind: "squad",
			teamId: TEAM,
			deviceId: "d1",
			roster: squad(),
		};
		const file = { ...(await pkg(payload)), path: `team-${TEAM}/${name}` };
		expect(await squadFromPackage(file, PASSWORD)).toEqual({
			kind: "squad",
			roster: squad(),
		});
	});

	it("says a Drive-format match file has no squad", async () => {
		const name = await import("../src/core/driveNames.js").then((m) =>
			m.driveFileName("match", TEAM, "m1"),
		);
		const payload = {
			schemaVersion: 1,
			kind: "match",
			teamId: TEAM,
			match: makeMatchFile({ matchId: "m1" }),
		};
		const file = { ...(await pkg(payload)), path: name };
		expect(await squadFromPackage(file, PASSWORD)).toEqual({ kind: "noSquad" });
	});

	it("gives a wrong password as locked and a file that is no export as damaged", async () => {
		expect(await squadFromPackage(await pkg({}), "fel-losenord")).toEqual({
			kind: "locked",
		});
		expect(await squadFromPackage(await pkg({ hej: 1 }), PASSWORD)).toEqual({
			kind: "damaged",
		});
	});
});
