import { describe, expect, it, vi } from "vitest";
import { driveFileName } from "../src/core/driveNames.js";
import {
	EMPTY_PLAYER_NOTES_FILE,
	withAvailability,
	withDevelopment,
} from "../src/core/playerNotes.js";
import {
	encryptJson,
	SecurePackageError,
	securePackageToJson,
} from "../src/core/securePackage.js";
import { newRoster } from "../src/core/storage.js";
import { loadDraft, saveDraft } from "../src/ui/draftStorage.js";
import { createDriveBackup, DriveFolderError } from "../src/ui/driveBackup.js";
import { keepMatchFiles, loadMatchFiles } from "../src/ui/matchFileStorage.js";
import {
	loadPlayerNotes,
	savePlayerNotes,
} from "../src/ui/playerNotesStorage.js";
import {
	activeTeamId,
	createTeam,
	listTeams,
	switchTeam,
} from "../src/ui/teamStorage.js";
import { FakeDrive } from "./support/fakeDrive.js";
import { makeMatchFile } from "./support/matchFiles.js";
import { MemoryStorage } from "./support/memoryStorage.js";

const FOLDER = "folder-1";
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

const backupOf = (drive: FakeDrive) => createDriveBackup(drive.client());
const note = (key: string, text: string) =>
	withDevelopment(loadPlayerNotes(), key, {
		date: "2026-09-01",
		area: "physical",
		note: text,
	});

describe("Drive backup - what is written", () => {
	it("writes a team marker and one match file named only by ids", async () => {
		const drive = new FakeDrive();
		const a = device();
		await a.run(async () => {
			keepMatchFiles([
				makeMatchFile({
					matchId: "m1",
					opponent: "Vinslövs IF",
					names: ["Alva", "Bo", "Cleo", "Dino", "Ebba", "Filip", "Greta"],
				}),
			]);
			const result = await backupOf(drive).backup(FOLDER, PASSWORD);
			expect(result).toEqual({ uploaded: 1, stateSaved: false });
			const teamId = activeTeamId();
			expect(drive.names(FOLDER)).toEqual(
				[
					`team-${teamId}.json`,
					await driveFileName("match", teamId, "m1"),
				].sort(),
			);
		});
		const everything = [...drive.files.values()]
			.map((f) => f.name + f.contents)
			.join("\n");
		for (const secret of ["Vinslövs", "Alva", "Mitt lag"]) {
			expect(everything).not.toContain(secret);
		}
	});

	it("uploads nothing the second time", async () => {
		const drive = new FakeDrive();
		await device().run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			await backupOf(drive).backup(FOLDER, PASSWORD);
			const creates = drive.creates;
			expect(await backupOf(drive).backup(FOLDER, PASSWORD)).toEqual({
				uploaded: 0,
				stateSaved: false,
			});
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
			expect((await backupOf(drive).backup(FOLDER, PASSWORD)).stateSaved).toBe(
				true,
			);
			expect((await backupOf(drive).backup(FOLDER, PASSWORD)).stateSaved).toBe(
				false,
			);
			savePlayerNotes(note("alva", "Modigare"));
			expect((await backupOf(drive).backup(FOLDER, PASSWORD)).stateSaved).toBe(
				true,
			);
			// Its own file was updated in place, not duplicated.
			expect(
				drive.names(FOLDER).filter((n) => n.startsWith("notes-")),
			).toHaveLength(1);
		});
	});
});

