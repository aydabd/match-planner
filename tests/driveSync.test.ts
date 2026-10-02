import { describe, expect, it } from "vitest";
import { driveFileName, teamMarkerName } from "../src/core/driveNames.js";
import {
	chooseTeamFolder,
	classifyFolder,
	type DriveFileEntry,
	filesToRestore,
	matchesToBackUp,
	pickSquad,
} from "../src/core/driveSync.js";
import { newRoster } from "../src/core/storage.js";
import { makeMatchFile } from "./support/matchFiles.js";

const TEAM_A = "6f1c2f6e-3b1a-4c55-9a52-0d1f3f7a9b10";
const TEAM_B = "0e5b7c1d-72a4-4d0e-8f3b-5c9d1a2e4f60";

describe("classifyFolder", () => {
	it("sorts the folder's files by kind and ignores everything this app did not write", async () => {
		const entries: DriveFileEntry[] = [
			{ name: await driveFileName("match", TEAM_A, "m1"), fileId: "f-m1" },
			{ name: await driveFileName("notes", TEAM_A, "d1"), fileId: "f-n1" },
			{ name: await driveFileName("squad", TEAM_A, "d1"), fileId: "f-s1" },
			{ name: teamMarkerName(TEAM_A), fileId: "f-t" },
			{ name: "manifest.json", fileId: "f-old" },
			{ name: "holiday.pdf", fileId: "f-pdf" },
			{ name: "a-match-id.json", fileId: "f-legacy" },
		];
		const listing = classifyFolder(entries);
		expect(listing.matches.map((e) => e.fileId)).toEqual(["f-m1"]);
		expect(listing.notes.map((e) => e.fileId)).toEqual(["f-n1"]);
		expect(listing.squads.map((e) => e.fileId)).toEqual(["f-s1"]);
		expect(listing.markers).toEqual([{ teamId: TEAM_A, fileId: "f-t" }]);
	});
});

describe("matchesToBackUp", () => {
	it("keeps the local matches whose Drive name is not in the folder yet", () => {
		const a = makeMatchFile({ matchId: "a", seed: 1 });
		const b = makeMatchFile({ matchId: "b", seed: 2 });
		const local = new Map([
			["match-a", a],
			["match-b", b],
		]);
		expect(matchesToBackUp(local, new Set(["match-a"]))).toEqual([b]);
		expect(matchesToBackUp(local, new Set())).toEqual([a, b]);
		expect(matchesToBackUp(local, new Set(["match-a", "match-b"]))).toEqual([]);
	});
});

describe("filesToRestore", () => {
	it("keeps the Drive files whose name no local match has", () => {
		const remote: DriveFileEntry[] = [
			{ name: "match-a", fileId: "1" },
			{ name: "match-b", fileId: "2" },
		];
		expect(filesToRestore(remote, new Set(["match-a"]))).toEqual([
			{ name: "match-b", fileId: "2" },
		]);
		expect(filesToRestore([], new Set())).toEqual([]);
	});
});

describe("pickSquad", () => {
	const roster = (name: string, createdAt?: string) => {
		const r = newRoster({
			formatId: "7v7:2-3-1",
			players: [{ id: "p", name }],
		});
		if (createdAt) r.audit = { createdAt, createdBy: "", appVersion: "0" };
		return r;
	};

	it("is null when no device has saved a squad", () => {
		expect(pickSquad([])).toBeNull();
	});

	it("takes the most recently saved squad, whatever order they are given in", () => {
		const old = roster("Alva", "2026-08-01T10:00:00.000Z");
		const recent = roster("Bo", "2026-09-01T10:00:00.000Z");
		expect(pickSquad([old, recent])).toEqual(recent);
		expect(pickSquad([recent, old])).toEqual(recent);
	});

	it("is the same squad in any order even when none has a save time", () => {
		const a = roster("Alva");
		const b = roster("Bo");
		expect(pickSquad([a, b])).toEqual(pickSquad([b, a]));
	});
});

describe("chooseTeamFolder - which team's folder in the root (#142)", () => {
	const TEAM_C = "11111111-2222-4333-8444-555555555555";
	const base = {
		localTeamId: TEAM_A,
		localIsEmpty: false,
		otherLocalTeamIds: [] as string[],
	};
	const a = { teamId: TEAM_A, folderId: "fa" };
	const b = { teamId: TEAM_B, folderId: "fb" };
	const c = { teamId: TEAM_C, folderId: "fc" };

	it("has nothing to restore from an empty root", () => {
		expect(chooseTeamFolder({ ...base, folders: [] })).toEqual({
			action: "none",
		});
	});

	it("uses this team's own folder, whatever else is in the root", () => {
		expect(chooseTeamFolder({ ...base, folders: [b, a, c] })).toEqual({
			action: "use",
			folderId: "fa",
		});
		expect(
			chooseTeamFolder({ ...base, localIsEmpty: true, folders: [b, a] }),
		).toEqual({
			action: "use",
			folderId: "fa",
		});
	});

	it("adopts the only team in the root when this team is empty", () => {
		expect(
			chooseTeamFolder({ ...base, localIsEmpty: true, folders: [b] }),
		).toEqual({
			action: "adopt",
			teamId: TEAM_B,
			folderId: "fb",
		});
	});

	it("asks which team when several qualify, in the same order whatever order they are listed", () => {
		const one = chooseTeamFolder({
			...base,
			localIsEmpty: true,
			folders: [c, b],
		});
		const two = chooseTeamFolder({
			...base,
			localIsEmpty: true,
			folders: [b, c],
		});
		expect(one).toEqual(two);
		expect(one).toEqual({ action: "choose", teams: [b, c] });
	});

	it("refuses to mix a team that has data with a folder that is not its own", () => {
		expect(chooseTeamFolder({ ...base, folders: [b] })).toEqual({
			action: "refuse",
			reason: "otherTeam",
		});
	});

	it("leaves out teams another team on this device already has, since adopting one would merge two teams", () => {
		expect(
			chooseTeamFolder({
				...base,
				localIsEmpty: true,
				otherLocalTeamIds: [TEAM_B],
				folders: [b, c],
			}),
		).toEqual({ action: "adopt", teamId: TEAM_C, folderId: "fc" });
		expect(
			chooseTeamFolder({
				...base,
				localIsEmpty: true,
				otherLocalTeamIds: [TEAM_B],
				folders: [b],
			}),
		).toEqual({ action: "refuse", reason: "belongsToOtherLocalTeam" });
	});

	it("treats two folders for the same team (made at the same moment) as one, the same one every time", () => {
		const twin = { teamId: TEAM_B, folderId: "fb-twin" };
		const first = chooseTeamFolder({
			...base,
			localIsEmpty: true,
			folders: [b, twin],
		});
		const second = chooseTeamFolder({
			...base,
			localIsEmpty: true,
			folders: [twin, b],
		});
		expect(first).toEqual(second);
		expect(first.action).toBe("adopt");
	});
});
