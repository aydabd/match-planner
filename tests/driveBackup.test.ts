import { describe, expect, it, vi } from "vitest";
import { driveFileName, teamFolderName } from "../src/core/driveNames.js";
import { parseDrivePayload } from "../src/core/drivePayload.js";
import {
	EMPTY_PLAYER_NOTES_FILE,
	withAvailability,
	withDevelopment,
} from "../src/core/playerNotes.js";
import {
	decryptJson,
	encryptJson,
	parseSecurePackage,
	SecurePackageError,
	securePackageToJson,
} from "../src/core/securePackage.js";
import { newRoster } from "../src/core/storage.js";
import { loadDraft, saveDraft } from "../src/ui/draftStorage.js";
import {
	createDriveBackup,
	type RestoreOutcome,
	type RestoreResult,
} from "../src/ui/driveBackup.js";
import { keepMatchFiles, loadMatchFiles } from "../src/ui/matchFileStorage.js";
import {
	loadPlayerNotes,
	savePlayerNotes,
} from "../src/ui/playerNotesStorage.js";
import {
	activeTeamId,
	createTeam,
	listTeams,
	renameTeam,
	switchTeam,
} from "../src/ui/teamStorage.js";
import { FakeDrive } from "./support/fakeDrive.js";
import { makeMatchFile } from "./support/matchFiles.js";
import { MemoryStorage } from "./support/memoryStorage.js";

const ROOT = "root-1";
const PASSWORD = "hemligt";

/** One phone: its own storage, so its own device id, teams and data. */
function device() {
	const storage = new MemoryStorage();
	return {
		run: async <T>(fn: () => Promise<T> | T): Promise<T> => {
			vi.stubGlobal("localStorage", storage);
			try {
				return await fn();
			} finally {
				vi.unstubAllGlobals();
			}
		},
	};
}
type Device = ReturnType<typeof device>;

const backupOf = (drive: FakeDrive) => createDriveBackup(drive.client());
const note = (key: string, text: string) =>
	withDevelopment(loadPlayerNotes(), key, {
		date: "2026-09-01",
		area: "physical",
		note: text,
	});

/** Restore and insist it went through (no question asked). */
async function restored(
	drive: FakeDrive,
	password = PASSWORD,
	teamId?: string,
): Promise<RestoreResult> {
	const outcome = await backupOf(drive).restore(ROOT, password, teamId);
	if (outcome.kind !== "restored") throw new Error("a choice was asked for");
	const { kind: _kind, ...result } = outcome;
	return result;
}

const NOTHING_NEW: RestoreResult = {
	downloaded: 0,
	notesChanged: false,
	squadRestored: false,
	ignored: 0,
};

/** A team on a phone with two matches, a squad and a note, backed up to ROOT. */
async function teamWithData(drive: FakeDrive, seed: number, name?: string) {
	const phone = device();
	let teamId = "";
	await phone.run(async () => {
		if (name) renameTeam(activeTeamId(), name);
		keepMatchFiles([
			makeMatchFile({ matchId: `m${seed}a`, seed }),
			makeMatchFile({ matchId: `m${seed}b`, seed: seed + 1 }),
		]);
		saveDraft(
			newRoster({
				formatId: "7v7:2-3-1",
				players: [{ id: "p1", name: `Spelare${seed}` }],
			}),
		);
		savePlayerNotes(note("alva", `Anteckning ${seed}`));
		await backupOf(drive).backup(ROOT, PASSWORD);
		teamId = activeTeamId();
	});
	return { phone, teamId };
}