describe("Drive restore - a second device", () => {
	async function seeded() {
		const drive = new FakeDrive();
		const a = device();
		let teamId = "";
		await a.run(async () => {
			keepMatchFiles([
				makeMatchFile({ matchId: "m1", seed: 1 }),
				makeMatchFile({ matchId: "m2", seed: 2 }),
			]);
			saveDraft(
				newRoster({
					formatId: "7v7:2-3-1",
					players: [{ id: "p1", name: "Alva" }],
				}),
			);
			savePlayerNotes(note("alva", "Snabbare"));
			await backupOf(drive).backup(FOLDER, PASSWORD);
			teamId = activeTeamId();
		});
		return { drive, a, teamId };
	}

	it("takes on the folder's team id and gets the matches, squad and notes", async () => {
		const { drive, teamId } = await seeded();
		const b = device();
		await b.run(async () => {
			const result = await backupOf(drive).restore(FOLDER, PASSWORD);
			expect(result).toEqual({
				downloaded: 2,
				notesChanged: true,
				squadRestored: true,
				ignored: 0,
			});
			expect(activeTeamId()).toBe(teamId);
			expect(
				loadMatchFiles()
					.map((m) => m.audit.matchId)
					.sort(),
			).toEqual(["m1", "m2"]);
			expect(loadDraft().players.map((p) => p.name)).toEqual(["Alva"]);
			expect(loadPlayerNotes().players[0]?.development[0]?.note).toBe(
				"Snabbare",
			);
			expect(listTeams()).toHaveLength(1);
		});
	});

	it("finds nothing new when restoring again", async () => {
		const { drive } = await seeded();
		await device().run(async () => {
			await backupOf(drive).restore(FOLDER, PASSWORD);
			expect(await backupOf(drive).restore(FOLDER, PASSWORD)).toEqual({
				downloaded: 0,
				notesChanged: false,
				squadRestored: false,
				ignored: 0,
			});
		});
	});

	it("keeps a squad this device already has", async () => {
		const { drive } = await seeded();
		await device().run(async () => {
			saveDraft(
				newRoster({
					formatId: "7v7:2-3-1",
					players: [{ id: "q", name: "Eget" }],
				}),
			);
			// Not empty (it has a squad), so it cannot take the folder's team id.
			await expect(
				backupOf(drive).restore(FOLDER, PASSWORD),
			).rejects.toMatchObject({ reason: "otherTeam" });
			expect(loadDraft().players.map((p) => p.name)).toEqual(["Eget"]);
		});
	});

	it("does not take the team id when the password is wrong", async () => {
		const { drive } = await seeded();
		await device().run(async () => {
			const before = activeTeamId();
			await expect(
				backupOf(drive).restore(FOLDER, "fel"),
			).rejects.toBeInstanceOf(SecurePackageError);
			expect(activeTeamId()).toBe(before);
		});
	});

	it("refuses an id another team on this device already has", async () => {
		const { drive, a } = await seeded();
		// Same phone as the one that backed up: its first team has the folder's id.
		await a.run(async () => {
			const first = activeTeamId();
			createTeam("Nytt lag");
			await expect(
				backupOf(drive).restore(FOLDER, PASSWORD),
			).rejects.toMatchObject({
				reason: "belongsToOtherLocalTeam",
			});
			switchTeam(first);
		});
	});
});

describe("Drive - two devices writing at once", () => {
	it("ends with every note from both, the same on both devices", async () => {
		const drive = new FakeDrive();
		const a = device();
		const b = device();
		await a.run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			await backupOf(drive).backup(FOLDER, PASSWORD);
		});
		await b.run(() => backupOf(drive).restore(FOLDER, PASSWORD));

		await a.run(async () => {
			savePlayerNotes(note("alva", "Från A"));
			await backupOf(drive).backup(FOLDER, PASSWORD);
		});
		await b.run(async () => {
			savePlayerNotes(note("alva", "Från B"));
			await backupOf(drive).backup(FOLDER, PASSWORD);
		});
		await a.run(() => backupOf(drive).restore(FOLDER, PASSWORD));
		await b.run(() => backupOf(drive).restore(FOLDER, PASSWORD));

		const texts = async (d: ReturnType<typeof device>) =>
			d.run(() => loadPlayerNotes().players[0]?.development.map((n) => n.note));
		expect(await texts(a)).toEqual(["Från A", "Från B"]);
		expect(await texts(b)).toEqual(await texts(a));
		expect(
			drive.names(FOLDER).filter((n) => n.startsWith("notes-")),
		).toHaveLength(2);
	});

	it("keeps availability from both devices too", async () => {
		const drive = new FakeDrive();
		const a = device();
		const b = device();
		await a.run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			await backupOf(drive).backup(FOLDER, PASSWORD);
		});
		await b.run(() => backupOf(drive).restore(FOLDER, PASSWORD));
		await a.run(async () => {
			savePlayerNotes(
				withAvailability(EMPTY_PLAYER_NOTES_FILE, "alva", {
					matchId: "m1",
					status: "absent",
					reason: "injury",
				}),
			);
			await backupOf(drive).backup(FOLDER, PASSWORD);
		});
		await b.run(async () => {
			await backupOf(drive).restore(FOLDER, PASSWORD);
			expect(loadPlayerNotes().players[0]?.availability[0]?.reason).toBe(
				"injury",
			);
		});
	});
});

