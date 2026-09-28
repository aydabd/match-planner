import { describe, expect, it } from "vitest";
import {
	DriveSyncError,
	EMPTY_MANIFEST,
	manifestToJson,
	matchesToBackUp,
	matchesToRestore,
	parseManifest,
	withManifestEntry,
} from "../src/core/driveSync.js";
import { makeMatchFile } from "./support/matchFiles.js";

describe("DriveManifest - parsing and round trip", () => {
	it("round-trips an empty manifest through JSON", () => {
		expect(parseManifest(JSON.parse(manifestToJson(EMPTY_MANIFEST)))).toEqual(
			EMPTY_MANIFEST,
		);
	});

	it("adds an entry without mutating the manifest it was given", () => {
		const next = withManifestEntry(EMPTY_MANIFEST, "match-1", "drive-file-1");
		expect(EMPTY_MANIFEST.files).toEqual({});
		expect(next.files).toEqual({ "match-1": "drive-file-1" });
	});

	it("round-trips a manifest with entries", () => {
		const manifest = withManifestEntry(
			EMPTY_MANIFEST,
			"match-1",
			"drive-file-1",
		);
		expect(parseManifest(JSON.parse(manifestToJson(manifest)))).toEqual(
			manifest,
		);
	});

	it.each([
		["not an object", "just a string"],
		["null", null],
		["the wrong schema version", { schemaVersion: 99, files: {} }],
		["files that is not an object", { schemaVersion: 1, files: [] }],
		[
			"a file id that is not a string",
			{ schemaVersion: 1, files: { "match-1": 5 } },
		],
	])("rejects %s", (_, raw) => {
		expect(() => parseManifest(raw)).toThrow(DriveSyncError);
	});
});

describe("matchesToBackUp - local match files missing from the manifest", () => {
	it("lists every local match when the manifest is empty", () => {
		const a = makeMatchFile({ matchId: "a", seed: 1 });
		const b = makeMatchFile({ matchId: "b", seed: 2 });
		expect(matchesToBackUp([a, b], EMPTY_MANIFEST)).toEqual([a, b]);
	});

	it("leaves out matches already in the manifest", () => {
		const a = makeMatchFile({ matchId: "a", seed: 1 });
		const b = makeMatchFile({ matchId: "b", seed: 2 });
		const manifest = withManifestEntry(EMPTY_MANIFEST, "a", "drive-a");
		expect(matchesToBackUp([a, b], manifest)).toEqual([b]);
	});

	it("backs up nothing once every local match is in the manifest", () => {
		const a = makeMatchFile({ matchId: "a", seed: 1 });
		const manifest = withManifestEntry(EMPTY_MANIFEST, "a", "drive-a");
		expect(matchesToBackUp([a], manifest)).toEqual([]);
	});
});

describe("matchesToRestore - manifest entries missing locally", () => {
	it("lists nothing when the manifest is empty", () => {
		expect(matchesToRestore(EMPTY_MANIFEST, new Set())).toEqual([]);
	});

	it("lists manifest entries whose matchId is not kept locally, with their Drive file id", () => {
		const manifest = withManifestEntry(
			withManifestEntry(EMPTY_MANIFEST, "a", "drive-a"),
			"b",
			"drive-b",
		);
		expect(matchesToRestore(manifest, new Set(["a"]))).toEqual([
			{ matchId: "b", fileId: "drive-b" },
		]);
	});

	it("restores nothing once every manifest entry is already kept locally", () => {
		const manifest = withManifestEntry(EMPTY_MANIFEST, "a", "drive-a");
		expect(matchesToRestore(manifest, new Set(["a"]))).toEqual([]);
	});
});