describe("Drive backup - what is written (#142)", () => {
	it("makes one subfolder for the team in the root, holding the marker and the match, named only by ids", async () => {
		const drive = new FakeDrive();
		await device().run(async () => {
			keepMatchFiles([
				makeMatchFile({
					matchId: "m1",
					opponent: "Vinslövs IF",
					names: ["Alva", "Bo", "Cleo", "Dino", "Ebba", "Filip", "Greta"],
				}),
			]);
			expect(await backupOf(drive).backup(ROOT, PASSWORD)).toEqual({
				uploaded: 1,
				stateSaved: false,
			});
			const teamId = activeTeamId();
			expect(drive.folderNames(ROOT)).toEqual([teamFolderName(teamId)]);
			expect(drive.names(ROOT)).toEqual([]);
			const folder = drive.folderId(ROOT, teamFolderName(teamId)) ?? "";
			expect(drive.names(folder)).toEqual(
				[
					`team-${teamId}.json`,
					await driveFileName("match", teamId, "m1"),
				].sort(),
			);
		});
		const everything = [
			...[...drive.folders.values()].map((f) => f.name),
			...[...drive.files.values()].map((f) => f.name + f.contents),
		].join("\n");
		for (const secret of ["Vinslövs", "Alva", "Mitt lag"]) {
			expect(everything).not.toContain(secret);
		}
	});

	it("writes nothing for a team that has nothing to back up, not even a folder", async () => {
		const drive = new FakeDrive();
		await device().run(async () => {
			expect(await backupOf(drive).backup(ROOT, PASSWORD)).toEqual({
				uploaded: 0,
				stateSaved: false,
			});
		});
		expect(drive.folders.size).toBe(0);
		expect(drive.files.size).toBe(0);
	});

	it("reuses the subfolder and uploads nothing the second time", async () => {
		const drive = new FakeDrive();
		await device().run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			await backupOf(drive).backup(ROOT, PASSWORD);
			const creates = drive.creates;
			expect(await backupOf(drive).backup(ROOT, PASSWORD)).toEqual({
				uploaded: 0,
				stateSaved: false,
			});
			expect(drive.folders.size).toBe(1);
			expect(drive.creates).toBe(creates);
			expect(drive.updates).toBe(0);
		});
	});

	it("saves the squad and notes once, and not again until they change", async () => {
		const drive = new FakeDrive();
		await device().run(async () => {
			saveDraft(
				newRoster({
					formatId: "7v7:2-3-1",
					players: [{ id: "p1", name: "Alva" }],
				}),
			);
			savePlayerNotes(note("alva", "Snabbare"));
			expect((await backupOf(drive).backup(ROOT, PASSWORD)).stateSaved).toBe(
				true,
			);
			expect((await backupOf(drive).backup(ROOT, PASSWORD)).stateSaved).toBe(
				false,
			);
			savePlayerNotes(note("alva", "Modigare"));
			expect((await backupOf(drive).backup(ROOT, PASSWORD)).stateSaved).toBe(
				true,
			);
			const folder = drive.folderId(ROOT, teamFolderName(activeTeamId())) ?? "";
			expect(
				drive.names(folder).filter((n) => n.startsWith("notes-")),
			).toHaveLength(1);
		});
	});

	it("keeps the team's name in the encrypted marker, and updates it when the team is renamed", async () => {
		const drive = new FakeDrive();
		const markerName = async () => {
			const folder = drive.folderId(ROOT, teamFolderName(activeTeamId())) ?? "";
			const entry = [...drive.files.values()].find(
				(f) =>
					f.folderId === folder &&
					f.name.endsWith(".json") &&
					f.name.startsWith("team-"),
			);
			const payload = parseDrivePayload(
				await decryptJson(
					PASSWORD,
					parseSecurePackage(JSON.parse(entry?.contents ?? "{}")),
				),
			);
			return payload.kind === "team" ? payload.teamName : undefined;
		};
		await device().run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			renameTeam(activeTeamId(), "P11 Blå");
			await backupOf(drive).backup(ROOT, PASSWORD);
			expect(await markerName()).toBe("P11 Blå");
			renameTeam(activeTeamId(), "P12 Röd");
			await backupOf(drive).backup(ROOT, PASSWORD);
			expect(await markerName()).toBe("P12 Röd");
			expect(drive.folders.size).toBe(1);
		});
	});
});

