import { describe, expect, it, vi } from "vitest";
import { driveFileName, teamMarkerName } from "../src/core/driveNames.js";
import type { DrivePayload } from "../src/core/drivePayload.js";
import { openPackages } from "../src/core/importUnlock.js";
import { EMPTY_PLAYER_NOTES_FILE } from "../src/core/playerNotes.js";
import { decryptJson, encryptJson } from "../src/core/securePackage.js";
import { makeMatchFile } from "./support/matchFiles.js";

const PW_A = "losenord-a-12";
const PW_B = "losenord-b-34";

interface File {
	path: string;
	text: string;
	teamIdHint: string | null;
}

async function packageFile(
	path: string,
	password: string,
	data: unknown,
	teamIdHint: string | null,
): Promise<File> {
	return {
		path,
		text: JSON.stringify(await encryptJson(password, data)),
		teamIdHint,
	};
}

/** A Drive-layout team folder: its marker and one match, under `password`. */
async function teamFolder(
	teamId: string,
	name: string,
	password: string,
	matchId: string,
): Promise<File[]> {
	const marker: DrivePayload = {
		schemaVersion: 1,
		kind: "team",
		teamId,
		teamName: name,
	};
	const match: DrivePayload = {
		schemaVersion: 1,
		kind: "match",
		teamId,
		match: makeMatchFile({ matchId }),
	};
	const dir = `root/team-${teamId}`;
	return [
		await packageFile(
			`${dir}/${teamMarkerName(teamId)}`,
			password,
			marker,
			teamId,
		),
		await packageFile(
			`${dir}/${await driveFileName("match", teamId, matchId)}`,
			password,
			match,
			teamId,
		),
	];
}

const TEAM_A = crypto.randomUUID();
const TEAM_B = crypto.randomUUID();

describe("openPackages - two teams, two passwords", () => {
	it("opens only the team a password matches and lists the other as locked", async () => {
		const folder = [
			...(await teamFolder(TEAM_A, "Lag A", PW_A, "a1")),
			...(await teamFolder(TEAM_B, "Lag B", PW_B, "b1")),
		];
		const asA = await openPackages(folder, PW_A);
		expect(asA.opened.map((o) => o.path)).toEqual(
			folder.slice(0, 2).map((f) => f.path),
		);
		expect(asA.locked).toEqual(
			folder.slice(2).map((f) => ({ path: f.path, teamIdHint: TEAM_B })),
		);
		expect(asA.damaged).toEqual([]);

		const asB = await openPackages(folder, PW_B);
		expect(asB.opened.map((o) => o.path)).toEqual(
			folder.slice(2).map((f) => f.path),
		);
		expect(asB.locked.map((l) => l.teamIdHint)).toEqual([TEAM_A, TEAM_A]);
	});

	it("opens nothing for a password that fits neither team", async () => {
		const folder = [
			...(await teamFolder(TEAM_A, "Lag A", PW_A, "a1")),
			...(await teamFolder(TEAM_B, "Lag B", PW_B, "b1")),
		];
		const result = await openPackages(folder, "helt-fel-losen");
		expect(result.opened).toEqual([]);
		expect(result.locked).toHaveLength(4);
		expect(result.damaged).toEqual([]);
	});

	it("gives the parsed payloads", async () => {
		const result = await openPackages(
			await teamFolder(TEAM_A, "Lag A", PW_A, "a1"),
			PW_A,
		);
		expect(result.opened.map((o) => o.kind)).toEqual(["payload", "payload"]);
		const [marker, match] = result.opened;
		expect(marker?.kind === "payload" && marker.payload).toMatchObject({
			kind: "team",
			teamName: "Lag A",
		});
		expect(match?.kind === "payload" && match.payload.kind).toBe("match");
	});

	it("derives one key for a locked folder, not one per file", async () => {
		const folder = await teamFolder(TEAM_B, "Lag B", PW_B, "b1");
		const decrypt = vi.fn(decryptJson);
		await openPackages(folder, PW_A, undefined, decrypt);
		expect(decrypt).toHaveBeenCalledTimes(1);
	});

	it("tries the marker first even when it is listed last", async () => {
		const folder = (await teamFolder(TEAM_B, "Lag B", PW_B, "b1")).reverse();
		const decrypt = vi.fn(decryptJson);
		const result = await openPackages(folder, PW_A, undefined, decrypt);
		expect(decrypt).toHaveBeenCalledTimes(1);
		expect(result.locked.map((l) => l.path)).toEqual(folder.map((f) => f.path));
	});

	it("derives a key per file when the marker opens", async () => {
		const folder = await teamFolder(TEAM_A, "Lag A", PW_A, "a1");
		const decrypt = vi.fn(decryptJson);
		await openPackages(folder, PW_A, undefined, decrypt);
		expect(decrypt).toHaveBeenCalledTimes(2);
	});
});

