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
	DriveMarkerError,
	PasswordTooShortError,
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
	createTeamWithId,
	listTeams,
	renameTeam,
	switchTeam,
} from "../src/ui/teamStorage.js";
import { FakeDrive } from "./support/fakeDrive.js";
import { makeMatchFile, withSwap } from "./support/matchFiles.js";
import { MemoryStorage } from "./support/memoryStorage.js";

const ROOT = "root-1";
const PASSWORD = "hemligt-lösenord";

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
async function teamWithData(
	drive: FakeDrive,
	seed: number,
	name?: string,
	password = PASSWORD,
) {
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
		await backupOf(drive).backup(ROOT, password);
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

describe("Drive restore - another team's folder than the one with data (#154)", () => {
	/** A phone with one local match, facing a root that holds `drive`'s team. */
	async function laptopFacingAPhoneTeam() {
		const drive = new FakeDrive();
		const phoneTeam = await teamWithData(drive, 1, "P11 Blå");
		const laptop = device();
		await laptop.run(() => {
			keepMatchFiles([makeMatchFile({ matchId: "laptop", seed: 7 })]);
		});
		return { drive, phoneTeam, laptop };
	}

	async function differentTeam(
		drive: FakeDrive,
		password = PASSWORD,
		teamId?: string,
	) {
		const outcome = await backupOf(drive).restore(ROOT, password, teamId);
		if (outcome.kind !== "different-team") {
			throw new Error(`expected a different team, got ${outcome.kind}`);
		}
		return outcome;
	}

	it("shows the numbers and changes nothing until one of the two choices is picked", async () => {
		const { drive, phoneTeam, laptop } = await laptopFacingAPhoneTeam();
		await laptop.run(async () => {
			const before = activeTeamId();
			expect(await differentTeam(drive)).toEqual({
				kind: "different-team",
				teamId: phoneTeam.teamId,
				name: "P11 Blå",
				counts: { local: 1, incoming: 2, merged: 3 },
			});
			expect(activeTeamId()).toBe(before);
			expect(listTeams()).toHaveLength(1);
			expect(loadMatchFiles().map((m) => m.audit.matchId)).toEqual(["laptop"]);
		});
	});

	it("counts a match both sides have once", async () => {
		const { drive, phoneTeam, laptop } = await laptopFacingAPhoneTeam();
		await laptop.run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1a", seed: 1 })]);
			expect((await differentTeam(drive)).counts).toEqual({
				local: 2,
				incoming: 2,
				merged: 3,
			});
			expect(phoneTeam.teamId).not.toBe(activeTeamId());
		});
	});

	it('"new" makes a new team with the folder\'s id and name and leaves the existing team exactly as it was', async () => {
		const { drive, phoneTeam, laptop } = await laptopFacingAPhoneTeam();
		await laptop.run(async () => {
			const mine = activeTeamId();
			const mineName = listTeams()[0]?.name;
			const outcome = await backupOf(drive).restore(
				ROOT,
				PASSWORD,
				undefined,
				"new",
			);
			expect(outcome).toMatchObject({ kind: "restored", downloaded: 2 });
			expect(activeTeamId()).toBe(phoneTeam.teamId);
			expect(listTeams().map((t) => [t.id, t.name])).toEqual([
				[mine, mineName],
				[phoneTeam.teamId, "P11 Blå"],
			]);
			expect(
				loadMatchFiles()
					.map((m) => m.audit.matchId)
					.sort(),
			).toEqual(["m1a", "m1b"]);
			switchTeam(mine);
			expect(loadMatchFiles().map((m) => m.audit.matchId)).toEqual(["laptop"]);
		});
	});

	it('"merge" keeps every local match, adds the folder\'s, takes on its id, and the next backup goes to the same folder', async () => {
		const { drive, phoneTeam, laptop } = await laptopFacingAPhoneTeam();
		await laptop.run(async () => {
			const name = listTeams()[0]?.name;
			const outcome = await backupOf(drive).restore(
				ROOT,
				PASSWORD,
				undefined,
				"merge",
			);
			expect(outcome).toMatchObject({ kind: "restored", downloaded: 2 });
			expect(listTeams()).toHaveLength(1);
			expect(activeTeamId()).toBe(phoneTeam.teamId);
			expect(listTeams()[0]?.name).toBe(name);
			expect(
				loadMatchFiles()
					.map((m) => m.audit.matchId)
					.sort(),
			).toEqual(["laptop", "m1a", "m1b"]);

			const backup = await backupOf(drive).backup(ROOT, PASSWORD);
			expect(backup.uploaded).toBe(1);
			expect(drive.folderNames(ROOT)).toHaveLength(1);
		});
	});

	it("is refused when another team on this device already has the folder's id, and nothing changes", async () => {
		const { drive, phoneTeam, laptop } = await laptopFacingAPhoneTeam();
		await laptop.run(async () => {
			const mine = activeTeamId();
			createTeamWithId(phoneTeam.teamId, "Redan här");
			switchTeam(mine);
			await expect(
				backupOf(drive).restore(ROOT, PASSWORD, undefined, "merge"),
			).rejects.toMatchObject({ reason: "belongsToOtherLocalTeam" });
			expect(activeTeamId()).toBe(mine);
			expect(loadMatchFiles().map((m) => m.audit.matchId)).toEqual(["laptop"]);
		});
	});

	it("gives a wrong password the wrong-password error and changes nothing", async () => {
		const { drive, laptop } = await laptopFacingAPhoneTeam();
		await laptop.run(async () => {
			const before = activeTeamId();
			await expect(
				backupOf(drive).restore(ROOT, "fel-lösenord", undefined, "merge"),
			).rejects.toBeInstanceOf(SecurePackageError);
			expect(activeTeamId()).toBe(before);
			expect(listTeams()).toHaveLength(1);
		});
	});

	it("asks which team first when several folders qualify, then which of the two choices", async () => {
		const { drive, phoneTeam, laptop } = await laptopFacingAPhoneTeam();
		const red = await teamWithData(drive, 5, "F12 Röd");
		await laptop.run(async () => {
			const outcome = await backupOf(drive).restore(ROOT, PASSWORD);
			expect(outcome).toEqual({
				kind: "choose",
				teams: [
					{ teamId: red.teamId, name: "F12 Röd" },
					{ teamId: phoneTeam.teamId, name: "P11 Blå" },
				],
			});
			expect((await differentTeam(drive, PASSWORD, red.teamId)).name).toBe(
				"F12 Röd",
			);
			expect(listTeams()).toHaveLength(1);
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

describe("Drive - the coach's notes on deviations (#171)", () => {
	const LIMITED = {
		kind: "limited",
		substitutesIn: 5,
		occasions: 3,
		reEntry: false,
	} as const;
	const explain = (eventId: string, text: string) => ({
		matchId: "m1",
		eventId,
		note: text,
		writtenAt: "2026-09-05T13:00:00.000Z",
	});
	const notesOn = (d: Device) =>
		d.run(() => loadMatchFiles()[0]?.deviationNotes.map((n) => n.note));

	it("brings a note written after the first backup to the other phone, and both phones' notes together", async () => {
		const drive = new FakeDrive();
		const a = device();
		const b = device();
		const match = withSwap(makeMatchFile({ matchId: "m1" }));
		match.setup.substitutions = LIMITED;
		const firstSwap = match.timeline[2];
		if (firstSwap?.type !== "substitution") throw new Error("no swap");
		match.timeline.splice(3, 0, { ...firstSwap, id: "swap-2" });
		await a.run(async () => {
			keepMatchFiles([match]);
			await backupOf(drive).backup(ROOT, PASSWORD);
		});
		await b.run(() => restored(drive));

		await a.run(async () => {
			keepMatchFiles([
				{ ...match, deviationNotes: [explain("swap-1", "Från A")] },
			]);
			await backupOf(drive).backup(ROOT, PASSWORD);
		});
		await b.run(async () => {
			keepMatchFiles([
				{ ...match, deviationNotes: [explain("swap-2", "Från B")] },
			]);
			await backupOf(drive).backup(ROOT, PASSWORD);
		});
		await a.run(() => restored(drive));

		expect(await notesOn(a)).toEqual(["Från A", "Från B"]);
		expect(await notesOn(b)).toEqual(["Från A", "Från B"]);
	});

	it("does not read a match with free swaps again", async () => {
		const drive = new FakeDrive();
		const a = device();
		await a.run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			await backupOf(drive).backup(ROOT, PASSWORD);
			const matchIds = [...drive.files]
				.filter(([, f]) => f.name.startsWith("match-"))
				.map(([id]) => id);
			const client = drive.client();
			const read: string[] = [];
			await createDriveBackup({
				...client,
				downloadJson: (id) => {
					read.push(id);
					return client.downloadJson(id);
				},
			}).restore(ROOT, PASSWORD);
			expect(matchIds).toHaveLength(1);
			expect(read).not.toContain(matchIds[0]);
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

describe("Drive restore - teams with different passwords share one root (#147)", () => {
	const BLUE_PW = "blå-lösenord-1";
	const P13_PW = "p13-lösenord-2";

	async function twoTeams() {
		const drive = new FakeDrive();
		const blue = await teamWithData(drive, 1, "P11 Blå", BLUE_PW);
		const p13 = await teamWithData(drive, 5, "P13", P13_PW);
		return { drive, blue, p13 };
	}

	it("restores the team the password opens, straight away, without asking and without touching the other", async () => {
		const { drive, blue, p13 } = await twoTeams();
		const p13Folder = drive.folderId(ROOT, teamFolderName(p13.teamId)) ?? "";
		const p13Before = JSON.stringify(
			[...drive.files].filter(([, f]) => f.folderId === p13Folder),
		);
		await device().run(async () => {
			expect(await restored(drive, BLUE_PW)).toMatchObject({
				downloaded: 2,
				squadRestored: true,
			});
			expect(activeTeamId()).toBe(blue.teamId);
			expect(listTeams()[0]?.name).toBe("P11 Blå");
			expect(
				loadMatchFiles()
					.map((m) => m.audit.matchId)
					.sort(),
			).toEqual(["m1a", "m1b"]);
		});
		expect(
			JSON.stringify(
				[...drive.files].filter(([, f]) => f.folderId === p13Folder),
			),
		).toBe(p13Before);
	});

	it("restores the other team with the other password", async () => {
		const { drive, p13 } = await twoTeams();
		await device().run(async () => {
			await restored(drive, P13_PW);
			expect(activeTeamId()).toBe(p13.teamId);
			expect(listTeams()[0]?.name).toBe("P13");
			expect(
				loadMatchFiles()
					.map((m) => m.audit.matchId)
					.sort(),
			).toEqual(["m5a", "m5b"]);
		});
	});

	it("gives a password that opens no team the wrong-password error, and changes nothing", async () => {
		const { drive } = await twoTeams();
		await device().run(async () => {
			const before = { id: activeTeamId(), name: listTeams()[0]?.name };
			await expect(
				backupOf(drive).restore(ROOT, "gissning-1234"),
			).rejects.toBeInstanceOf(SecurePackageError);
			expect({ id: activeTeamId(), name: listTeams()[0]?.name }).toEqual(
				before,
			);
			expect(loadMatchFiles()).toEqual([]);
			expect(loadDraft().players).toEqual([]);
		});
	});

	it("asks only between the teams the password opens", async () => {
		const drive = new FakeDrive();
		const a = await teamWithData(drive, 1, "P11 Blå", BLUE_PW);
		const b = await teamWithData(drive, 5, "F12 Röd", BLUE_PW);
		await teamWithData(drive, 9, "P13", P13_PW);
		await device().run(async () => {
			const outcome = await backupOf(drive).restore(ROOT, BLUE_PW);
			expect(outcome).toEqual({
				kind: "choose",
				teams: [
					{ teamId: b.teamId, name: "F12 Röd" },
					{ teamId: a.teamId, name: "P11 Blå" },
				],
			});
		});
	});

	it("never offers a team the password does not open, even by name", async () => {
		const { drive, p13 } = await twoTeams();
		await device().run(async () => {
			const outcome = await backupOf(drive).restore(ROOT, BLUE_PW);
			expect(JSON.stringify(outcome)).not.toContain(p13.teamId);
			expect(JSON.stringify(outcome)).not.toContain("P13");
		});
	});

	it("lets a team that has its own folder restore whatever the others use", async () => {
		const { drive, blue } = await twoTeams();
		await blue.phone.run(async () => {
			expect(await restored(drive, BLUE_PW)).toEqual(NOTHING_NEW);
		});
	});

	it("does not hide a marker that opens but is not a valid marker for its folder", async () => {
		const { drive, blue, p13 } = await twoTeams();
		// P13's folder now holds a marker that decrypts with P13's password
		// but names the wrong team: that is damage, not "a different password".
		const folder = drive.folderId(ROOT, teamFolderName(p13.teamId)) ?? "";
		for (const file of drive.files.values()) {
			if (file.folderId === folder && file.name === `team-${p13.teamId}.json`) {
				file.contents = securePackageToJson(
					await encryptJson(P13_PW, {
						schemaVersion: 1,
						kind: "team",
						teamId: blue.teamId,
						teamName: "Fel",
					}),
				);
			}
		}
		await device().run(async () => {
			await expect(
				backupOf(drive).restore(ROOT, P13_PW),
			).rejects.toBeInstanceOf(DriveMarkerError);
		});
	});
});

describe("Drive backup - the password a team's folder is first made with (#147)", () => {
	it("refuses a password shorter than the minimum when the team's folder would be created, and writes nothing", async () => {
		const drive = new FakeDrive();
		await device().run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			await expect(backupOf(drive).backup(ROOT, "kort")).rejects.toBeInstanceOf(
				PasswordTooShortError,
			);
			await expect(
				backupOf(drive).backup(ROOT, "x".repeat(9)),
			).rejects.toBeInstanceOf(PasswordTooShortError);
		});
		expect(drive.folders.size).toBe(0);
		expect(drive.files.size).toBe(0);
	});

	it("accepts a password of exactly the minimum length", async () => {
		const drive = new FakeDrive();
		await device().run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			expect(
				(await backupOf(drive).backup(ROOT, "x".repeat(10))).uploaded,
			).toBe(1);
		});
	});

	it("counts characters, not bytes, so a password in åäö is not penalised", async () => {
		const drive = new FakeDrive();
		await device().run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			await expect(
				backupOf(drive).backup(ROOT, "ååååååååå"),
			).rejects.toBeInstanceOf(PasswordTooShortError);
			expect((await backupOf(drive).backup(ROOT, "åååååååååå")).uploaded).toBe(
				1,
			);
		});
	});

	it("still lets a team whose folder already exists back up and restore with the password it was made with", async () => {
		const drive = new FakeDrive();
		const phone = device();
		let teamId = "";
		await phone.run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
			teamId = activeTeamId();
		});
		// A folder from before the minimum existed: made with a short password.
		const folder = await drive
			.client()
			.createFolder(ROOT, teamFolderName(teamId));
		await drive.client().createFile(
			folder,
			`team-${teamId}.json`,
			securePackageToJson(
				await encryptJson("kort", {
					schemaVersion: 1,
					kind: "team",
					teamId,
					teamName: "Mitt lag",
				}),
			),
		);
		await phone.run(async () => {
			keepMatchFiles([makeMatchFile({ matchId: "m2", seed: 2 })]);
			expect((await backupOf(drive).backup(ROOT, "kort")).uploaded).toBe(2);
		});
		await device().run(async () => {
			expect(await restored(drive, "kort")).toMatchObject({ downloaded: 2 });
		});
	});

	it("does not apply the minimum to a restore", async () => {
		const drive = new FakeDrive();
		await teamWithData(drive, 1);
		await device().run(async () => {
			await expect(
				backupOf(drive).restore(ROOT, "kort"),
			).rejects.toBeInstanceOf(SecurePackageError);
		});
	});
});