describe("Drive backup - teams share one root without touching each other", () => {
	it("gives two teams on one phone two subfolders", async () => {
		const drive = new FakeDrive();
		await device().run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "same" })]);
			const first = activeTeamId();
			await backupOf(drive).backup(ROOT, PASSWORD);
			createTeam("P11 7v7");
			keepMatchFiles([makeMatchFile({ matchId: "same", seed: 9 })]);
			const second = activeTeamId();
			await backupOf(drive).backup(ROOT, PASSWORD);
			expect(drive.folderNames(ROOT)).toEqual(
				[teamFolderName(first), teamFolderName(second)].sort(),
			);
			const firstFolder = drive.folderId(ROOT, teamFolderName(first)) ?? "";
			const secondFolder = drive.folderId(ROOT, teamFolderName(second)) ?? "";
			const matchIn = (f: string) =>
				drive.names(f).filter((n) => n.startsWith("match-"));
			expect(matchIn(firstFolder)).toHaveLength(1);
			expect(matchIn(secondFolder)).toHaveLength(1);
			expect(matchIn(firstFolder)).not.toEqual(matchIn(secondFolder));
		});
	});

	it("gives two coaches whose teams have the same name two subfolders, and neither changes the other's files", async () => {
		const drive = new FakeDrive();
		await teamWithData(drive, 1, "P11 Blå");
		const firstFolder = drive.folderNames(ROOT)[0] ?? "";
		const before = drive.names(drive.folderId(ROOT, firstFolder) ?? "");
		await teamWithData(drive, 5, "P11 Blå");
		expect(drive.folderNames(ROOT)).toHaveLength(2);
		expect(drive.names(drive.folderId(ROOT, firstFolder) ?? "")).toEqual(
			before,
		);
	});
});

describe("Drive restore - an empty phone", () => {
	it("takes on the only team in the root, its id and its name, and gets everything", async () => {
		const drive = new FakeDrive();
		const { teamId } = await teamWithData(drive, 1, "P11 Blå");
		await device().run(async () => {
			expect(await restored(drive)).toEqual({
				downloaded: 2,
				notesChanged: true,
				squadRestored: true,
				ignored: 0,
			});
			expect(activeTeamId()).toBe(teamId);
			expect(listTeams()).toEqual([{ id: teamId, name: "P11 Blå" }]);
			expect(
				loadMatchFiles()
					.map((m) => m.audit.matchId)
					.sort(),
			).toEqual(["m1a", "m1b"]);
			expect(loadDraft().players.map((p) => p.name)).toEqual(["Spelare1"]);
			expect(loadPlayerNotes().players[0]?.development[0]?.note).toBe(
				"Anteckning 1",
			);
		});
	});

	it("finds nothing new when restoring again", async () => {
		const drive = new FakeDrive();
		await teamWithData(drive, 1);
		await device().run(async () => {
			await restored(drive);
			expect(await restored(drive)).toEqual(NOTHING_NEW);
		});
	});

	it("has nothing to do with an empty root", async () => {
		await device().run(async () => {
			const before = activeTeamId();
			expect(await restored(new FakeDrive())).toEqual(NOTHING_NEW);
			expect(activeTeamId()).toBe(before);
		});
	});

	it("asks which team when the root holds several, changing nothing until one is chosen", async () => {
		const drive = new FakeDrive();
		const blue = await teamWithData(drive, 1, "P11 Blå");
		const red = await teamWithData(drive, 5, "F12 Röd");
		await device().run(async () => {
			const before = activeTeamId();
			const outcome: RestoreOutcome = await backupOf(drive).restore(
				ROOT,
				PASSWORD,
			);
			expect(outcome).toEqual({
				kind: "choose",
				teams: [
					{ teamId: red.teamId, name: "F12 Röd" },
					{ teamId: blue.teamId, name: "P11 Blå" },
				],
			});
			expect(activeTeamId()).toBe(before);
			expect(loadMatchFiles()).toEqual([]);

			expect(await restored(drive, PASSWORD, red.teamId)).toMatchObject({
				downloaded: 2,
				squadRestored: true,
			});
			expect(activeTeamId()).toBe(red.teamId);
			expect(listTeams()[0]?.name).toBe("F12 Röd");
			expect(
				loadMatchFiles()
					.map((m) => m.audit.matchId)
					.sort(),
			).toEqual(["m5a", "m5b"]);
			expect(loadDraft().players.map((p) => p.name)).toEqual(["Spelare5"]);
		});
		// The other team's folder is untouched.
		const blueFolder = drive.folderId(ROOT, teamFolderName(blue.teamId)) ?? "";
		expect(drive.names(blueFolder)).toHaveLength(5);
	});

	it("asks again when the chosen team is not one of the choices", async () => {
		const drive = new FakeDrive();
		await teamWithData(drive, 1);
		await teamWithData(drive, 5);
		await device().run(async () => {
			const outcome = await backupOf(drive).restore(
				ROOT,
				PASSWORD,
				"11111111-2222-4333-8444-555555555555",
			);
			expect(outcome.kind).toBe("choose");
		});
	});

	it("does not offer teams, or change anything, when the password is wrong", async () => {
		const drive = new FakeDrive();
		await teamWithData(drive, 1);
		await teamWithData(drive, 5);
		await device().run(async () => {
			const before = activeTeamId();
			await expect(backupOf(drive).restore(ROOT, "fel")).rejects.toBeInstanceOf(
				SecurePackageError,
			);
			expect(activeTeamId()).toBe(before);
		});
		const lone = new FakeDrive();
		await teamWithData(lone, 1);
		await device().run(async () => {
			const before = activeTeamId();
			await expect(backupOf(lone).restore(ROOT, "fel")).rejects.toBeInstanceOf(
				SecurePackageError,
			);
			expect(activeTeamId()).toBe(before);
		});
	});
});