describe("Drive - two coaches never mix teams", () => {
	it("a coach whose team has data cannot back it up into another coach's folder", async () => {
		const drive = new FakeDrive();
		await device().run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			await backupOf(drive).backup(FOLDER, PASSWORD);
		});
		const before = drive.names(FOLDER);
		await device().run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m9", seed: 9 })]);
			await expect(
				backupOf(drive).backup(FOLDER, PASSWORD),
			).rejects.toBeInstanceOf(DriveFolderError);
		});
		expect(drive.names(FOLDER)).toEqual(before);
	});

	it("two teams with the same name still get different files for the same match id", async () => {
		const drive = new FakeDrive();
		for (const _ of [1, 2]) {
			await device().run(async () => {
				keepMatchFiles([makeMatchFile({ matchId: "same" })]);
				await backupOf(drive).backup(`folder-${_}`, PASSWORD);
			});
		}
		const [one, two] = [drive.names("folder-1"), drive.names("folder-2")];
		expect(one.filter((n) => n.startsWith("match-"))).not.toEqual(
			two.filter((n) => n.startsWith("match-")),
		);
	});

	it("ignores a file from another team that was dropped into the folder", async () => {
		const drive = new FakeDrive();
		const a = device();
		await a.run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			await backupOf(drive).backup(FOLDER, PASSWORD);
		});
		// Another team's match, encrypted with the same password, copied in.
		const otherTeam = "0e5b7c1d-72a4-4d0e-8f3b-5c9d1a2e4f60";
		const intruder = await encryptJson(PASSWORD, {
			schemaVersion: 1,
			kind: "match",
			teamId: otherTeam,
			match: makeMatchFile({ matchId: "x1", seed: 5 }),
		});
		drive.files.set("intruder", {
			name: await driveFileName("match", otherTeam, "x1"),
			folderId: FOLDER,
			contents: securePackageToJson(intruder),
		});
		await device().run(async () => {
			const result = await backupOf(drive).restore(FOLDER, PASSWORD);
			expect(result.ignored).toBe(1);
			expect(result.downloaded).toBe(1);
			expect(loadMatchFiles().map((m) => m.audit.matchId)).toEqual(["m1"]);
		});
	});

	it("ignores a file that was renamed to another name", async () => {
		const drive = new FakeDrive();
		await device().run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			await backupOf(drive).backup(FOLDER, PASSWORD);
		});
		for (const file of drive.files.values()) {
			if (file.name.startsWith("match-"))
				file.name = `match-${"0".repeat(8)}-0000-5000-8000-${"0".repeat(12)}.json`;
		}
		await device().run(async () => {
			const result = await backupOf(drive).restore(FOLDER, PASSWORD);
			expect(result).toMatchObject({ downloaded: 0, ignored: 1 });
		});
	});

	it("refuses a folder that holds two teams", async () => {
		const drive = new FakeDrive();
		for (let i = 0; i < 2; i++) {
			await device().run(async () => {
				keepMatchFiles([makeMatchFile({ matchId: `m${i}`, seed: i })]);
				// Both claim the folder as if at the same moment.
				await backupOf(new FakeDrive()).backup(FOLDER, PASSWORD);
			});
		}
		const first = new FakeDrive();
		const second = new FakeDrive();
		await device().run(() => backupOf(first).backup(FOLDER, PASSWORD));
		await device().run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "z" })]);
			await backupOf(second).backup(FOLDER, PASSWORD);
		});
		for (const [id, f] of second.files) drive.files.set(`b-${id}`, f);
		for (const [id, f] of first.files) drive.files.set(`a-${id}`, f);
		await device().run(async () => {
			await expect(
				backupOf(drive).restore(FOLDER, PASSWORD),
			).rejects.toMatchObject({ reason: "severalTeams" });
		});
	});

	it("restoring from a folder with no team marker changes nothing", async () => {
		await device().run(async () => {
			expect(await backupOf(new FakeDrive()).restore(FOLDER, PASSWORD)).toEqual(
				{
					downloaded: 0,
					notesChanged: false,
					squadRestored: false,
					ignored: 0,
				},
			);
		});
	});
});
