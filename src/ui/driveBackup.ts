import {
	driveFileName,
	parseTeamFolderName,
	teamFolderName,
	teamMarkerName,
} from "../core/driveNames.js";
import {
	type DrivePayload,
	parseDrivePayload,
	payloadFileName,
} from "../core/drivePayload.js";
import {
	chooseTeamFolder,
	classifyFolder,
	type DriveFileEntry,
	filesToRestore,
	matchesToBackUp,
	pickSquad,
	type TeamFolder,
} from "../core/driveSync.js";
import type { MatchFile } from "../core/matchFile.js";
import { mergePlayerNotes } from "../core/notesMerge.js";
import {
	decryptJson,
	encryptJson,
	parseSecurePackage,
	SecurePackageError,
	securePackageToJson,
} from "../core/securePackage.js";
import type { RosterFile } from "../core/storage.js";
import { deviceId } from "./deviceStorage.js";
import { loadDraft, saveDraft } from "./draftStorage.js";
import type { DriveClient } from "./driveClient.js";
import { keepMatchFiles, loadMatchFiles } from "./matchFileStorage.js";
import { loadPlayerNotes, savePlayerNotes } from "./playerNotesStorage.js";
import { activeTeamIsEmpty } from "./teamEmpty.js";
import {
	activeTeamId,
	activeTeamName,
	adoptTeamId,
	otherTeamIds,
} from "./teamStorage.js";

/**
 * Backup and restore (#56, #70, #135, #142), wiring the pure planning in
 * core/driveSync.ts to the Drive calls in driveClient.ts, this device's own
 * data, and the encryption in core/securePackage.ts (#81): every file is
 * encrypted with the coach's password, so a Drive folder shared between
 * coaches (chosen via drivePicker.ts) is safe without relying on Drive's
 * own access control.
 *
 * The coach picks one root folder. Each team keeps its files in a subfolder
 * of its own inside it, named by the team's id (core/driveNames.ts); every
 * file's name is built from that id too, every file's contents repeat it
 * (core/drivePayload.ts), and an encrypted team marker in the subfolder
 * holds the team's name. A restore on a device whose team is still empty
 * takes on the id and name of a team in the root - asking which, if there
 * are several; anything that would mix two teams is refused, and a file
 * that is not the team's is ignored.
 *
 * The password is never kept anywhere - not in appStorage, not on this
 * object - a coach types it in for each backup/restore call.
 */
export interface BackupResult {
	/** Matches uploaded. */
	uploaded: number;
	/** Whether this device's squad or notes were written. */
	stateSaved: boolean;
}

export interface RestoreResult {
	/** New matches kept on this device. */
	downloaded: number;
	/** Whether the notes on this device changed. */
	notesChanged: boolean;
	/** Whether a squad was taken because this device had none. */
	squadRestored: boolean;
	/** Files in the team's folder that are not its own, or not readable. */
	ignored: number;
}

/** A team in the root folder, for the coach to choose from. */
export interface TeamOption {
	teamId: string;
	/** "" if the team's marker has no name. */
	name: string;
}

export type RestoreOutcome =
	| ({ kind: "restored" } & RestoreResult)
	| { kind: "choose"; teams: TeamOption[] };

export interface DriveBackup {
	/** Upload what is not yet in this team's folder under `rootId`. */
	backup(rootId: string, password: string): Promise<BackupResult>;
	/**
	 * Take what this device lacks from the root folder. When several teams
	 * could be restored into an empty one the outcome is a choice; call
	 * again with the chosen `teamId`.
	 */
	restore(
		rootId: string,
		password: string,
		teamId?: string,
	): Promise<RestoreOutcome>;
}

/** Why a restore was refused; src/ui/text.ts turns it into a sentence. */
export type FolderProblem = "otherTeam" | "belongsToOtherLocalTeam";

export class DriveFolderError extends Error {
	constructor(readonly reason: FolderProblem) {
		super(`Drive folder refused: ${reason}`);
		this.name = "DriveFolderError";
	}
}

const NOTHING: RestoreResult = {
	downloaded: 0,
	notesChanged: false,
	squadRestored: false,
	ignored: 0,
};