describe("Drive restore - a team that has data", () => {
	it("restores from its own subfolder, whatever else is in the root", async () => {
		const drive = new FakeDrive();
		const own = await teamWithData(drive, 1);
		await teamWithData(drive, 5);
		await own.phone.run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "local-only", seed: 9 })]);
			expect(await restored(drive)).toEqual(NOTHING_NEW);
			expect(
				loadMatchFiles()
					.map((m) => m.audit.matchId)
					.sort(),
			).toEqual(["local-only", "m1a", "m1b"]);
		});
	});

	it("is refused another team's folder, and nothing changes", async () => {
		const drive = new FakeDrive();
		await teamWithData(drive, 1);
		await device().run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "mine", seed: 7 })]);
			await expect(
				backupOf(drive).restore(ROOT, PASSWORD),
			).rejects.toMatchObject({ reason: "otherTeam" });
			expect(loadMatchFiles().map((m) => m.audit.matchId)).toEqual(["mine"]);
		});
	});

	it("can still back up into the same root, in a subfolder of its own", async () => {
		const drive = new FakeDrive();
		await teamWithData(drive, 1);
		await device().run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "mine", seed: 7 })]);
			await backupOf(drive).backup(ROOT, PASSWORD);
			expect(drive.folderNames(ROOT)).toHaveLength(2);
		});
	});

	it("keeps a squad this phone already has when its own folder is restored", async () => {
		const drive = new FakeDrive();
		const own = await teamWithData(drive, 1);
		await own.phone.run(async () => {
			saveDraft(
				newRoster({
					formatId: "7v7:2-3-1",
					players: [{ id: "q", name: "Eget" }],
				}),
			);
			await restored(drive);
			expect(loadDraft().players.map((p) => p.name)).toEqual(["Eget"]);
		});
	});

	it("refuses an id another team on this phone already has", async () => {
		const drive = new FakeDrive();
		const own = await teamWithData(drive, 1);
		await own.phone.run(async () => {
			const first = activeTeamId();
			createTeam("Nytt lag");
			await expect(
				backupOf(drive).restore(ROOT, PASSWORD),
			).rejects.toMatchObject({
				reason: "belongsToOtherLocalTeam",
			});
			switchTeam(first);
		});
	});
});