describe("openPackages - damaged is never hidden as locked", () => {
	it("flags a marker that opens but names another team", async () => {
		const marker: DrivePayload = {
			schemaVersion: 1,
			kind: "team",
			teamId: TEAM_B,
		};
		const file = await packageFile(
			`root/team-${TEAM_A}/${teamMarkerName(TEAM_B)}`,
			PW_A,
			marker,
			TEAM_A,
		);
		const result = await openPackages([file], PW_A);
		expect(result.opened).toEqual([]);
		expect(result.damaged).toEqual([
			{ path: file.path, reason: "invalidPayload" },
		]);
	});

	it("flags a payload whose file name is not the one its contents get", async () => {
		const [marker, match] = await teamFolder(TEAM_A, "Lag A", PW_A, "a1");
		const renamed = { ...(match as File), path: `root/team-${TEAM_A}/x.json` };
		const result = await openPackages([marker as File, renamed], PW_A);
		expect(result.opened).toHaveLength(1);
		expect(result.damaged).toEqual([
			{ path: renamed.path, reason: "wrongName" },
		]);
	});

	it("flags decrypted JSON that is neither a payload nor a bundle", async () => {
		const file = await packageFile("x.json", PW_A, { hello: 1 }, null);
		const result = await openPackages([file], PW_A);
		expect(result.damaged).toEqual([
			{ path: "x.json", reason: "invalidPayload" },
		]);
		expect(result.locked).toEqual([]);
	});

	it("flags a payload with bad content", async () => {
		const bad = { schemaVersion: 1, kind: "match", teamId: TEAM_A, match: {} };
		const file = await packageFile("m.json", PW_A, bad, null);
		const result = await openPackages([file], PW_A);
		expect(result.damaged).toEqual([
			{ path: "m.json", reason: "invalidPayload" },
		]);
	});
});

describe("openPackages - export bundles and progress", () => {
	it("opens an encrypted export as a bundle, whatever it is called", async () => {
		const bundle = {
			schemaVersion: 1,
			roster: null,
			matches: [makeMatchFile({ matchId: "m1" })],
			playerNotes: EMPTY_PLAYER_NOTES_FILE,
		};
		const file = await packageFile("anything.txt", PW_A, bundle, null);
		const result = await openPackages([file], PW_A);
		expect(result.opened).toHaveLength(1);
		expect(result.opened[0]?.kind).toBe("bundle");
	});

	it("reports progress up to the total, also for skipped locked files", async () => {
		const folder = [
			...(await teamFolder(TEAM_A, "Lag A", PW_A, "a1")),
			...(await teamFolder(TEAM_B, "Lag B", PW_B, "b1")),
		];
		const seen: [number, number][] = [];
		await openPackages(folder, PW_A, (done, total) => seen.push([done, total]));
		expect(seen[seen.length - 1]).toEqual([4, 4]);
		expect(seen.every(([, total]) => total === 4)).toBe(true);
		const dones = seen.map(([done]) => done);
		expect(dones).toEqual([...dones].sort((x, y) => x - y));
	});
});
