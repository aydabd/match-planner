import { describe, expect, it } from "vitest";
import { driveFileName, teamMarkerName } from "../src/core/driveNames.js";
import {
	classifyFolder,
	type DriveFileEntry,
	decideFolder,
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

describe("decideFolder - whose folder is this", () => {
	const base = {
		localTeamId: TEAM_A,
		localIsEmpty: false,
		otherLocalTeamIds: [] as string[],
	};

	it("claims a folder with no team marker", () => {
		expect(decideFolder({ ...base, markers: [] })).toEqual({ action: "claim" });
	});

	it("uses a folder already marked with this team's own id", () => {
		expect(
			decideFolder({ ...base, markers: [{ teamId: TEAM_A, fileId: "x" }] }),
		).toEqual({
			action: "use",
		});
	});

	it("tolerates the same marker listed twice", () => {
		expect(
			decideFolder({
				...base,
				markers: [
					{ teamId: TEAM_A, fileId: "x" },
					{ teamId: TEAM_A, fileId: "y" },
				],
			}),
		).toEqual({ action: "use" });
	});

	it("adopts another team's id only on a device whose team is still empty", () => {
		const markers = [{ teamId: TEAM_B, fileId: "x" }];
		expect(decideFolder({ ...base, localIsEmpty: true, markers })).toEqual({
			action: "adopt",
			teamId: TEAM_B,
		});
	});

	it("refuses to mix a team that already has data with another team's folder", () => {
		expect(
			decideFolder({ ...base, markers: [{ teamId: TEAM_B, fileId: "x" }] }),
		).toEqual({ action: "refuse", reason: "otherTeam" });
	});

	it("refuses to adopt an id that another team on this device already has", () => {
		expect(
			decideFolder({
				...base,
				localIsEmpty: true,
				otherLocalTeamIds: [TEAM_B],
				markers: [{ teamId: TEAM_B, fileId: "x" }],
			}),
		).toEqual({ action: "refuse", reason: "belongsToOtherLocalTeam" });
	});

	it("refuses a folder that holds more than one team", () => {
		expect(
			decideFolder({
				...base,
				localIsEmpty: true,
				markers: [
					{ teamId: TEAM_A, fileId: "x" },
					{ teamId: TEAM_B, fileId: "y" },
				],
			}),
		).toEqual({ action: "refuse", reason: "severalTeams" });
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
