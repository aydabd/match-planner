import { describe, expect, it } from "vitest";
import { driveFileName } from "../src/core/driveNames.js";
import {
	type DrivePayload,
	DrivePayloadError,
	parseDrivePayload,
	payloadFileName,
} from "../src/core/drivePayload.js";
import { EMPTY_PLAYER_NOTES_FILE } from "../src/core/playerNotes.js";
import { newRoster } from "../src/core/storage.js";
import { makeMatchFile } from "./support/matchFiles.js";

const TEAM = "6f1c2f6e-3b1a-4c55-9a52-0d1f3f7a9b10";
const roundTrip = (p: DrivePayload): unknown => JSON.parse(JSON.stringify(p));

const match: DrivePayload = {
	schemaVersion: 1,
	kind: "match",
	teamId: TEAM,
	match: makeMatchFile({ matchId: "m-1" }),
};
const notes: DrivePayload = {
	schemaVersion: 1,
	kind: "notes",
	teamId: TEAM,
	deviceId: "dev-1",
	playerNotes: EMPTY_PLAYER_NOTES_FILE,
};
const squad: DrivePayload = {
	schemaVersion: 1,
	kind: "squad",
	teamId: TEAM,
	deviceId: "dev-1",
	roster: newRoster({
		formatId: "7v7:2-3-1",
		players: [{ id: "p1", name: "Alva" }],
	}),
};
const marker: DrivePayload = { schemaVersion: 1, kind: "team", teamId: TEAM };

describe("parseDrivePayload", () => {
	it.each([match, notes, squad, marker])(
		"reads back a %#th payload it wrote",
		(p) => {
			expect(parseDrivePayload(roundTrip(p))).toEqual(p);
		},
	);

	it("refuses things that are not payloads", () => {
		for (const raw of [
			null,
			"x",
			[],
			{},
			{ schemaVersion: 2, kind: "team", teamId: TEAM },
		]) {
			expect(() => parseDrivePayload(raw)).toThrow(DrivePayloadError);
		}
	});

	it("refuses an unknown kind and a team id that is not a UUID", () => {
		expect(() =>
			parseDrivePayload({ schemaVersion: 1, kind: "other", teamId: TEAM }),
		).toThrow(DrivePayloadError);
		expect(() =>
			parseDrivePayload({ schemaVersion: 1, kind: "team", teamId: "t-1" }),
		).toThrow(DrivePayloadError);
	});

	it("refuses a payload whose content is not valid, using the strict parsers", () => {
		expect(() =>
			parseDrivePayload({
				...(roundTrip(match) as object),
				match: { nope: true },
			}),
		).toThrow(DrivePayloadError);
		expect(() =>
			parseDrivePayload({
				...(roundTrip(notes) as object),
				playerNotes: { schemaVersion: 9 },
			}),
		).toThrow(DrivePayloadError);
		expect(() =>
			parseDrivePayload({ ...(roundTrip(squad) as object), roster: {} }),
		).toThrow(DrivePayloadError);
		expect(() =>
			parseDrivePayload({ ...(roundTrip(notes) as object), deviceId: "" }),
		).toThrow(DrivePayloadError);
	});
});

describe("payloadFileName", () => {
	it("is the name the same file must have in Drive, from its own contents", async () => {
		expect(await payloadFileName(match)).toBe(
			await driveFileName("match", TEAM, "m-1"),
		);
		expect(await payloadFileName(notes)).toBe(
			await driveFileName("notes", TEAM, "dev-1"),
		);
		expect(await payloadFileName(squad)).toBe(
			await driveFileName("squad", TEAM, "dev-1"),
		);
		expect(await payloadFileName(marker)).toBe(`team-${TEAM}.json`);
	});
});

describe("team marker with a team name (#142)", () => {
	it("keeps the name, trimmed and capped, so a restore can offer teams by name", () => {
		const named = parseDrivePayload({
			schemaVersion: 1,
			kind: "team",
			teamId: TEAM,
			teamName: "  P11 Blå  ",
		});
		expect(named).toEqual({
			schemaVersion: 1,
			kind: "team",
			teamId: TEAM,
			teamName: "P11 Blå",
		});
		const long = parseDrivePayload({
			schemaVersion: 1,
			kind: "team",
			teamId: TEAM,
			teamName: "x".repeat(100),
		});
		expect(long.kind === "team" && long.teamName).toHaveLength(40);
	});

	it("still reads a marker without a name", () => {
		expect(parseDrivePayload(roundTrip(marker))).toEqual(marker);
	});

	it("refuses a name that is not text", () => {
		expect(() =>
			parseDrivePayload({
				schemaVersion: 1,
				kind: "team",
				teamId: TEAM,
				teamName: 5,
			}),
		).toThrow(DrivePayloadError);
	});
});
