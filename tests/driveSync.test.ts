import { describe, expect, it } from "vitest";
import {
	type DriveFileEntry,
	matchesToBackUp,
	matchesToRestore,
} from "../src/core/driveSync.js";
import { makeMatchFile } from "./support/matchFiles.js";

describe("matchesToBackUp - local match files missing from the Drive folder", () => {
	it("lists every local match when the folder is empty", () => {
		const a = makeMatchFile({ matchId: "a", seed: 1 });
		const b = makeMatchFile({ matchId: "b", seed: 2 });
		expect(matchesToBackUp([a, b], [])).toEqual([a, b]);
	});

	it("leaves out matches already in the folder", () => {
		const a = makeMatchFile({ matchId: "a", seed: 1 });
		const b = makeMatchFile({ matchId: "b", seed: 2 });
		const remote: DriveFileEntry[] = [{ matchId: "a", fileId: "drive-a" }];
		expect(matchesToBackUp([a, b], remote)).toEqual([b]);
	});

	it("backs up nothing once every local match is in the folder", () => {
		const a = makeMatchFile({ matchId: "a", seed: 1 });
		const remote: DriveFileEntry[] = [{ matchId: "a", fileId: "drive-a" }];
		expect(matchesToBackUp([a], remote)).toEqual([]);
	});

	it("does not mutate the lists it is given", () => {
		const a = makeMatchFile({ matchId: "a", seed: 1 });
		const local = [a];
		const remote: DriveFileEntry[] = [];
		matchesToBackUp(local, remote);
		expect(local).toEqual([a]);
		expect(remote).toEqual([]);
	});
});

describe("matchesToRestore - Drive files missing locally", () => {
	it("lists nothing when the folder is empty", () => {
		expect(matchesToRestore([], new Set())).toEqual([]);
	});

	it("lists folder entries whose matchId is not kept locally, with their Drive file id", () => {
		const remote: DriveFileEntry[] = [
			{ matchId: "a", fileId: "drive-a" },
			{ matchId: "b", fileId: "drive-b" },
		];
		expect(matchesToRestore(remote, new Set(["a"]))).toEqual([
			{ matchId: "b", fileId: "drive-b" },
		]);
	});

	it("restores nothing once every folder entry is already kept locally", () => {
		const remote: DriveFileEntry[] = [{ matchId: "a", fileId: "drive-a" }];
		expect(matchesToRestore(remote, new Set(["a"]))).toEqual([]);
	});
});
