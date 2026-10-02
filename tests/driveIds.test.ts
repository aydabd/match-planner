import { describe, expect, it } from "vitest";
import { isDriveId } from "../src/core/driveIds.js";

describe("isDriveId", () => {
	it("accepts the ids Google Drive hands out", () => {
		for (const id of [
			"1a2B3c4D5e6F7g8H9i0J1k2L3m4N5o6P7",
			"0B-abc_DEF123",
			"root",
			"folder-1",
			"x",
		]) {
			expect(isDriveId(id)).toBe(true);
		}
	});

	it.each([
		["a quote that would end a query string", "abc' or 'x'='x"],
		["a slash that would change the request path", "abc/def"],
		["a parent-directory step", "../../etc"],
		["a question mark that would start a query string", "abc?alt=media"],
		["a hash", "abc#frag"],
		["a space", "abc def"],
		["a backslash", "abc\\def"],
		["a percent escape", "abc%2Fdef"],
		["a newline", "abc\ndef"],
		["a non-ASCII letter", "abcö"],
		["the empty string", ""],
		["a very long string", "a".repeat(129)],
	])("refuses %s", (_what, value) => {
		expect(isDriveId(value)).toBe(false);
	});

	it("refuses anything that is not a string", () => {
		for (const value of [undefined, null, 5, {}, ["a"]]) {
			expect(isDriveId(value)).toBe(false);
		}
	});
});