describe("Drive - two phones writing at once", () => {
	async function twoPhones() {
		const drive = new FakeDrive();
		const a = device();
		const b = device();
		await a.run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			await backupOf(drive).backup(ROOT, PASSWORD);
		});
		await b.run(() => restored(drive));
		return { drive, a, b };
	}

	it("ends with every note from both, the same on both phones", async () => {
		const { drive, a, b } = await twoPhones();
		await a.run(async () => {
			savePlayerNotes(note("alva", "Från A"));
			await backupOf(drive).backup(ROOT, PASSWORD);
		});
		await b.run(async () => {
			savePlayerNotes(note("alva", "Från B"));
			await backupOf(drive).backup(ROOT, PASSWORD);
		});
		await a.run(() => restored(drive));
		await b.run(() => restored(drive));
		const texts = (d: Device) =>
			d.run(() => loadPlayerNotes().players[0]?.development.map((n) => n.note));
		expect(await texts(a)).toEqual(["Från A", "Från B"]);
		expect(await texts(b)).toEqual(await texts(a));
		const folder = drive.folderId(ROOT, drive.folderNames(ROOT)[0] ?? "") ?? "";
		expect(
			drive.names(folder).filter((n) => n.startsWith("notes-")),
		).toHaveLength(2);
	});

	it("keeps availability from both phones too", async () => {
		const { drive, a, b } = await twoPhones();
		await a.run(async () => {
			savePlayerNotes(
				withAvailability(EMPTY_PLAYER_NOTES_FILE, "alva", {
					matchId: "m1",
					status: "absent",
					reason: "injury",
				}),
			);
			await backupOf(drive).backup(ROOT, PASSWORD);
		});
		await b.run(async () => {
			await restored(drive);
			expect(loadPlayerNotes().players[0]?.availability[0]?.reason).toBe(
				"injury",
			);
		});
	});
});

describe("Drive restore - files inside a team folder that are not the team's", () => {
	async function seeded() {
		const drive = new FakeDrive();
		const { teamId } = await teamWithData(drive, 1);
		const folder = drive.folderId(ROOT, teamFolderName(teamId)) ?? "";
		return { drive, teamId, folder };
	}

	it("ignores a match from another team that was dropped in", async () => {
		const { drive, folder } = await seeded();
		const otherTeam = "0e5b7c1d-72a4-4d0e-8f3b-5c9d1a2e4f60";
		const intruder = await encryptJson(PASSWORD, {
			schemaVersion: 1,
			kind: "match",
			teamId: otherTeam,
			match: makeMatchFile({ matchId: "x1", seed: 5 }),
		});
		drive.files.set("intruder", {
			name: await driveFileName("match", otherTeam, "x1"),
			folderId: folder,
			contents: securePackageToJson(intruder),
		});
		await device().run(async () => {
			const result = await restored(drive);
			expect(result.ignored).toBe(1);
			expect(result.downloaded).toBe(2);
			expect(
				loadMatchFiles()
					.map((m) => m.audit.matchId)
					.sort(),
			).toEqual(["m1a", "m1b"]);
		});
	});

	it("ignores a file that was renamed to another name", async () => {
		const { drive, folder } = await seeded();
		for (const file of drive.files.values()) {
			if (file.folderId === folder && file.name.startsWith("match-")) {
				file.name = `match-${"0".repeat(8)}-0000-5000-8000-${"0".repeat(12)}.json`;
			}
		}
		await device().run(async () => {
			expect(await restored(drive)).toMatchObject({
				downloaded: 0,
				ignored: 2,
			});
		});
	});
});
