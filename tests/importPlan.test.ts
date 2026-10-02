import { describe, expect, it } from "vitest";
import { classifyFiles, type InputFile } from "../src/core/importPlan.js";
import { LIMITS } from "../src/core/limits.js";
import { EMPTY_PLAYER_NOTES_FILE } from "../src/core/playerNotes.js";
import { encryptJson } from "../src/core/securePackage.js";
import { newRoster } from "../src/core/storage.js";
import { makeMatchFile } from "./support/matchFiles.js";

const TEAM = "123e4567-e89b-42d3-a456-426614174000";
const json = (path: string, value: unknown): InputFile => ({
	path,
	text: JSON.stringify(value),
});
const squad = () =>
	newRoster({
		formatId: "7v7",
		players: [{ id: "p1", name: "Alva" }],
	});

describe("classifyFiles - kinds by content", () => {
	it("recognises every kind whatever the file is called", async () => {
		const pkg = await encryptJson("hemligt-losen", { x: 1 });
		const { files, skipped } = classifyFiles([
			json("a.txt", makeMatchFile()),
			json("b", squad()),
			json("c.json", EMPTY_PLAYER_NOTES_FILE),
			json("d.json", pkg),
		]);
		expect(skipped).toEqual([]);
		expect(files.map((f) => [f.path, f.kind])).toEqual([
			["a.txt", "match"],
			["b", "squad"],
			["c.json", "notes"],
			["d.json", "package"],
		]);
	});

	it("takes a squad called match-1.json for a squad", () => {
		const { files } = classifyFiles([json("match-1.json", squad())]);
		expect(files[0]?.kind).toBe("squad");
	});

	it("takes a match called notes.txt for a match", () => {
		const { files } = classifyFiles([json("notes.txt", makeMatchFile())]);
		expect(files[0]?.kind).toBe("match");
	});

	it("lists JSON that is none of them as unrecognised", () => {
		const { files, skipped } = classifyFiles([json("x.json", { hello: 1 })]);
		expect(files).toEqual([]);
		expect(skipped).toEqual([{ path: "x.json", reason: "unrecognised" }]);
	});

	it("lists a squad with no players as unrecognised", () => {
		const empty = newRoster({ formatId: "7v7" });
		const { skipped } = classifyFiles([json("empty.json", empty)]);
		expect(skipped).toEqual([{ path: "empty.json", reason: "unrecognised" }]);
	});

	it("lists text that is not JSON as notJson and carries on", () => {
		const { files, skipped } = classifyFiles([
			{ path: "readme.txt", text: "hej" },
			json("m.json", makeMatchFile()),
		]);
		expect(skipped).toEqual([{ path: "readme.txt", reason: "notJson" }]);
		expect(files.map((f) => f.path)).toEqual(["m.json"]);
	});
});

describe("classifyFiles - caps", () => {
	it("skips a file over the size cap and keeps the others", () => {
		const big = {
			path: "big.json",
			text: `"${"a".repeat(LIMITS.importFileBytes)}"`,
		};
		const { files, skipped } = classifyFiles([
			big,
			json("m.json", makeMatchFile()),
		]);
		expect(skipped).toEqual([{ path: "big.json", reason: "tooLarge" }]);
		expect(files).toHaveLength(1);
	});

	it("measures bytes, not characters", () => {
		const text = `"${"å".repeat(LIMITS.importFileBytes / 2)}"`;
		const { skipped } = classifyFiles([{ path: "å.json", text }]);
		expect(skipped).toEqual([{ path: "å.json", reason: "tooLarge" }]);
	});

	it("skips the files past the file-count cap as tooMany", () => {
		const input = Array.from({ length: LIMITS.importFiles + 2 }, (_, i) => ({
			path: `f${i}.txt`,
			text: "x",
		}));
		const { skipped } = classifyFiles(input);
		expect(skipped.filter((s) => s.reason === "tooMany")).toEqual([
			{ path: `f${LIMITS.importFiles}.txt`, reason: "tooMany" },
			{ path: `f${LIMITS.importFiles + 1}.txt`, reason: "tooMany" },
		]);
	});

	it("skips what would pass the total-bytes cap as tooMany", () => {
		const chunk = LIMITS.importFileBytes - 10;
		const count = Math.floor(LIMITS.importTotalBytes / chunk) + 1;
		const input = Array.from({ length: count }, (_, i) => ({
			path: `f${i}.txt`,
			text: `"${"a".repeat(chunk - 2)}"`,
		}));
		const { skipped } = classifyFiles(input);
		expect(skipped[skipped.length - 1]).toEqual({
			path: `f${count - 1}.txt`,
			reason: "tooMany",
		});
		expect(skipped.filter((s) => s.reason === "tooMany")).toHaveLength(1);
	});
});

describe("classifyFiles - team hint from the path", () => {
	const hint = (path: string) =>
		classifyFiles([json(path, makeMatchFile())]).files[0]?.teamIdHint;

	it("reads a team-<uuid> folder anywhere in the path", () => {
		expect(hint(`root/team-${TEAM}/x.json`)).toBe(TEAM);
	});

	it("gives null for a malformed id or no folder", () => {
		expect(hint("team-../x.json")).toBeNull();
		expect(hint("team-notauuid/x.json")).toBeNull();
		expect(hint("x.json")).toBeNull();
	});

	it("does not take the hint from the file name itself", () => {
		expect(hint(`team-${TEAM}`)).toBeNull();
	});

	it("returns a hostile path unchanged", () => {
		const path = `<img src=x onerror=alert(1)>/../${"‮"}x.json`;
		const { files } = classifyFiles([json(path, makeMatchFile())]);
		expect(files[0]?.path).toBe(path);
	});
});