export function createDriveBackup(client: DriveClient): DriveBackup {
	const seal = async (password: string, payload: DrivePayload) =>
		securePackageToJson(await encryptJson(password, payload));

	const open = async (
		password: string,
		fileId: string,
	): Promise<DrivePayload> =>
		parseDrivePayload(
			await decryptJson(
				password,
				parseSecurePackage(await client.downloadJson(fileId)),
			),
		);

	/** The payload in `entry`, if it is this team's and has the name it should. */
	async function ownPayload(
		password: string,
		entry: DriveFileEntry,
		teamId: string,
	): Promise<DrivePayload | null> {
		try {
			const payload = await open(password, entry.fileId);
			if (payload.teamId !== teamId) return null;
			if ((await payloadFileName(payload)) !== entry.name) return null;
			return payload;
		} catch {
			return null;
		}
	}

	/** Every team subfolder of the root; other folders are not ours. */
	async function teamFolders(rootId: string): Promise<TeamFolder[]> {
		const folders: TeamFolder[] = [];
		for (const folder of await client.listFolders(rootId)) {
			const teamId = parseTeamFolderName(folder.name);
			if (teamId !== null) folders.push({ teamId, folderId: folder.folderId });
		}
		return folders;
	}

	/** Write `payload` to `name`: create it, or update the file only if its contents changed. */
	async function writeOwn(
		folderId: string,
		existing: DriveFileEntry | undefined,
		name: string,
		payload: DrivePayload,
		password: string,
	): Promise<boolean> {
		if (existing) {
			const current = await open(password, existing.fileId);
			if (JSON.stringify(current) === JSON.stringify(payload)) return false;
			await client.updateFile(existing.fileId, await seal(password, payload));
			return true;
		}
		await client.createFile(folderId, name, await seal(password, payload));
		return true;
	}

	async function backup(
		rootId: string,
		password: string,
	): Promise<BackupResult> {
		// A team with nothing saved has nothing to put in Drive; do not clutter
		// the coach's root folder with an empty team folder.
		if (activeTeamIsEmpty()) return { uploaded: 0, stateSaved: false };
		const teamId = activeTeamId();
		// Two phones making this team's folder at the same moment leave two;
		// every phone uses the one that sorts first, so they converge.
		const own = (await teamFolders(rootId))
			.filter((folder) => folder.teamId === teamId)
			.sort((x, y) => (x.folderId < y.folderId ? -1 : 1))[0];
		const folderId =
			own?.folderId ??
			(await client.createFolder(rootId, teamFolderName(teamId)));
		const listing = classifyFolder(await client.listFiles(folderId));

		const marker = listing.markers.find((m) => m.teamId === teamId);
		await writeOwn(
			folderId,
			marker && { name: teamMarkerName(teamId), fileId: marker.fileId },
			teamMarkerName(teamId),
			{ schemaVersion: 1, kind: "team", teamId, teamName: activeTeamName() },
			password,
		);

		const localByName = new Map<string, MatchFile>();
		for (const match of loadMatchFiles()) {
			localByName.set(
				await driveFileName("match", teamId, match.audit.matchId),
				match,
			);
		}
		const toUpload = matchesToBackUp(
			localByName,
			new Set(listing.matches.map((entry) => entry.name)),
		);
		for (const match of toUpload) {
			const payload: DrivePayload = {
				schemaVersion: 1,
				kind: "match",
				teamId,
				match,
			};
			await client.createFile(
				folderId,
				await payloadFileName(payload),
				await seal(password, payload),
			);
		}

		const device = deviceId();
		let stateSaved = false;
		const roster = loadDraft();
		if (roster.players.length > 0) {
			const name = await driveFileName("squad", teamId, device);
			stateSaved =
				(await writeOwn(
					folderId,
					listing.squads.find((entry) => entry.name === name),
					name,
					{ schemaVersion: 1, kind: "squad", teamId, deviceId: device, roster },
					password,
				)) || stateSaved;
		}
		const playerNotes = loadPlayerNotes();
		if (playerNotes.players.length > 0) {
			const name = await driveFileName("notes", teamId, device);
			stateSaved =
				(await writeOwn(
					folderId,
					listing.notes.find((entry) => entry.name === name),
					name,
					{
						schemaVersion: 1,
						kind: "notes",
						teamId,
						deviceId: device,
						playerNotes,
					},
					password,
				)) || stateSaved;
		}
		return { uploaded: toUpload.length, stateSaved };
	}

	/** The marker of the team whose folder is `folder`, opened with the password. */
	async function openMarker(
		folder: TeamFolder,
		password: string,
	): Promise<{
		entries: ReturnType<typeof classifyFolder>;
		name: string;
	} | null> {
		const entries = classifyFolder(await client.listFiles(folder.folderId));
		const marker = entries.markers.find((m) => m.teamId === folder.teamId);
		if (marker === undefined) return null;
		// The marker is encrypted too: opening it proves the password before
		// anything on this device is changed, and proves it names this team.
		const payload = await open(password, marker.fileId);
		if (payload.kind !== "team" || payload.teamId !== folder.teamId) {
			throw new SecurePackageError("Marker does not match its folder", {
				code: "wrongPasswordOrTampered",
			});
		}
		return { entries, name: payload.teamName ?? "" };
	}

	/** Restore the team in `folder`, first taking on its id and name if `adopt`. */
	async function restoreFrom(
		folder: TeamFolder,
		password: string,
		adopt: boolean,
	): Promise<RestoreResult> {
		const opened = await openMarker(folder, password);
		// A folder with no marker yet (a backup still being written) has
		// nothing to verify the password against, so nothing is taken from it.
		if (opened === null) return NOTHING;
		if (adopt && !adoptTeamId(folder.teamId, opened.name)) {
			throw new DriveFolderError("belongsToOtherLocalTeam");
		}
		const teamId = activeTeamId();
		const listing = opened.entries;

		let ignored = 0;
		const localNames = new Set<string>();
		for (const match of loadMatchFiles()) {
			localNames.add(await driveFileName("match", teamId, match.audit.matchId));
		}
		const matches: MatchFile[] = [];
		for (const entry of filesToRestore(listing.matches, localNames)) {
			const payload = await ownPayload(password, entry, teamId);
			if (payload?.kind === "match") matches.push(payload.match);
			else ignored++;
		}

		let notes = loadPlayerNotes();
		const before = JSON.stringify(notes);
		for (const entry of listing.notes) {
			const payload = await ownPayload(password, entry, teamId);
			if (payload?.kind === "notes") {
				notes = mergePlayerNotes(notes, payload.playerNotes);
			} else ignored++;
		}
		const notesChanged = JSON.stringify(notes) !== before;
		if (notesChanged) savePlayerNotes(notes);

		const squads: RosterFile[] = [];
		for (const entry of listing.squads) {
			const payload = await ownPayload(password, entry, teamId);
			if (payload?.kind === "squad") squads.push(payload.roster);
			else ignored++;
		}
		const squad = pickSquad(squads);
		const squadRestored = squad !== null && loadDraft().players.length === 0;
		if (squadRestored && squad) saveDraft(squad);

		const { newMatches } = keepMatchFiles(matches);
		return { downloaded: newMatches, notesChanged, squadRestored, ignored };
	}

	async function restore(
		rootId: string,
		password: string,
		chosenTeamId?: string,
	): Promise<RestoreOutcome> {
		const choice = chooseTeamFolder({
			localTeamId: activeTeamId(),
			localIsEmpty: activeTeamIsEmpty(),
			otherLocalTeamIds: otherTeamIds(),
			folders: await teamFolders(rootId),
		});
		switch (choice.action) {
			case "none":
				return { kind: "restored", ...NOTHING };
			case "refuse":
				throw new DriveFolderError(choice.reason);
			case "use":
				return {
					kind: "restored",
					...(await restoreFrom(
						{ teamId: activeTeamId(), folderId: choice.folderId },
						password,
						false,
					)),
				};
			case "adopt":
				return {
					kind: "restored",
					...(await restoreFrom(choice, password, true)),
				};
			case "choose": {
				const chosen = choice.teams.find((t) => t.teamId === chosenTeamId);
				if (chosen !== undefined) {
					return {
						kind: "restored",
						...(await restoreFrom(chosen, password, true)),
					};
				}
				const teams: TeamOption[] = [];
				for (const folder of choice.teams) {
					const opened = await openMarker(folder, password);
					teams.push({ teamId: folder.teamId, name: opened?.name ?? "" });
				}
				teams.sort((x, y) =>
					x.name !== y.name
						? x.name < y.name
							? -1
							: 1
						: x.teamId < y.teamId
							? -1
							: 1,
				);
				return { kind: "choose", teams };
			}
		}
	}

	return { backup, restore };
}
