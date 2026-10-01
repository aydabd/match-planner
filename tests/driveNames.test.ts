import { describe, expect, it } from "vitest";
import {
	driveFileName,
	parseDriveFileName,
	teamMarkerName,
} from "../src/core/driveNames.js";
import { uuidv5Raw } from "../src/core/securePackage.js";

const TEAM_A = "6f1c2f6e-3b1a-4c55-9a52-0d1f3f7a9b10";
const TEAM_B = "0e5b7c1d-72a4-4d0e-8f3b-5c9d1a2e4f60";
const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const UUID =
	"[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

describe("uuidv5Raw", () => {
	it("matches the well-known RFC 4122 value for python.org in the DNS namespace", async () => {
		expect(await uuidv5Raw("python.org", DNS_NAMESPACE)).toBe(
			"886313e1-3b8a-5372-9b90-0c9aee199e5d",
		);
	});

	it("does not fold case or whitespace the way player-name ids do", async () => {
		expect(await uuidv5Raw("Abc", DNS_NAMESPACE)).not.toBe(
			await uuidv5Raw("abc", DNS_NAMESPACE),
		);
		expect(await uuidv5Raw(" abc", DNS_NAMESPACE)).not.toBe(
			await uuidv5Raw("abc", DNS_NAMESPACE),
		);
	});
});

describe("driveFileName", () => {
	it("is the kind, then a UUIDv5, then .json", async () => {
		expect(await driveFileName("match", TEAM_A, "m-1")).toMatch(
			new RegExp(`^match-${UUID}\\.json$`),
		);
		expect(await driveFileName("notes", TEAM_A, "dev-1")).toMatch(
			new RegExp(`^notes-${UUID}\\.json$`),
		);
		expect(await driveFileName("squad", TEAM_A, "dev-1")).toMatch(
			new RegExp(`^squad-${UUID}\\.json$`),
		);
	});

	it("is the same every time for the same team, kind and key", async () => {
		expect(await driveFileName("match", TEAM_A, "m-1")).toBe(
			await driveFileName("match", TEAM_A, "m-1"),
		);
	});

	it("differs between two teams for the same match id, so teams never share a file", async () => {
		expect(await driveFileName("match", TEAM_A, "m-1")).not.toBe(
			await driveFileName("match", TEAM_B, "m-1"),
		);
	});

	it("differs between kinds and keys", async () => {
		const names = new Set([
			await driveFileName("match", TEAM_A, "x"),
			await driveFileName("notes", TEAM_A, "x"),
			await driveFileName("squad", TEAM_A, "x"),
			await driveFileName("match", TEAM_A, "y"),
		]);
		expect(names.size).toBe(4);
	});

	it("never contains the key it was made from", async () => {
		const name = await driveFileName("match", TEAM_A, "Vinslövs-IF-Alva");
		expect(name).not.toContain("Alva");
		expect(name).not.toContain("Vinslövs");
	});

	it("refuses a team id that is not a UUID, which cannot be a namespace", async () => {
		await expect(driveFileName("match", "t-abc123", "m-1")).rejects.toThrow();
	});
});

describe("teamMarkerName", () => {
	it("is team-<team id>.json", () => {
		expect(teamMarkerName(TEAM_A)).toBe(`team-${TEAM_A}.json`);
	});
});

describe("parseDriveFileName", () => {
	it("reads the kind of a name this app wrote", async () => {
		expect(
			parseDriveFileName(await driveFileName("match", TEAM_A, "m")),
		).toMatchObject({
			kind: "match",
		});
		expect(
			parseDriveFileName(await driveFileName("notes", TEAM_A, "d")),
		).toMatchObject({
			kind: "notes",
		});
		expect(
			parseDriveFileName(await driveFileName("squad", TEAM_A, "d")),
		).toMatchObject({
			kind: "squad",
		});
	});

	it("reads the team id out of a team marker name", () => {
		expect(parseDriveFileName(teamMarkerName(TEAM_A))).toEqual({
			kind: "team",
			id: TEAM_A,
		});
	});

	it("returns null for anything else in the folder", () => {
		for (const name of [
			"manifest.json",
			"notes.json",
			"match-1234.json",
			`match-${TEAM_A}.txt`,
			`other-${TEAM_A}.json`,
			"team-not-a-uuid.json",
			"",
		]) {
			expect(parseDriveFileName(name)).toBeNull();
		}
	});

	it("rejects a version-4 UUID where a UUIDv5 is required", () => {
		expect(parseDriveFileName(`match-${TEAM_A}.json`)).toBeNull();
	});
});
