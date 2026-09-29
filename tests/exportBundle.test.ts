import { describe, expect, it } from "vitest";
import {
	EXPORT_BUNDLE_VERSION,
	type ExportBundle,
	ExportBundleError,
	parseExportBundle,
} from "../src/core/exportBundle.js";
import { EMPTY_PLAYER_NOTES_FILE } from "../src/core/playerNotes.js";
import { newRoster } from "../src/core/storage.js";
import { makeMatchFile } from "./support/matchFiles.js";

function validBundle(): ExportBundle {
	return {
		schemaVersion: EXPORT_BUNDLE_VERSION,
		roster: newRoster({ formatId: "5v5:1-2-1" }),
		matches: [makeMatchFile({ matchId: "m1" })],
		playerNotes: EMPTY_PLAYER_NOTES_FILE,
	};
}

describe("parseExportBundle - strict validation", () => {
	it("round-trips a full bundle through JSON", () => {
		const bundle = validBundle();
		expect(parseExportBundle(JSON.parse(JSON.stringify(bundle)))).toEqual(
			bundle,
		);
	});

	it("accepts a null roster (no squad set up yet)", () => {
		const bundle = { ...validBundle(), roster: null };
		expect(parseExportBundle(JSON.parse(JSON.stringify(bundle))).roster).toBe(
			null,
		);
	});

	it("accepts an empty matches list", () => {
		const bundle = { ...validBundle(), matches: [] };
		expect(
			parseExportBundle(JSON.parse(JSON.stringify(bundle))).matches,
		).toEqual([]);
	});

	it.each([
		["not an object", "just a string"],
		["null", null],
		["the wrong schema version", { ...validBundle(), schemaVersion: 99 }],
		[
			"a roster that isn't a valid squad file",
			{ ...validBundle(), roster: { bad: true } },
		],
		["matches that is not an array", { ...validBundle(), matches: "nope" }],
		[
			"a match that isn't a valid match file",
			{ ...validBundle(), matches: [{ bad: true }] },
		],
		[
			"player notes that isn't a valid notes file",
			{ ...validBundle(), playerNotes: { bad: true } },
		],
	])("rejects %s", (_, raw) => {
		expect(() => parseExportBundle(raw)).toThrow(ExportBundleError);
	});
});
