import { driveFileName, teamMarkerName } from "../core/driveNames.js";
import {
	type DrivePayload,
	parseDrivePayload,
	payloadFileName,
} from "../core/drivePayload.js";
import {
	classifyFolder,
	type DriveFileEntry,
	decideFolder,
	type FolderMarker,
	filesToRestore,
	matchesToBackUp,
	pickSquad,
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
import { activeTeamId, adoptTeamId, otherTeamIds } from "./teamStorage.js";

/**
 * Backup and restore (#56, #70, #135), wiring the pure planning in
 * core/driveSync.ts to the Drive calls in driveClient.ts, this device's own
 * data, and the encryption in core/securePackage.ts (#81): every file is
 * encrypted with the coach's password, so a Drive folder shared between
 * coaches (chosen via drivePicker.ts) is safe without relying on Drive's
 * own access control.
 *
 * A folder holds one team: a team marker file names it, every file's name
 * is built from that team's id (core/driveNames.ts) and every file's
 * contents repeat the id (core/drivePayload.ts). A restore on a device
 * whose team is still empty takes on the folder's team id, so both compute
 * the same names; anything that would mix two teams is refused, and a file
 * that is not this team's is ignored.
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
	/** Files in the folder that are not this team's, or not readable. */
	ignored: number;
}

export interface DriveBackup {
	/** Upload what is not yet in `folderId`, encrypted with `password`. */
	backup(folderId: string, password: string): Promise<BackupResult>;
	/** Take what this device lacks from `folderId`. */
	restore(folderId: string, password: string): Promise<RestoreResult>;
}

/** Why a folder was refused; src/ui/text.ts turns it into a sentence. */
export type FolderProblem =
	| "severalTeams"
	| "otherTeam"
	| "belongsToOtherLocalTeam";

export class DriveFolderError extends Error {
	constructor(readonly reason: FolderProblem) {
		super(`Drive folder refused: ${reason}`);
		this.name = "DriveFolderError";
	}
}

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

	function decide(markers: FolderMarker[]) {
		return decideFolder({
			localTeamId: activeTeamId(),
			localIsEmpty: activeTeamIsEmpty(),
			otherLocalTeamIds: otherTeamIds(),
			markers,
		});
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
		folderId: string,
		password: string,
	): Promise<BackupResult> {
		const listing = classifyFolder(await client.listFiles(folderId));
		const decision = decide(listing.markers);
		if (decision.action === "refuse") {
			throw new DriveFolderError(decision.reason);
		}
		// Backing up never takes on another team's id: that is what restore
		// is for. A team with data would otherwise be mixed into theirs.
		if (decision.action === "adopt") throw new DriveFolderError("otherTeam");
		const teamId = activeTeamId();
		if (decision.action === "claim") {
			await client.createFile(
				folderId,
				teamMarkerName(teamId),
				await seal(password, { schemaVersion: 1, kind: "team", teamId }),
			);
		}

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

	async function restore(
		folderId: string,
		password: string,
	): Promise<RestoreResult> {
		const nothing: RestoreResult = {
			downloaded: 0,
			notesChanged: false,
			squadRestored: false,
			ignored: 0,
		};
		const listing = classifyFolder(await client.listFiles(folderId));
		const decision = decide(listing.markers);
		if (decision.action === "refuse") {
			throw new DriveFolderError(decision.reason);
		}
		// No marker: no team has written here, so there is nothing of ours.
		if (decision.action === "claim") return nothing;

		// The marker is encrypted too: opening it proves the password before
		// anything on this device is changed, and proves it names this team.
		const marker = listing.markers[0];
		if (marker === undefined) return nothing;
		const markerPayload = await open(password, marker.fileId);
		if (
			markerPayload.kind !== "team" ||
			markerPayload.teamId !== marker.teamId
		) {
			throw new SecurePackageError("Marker does not match its name", {
				code: "wrongPasswordOrTampered",
			});
		}
		if (decision.action === "adopt" && !adoptTeamId(decision.teamId)) {
			throw new DriveFolderError("belongsToOtherLocalTeam");
		}
		const teamId = activeTeamId();

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

	return { backup, restore };
}
