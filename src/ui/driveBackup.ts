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
	type TeamFolder,
} from "../core/driveSync.js";
import type { MergeCounts, PlacementChoice } from "../core/importTeam.js";
import type { MatchFile } from "../core/matchFile.js";
import { isAcceptableNewPassword } from "../core/passwords.js";
import type { PlayerNotesFile } from "../core/playerNotes.js";
import {
	decryptJson,
	encryptJson,
	parseSecurePackage,
	SecurePackageError,
	securePackageToJson,
} from "../core/securePackage.js";
import type { RosterFile } from "../core/storage.js";
import { applyTeamData } from "./applyTeamData.js";
import { deviceId } from "./deviceStorage.js";
import { loadDraft } from "./draftStorage.js";
import type { DriveClient } from "./driveClient.js";
import { loadMatchFiles } from "./matchFileStorage.js";
import { loadPlayerNotes } from "./playerNotesStorage.js";
import { activeTeamIsEmpty } from "./teamEmpty.js";
import {
	activeTeamId,
	activeTeamName,
	adoptTeamId,
	createTeamWithId,
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
	| { kind: "choose"; teams: TeamOption[] }
	/** The folder belongs to another team than this one, which has data: nothing is changed until `placement` is given. */
	| {
			kind: "different-team";
			teamId: string;
			name: string;
			counts: MergeCounts;
	  };

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
		placement?: PlacementChoice,
	): Promise<RestoreOutcome>;
}

/** Why a restore was refused; src/ui/text.ts turns it into a sentence. */
export type FolderProblem = "belongsToOtherLocalTeam";

export class DriveFolderError extends Error {
	constructor(readonly reason: FolderProblem) {
		super(`Drive folder refused: ${reason}`);
		this.name = "DriveFolderError";
	}
}

/** A password shorter than LIMITS.minPasswordLength for a team's first backup (#147). */
export class PasswordTooShortError extends Error {
	constructor() {
		super("Password is too short for a new backup");
		this.name = "PasswordTooShortError";
	}
}

/**
 * A team marker that opened with the password but is not a valid marker for
 * its folder (#147): damage, which must never be mistaken for "a team with a
 * different password" and skipped.
 */
export class DriveMarkerError extends Error {
	constructor() {
		super("Team marker does not match its folder");
		this.name = "DriveMarkerError";
	}
}

/** Whether `err` just means this password does not open that file. */
const isLocked = (err: unknown): boolean =>
	err instanceof SecurePackageError || err instanceof SyntaxError;

const NOTHING: RestoreResult = {
	downloaded: 0,
	notesChanged: false,
	squadRestored: false,
	ignored: 0,
};

interface OpenedMarker {
	entries: ReturnType<typeof classifyFolder>;
	name: string;
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
		const listing = own
			? classifyFolder(await client.listFiles(own.folderId))
			: classifyFolder([]);
		// With no marker yet this backup sets the team's password, so it has
		// to be a decent one. A team that already has one keeps using it.
		if (
			!listing.markers.some((m) => m.teamId === teamId) &&
			!isAcceptableNewPassword(password)
		) {
			throw new PasswordTooShortError();
		}
		const folderId =
			own?.folderId ??
			(await client.createFolder(rootId, teamFolderName(teamId)));

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
	): Promise<OpenedMarker | null> {
		const entries = classifyFolder(await client.listFiles(folder.folderId));
		const marker = entries.markers.find((m) => m.teamId === folder.teamId);
		if (marker === undefined) return null;
		// The marker is encrypted too: opening it proves the password before
		// anything on this device is changed, and proves it names this team.
		const payload = await open(password, marker.fileId);
		if (payload.kind !== "team" || payload.teamId !== folder.teamId) {
			throw new DriveMarkerError();
		}
		return { entries, name: payload.teamName ?? "" };
	}

	/** Restore the team in `folder`, first taking on its id and name if `adopt`. */
	async function restoreFrom(
		folder: TeamFolder,
		password: string,
		adopt: boolean,
		alreadyOpened?: OpenedMarker | null,
	): Promise<RestoreResult> {
		const opened =
			alreadyOpened === undefined
				? await openMarker(folder, password)
				: alreadyOpened;
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

		const notes: PlayerNotesFile[] = [];
		for (const entry of listing.notes) {
			const payload = await ownPayload(password, entry, teamId);
			if (payload?.kind === "notes") notes.push(payload.playerNotes);
			else ignored++;
		}

		const squads: RosterFile[] = [];
		for (const entry of listing.squads) {
			const payload = await ownPayload(password, entry, teamId);
			if (payload?.kind === "squad") squads.push(payload.roster);
			else ignored++;
		}

		const applied = applyTeamData({ matches, notes, squads });
		return {
			downloaded: applied.added,
			notesChanged: applied.notesChanged,
			squadRestored: applied.squadTaken,
			ignored,
		};
	}

	async function restore(
		rootId: string,
		password: string,
		chosenTeamId?: string,
		placement?: PlacementChoice,
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
				const unlocked = await unlockedTeams(choice.teams, password);
				const chosen =
					unlocked.length === 1
						? unlocked[0]
						: unlocked.find((u) => u.folder.teamId === chosenTeamId);
				if (chosen !== undefined) {
					return {
						kind: "restored",
						...(await restoreFrom(
							chosen.folder,
							password,
							true,
							chosen.opened,
						)),
					};
				}
				return { kind: "choose", teams: teamOptions(unlocked) };
			}
			case "different": {
				// This team has data and the folders are other teams': the coach
				// chooses, deliberately, what happens (#154). Only the teams the
				// password opens are candidates.
				const unlocked = await unlockedTeams(choice.teams, password);
				const chosen =
					unlocked.length === 1
						? unlocked[0]
						: unlocked.find((u) => u.folder.teamId === chosenTeamId);
				if (chosen === undefined) {
					return { kind: "choose", teams: teamOptions(unlocked) };
				}
				const { folder, opened } = chosen;
				if (placement === undefined) {
					return {
						kind: "different-team",
						teamId: folder.teamId,
						name: opened.name,
						counts: await matchCounts(folder.teamId, opened),
					};
				}
				if (placement === "new") createTeamWithId(folder.teamId, opened.name);
				else if (!adoptTeamId(folder.teamId)) {
					throw new DriveFolderError("belongsToOtherLocalTeam");
				}
				return {
					kind: "restored",
					...(await restoreFrom(folder, password, false, opened)),
				};
			}
		}
	}

	/**
	 * The teams in `folders` this password opens; the others are neither
	 * offered nor read. A password that opens none is the wrong password.
	 */
	async function unlockedTeams(
		folders: readonly TeamFolder[],
		password: string,
	): Promise<{ folder: TeamFolder; opened: OpenedMarker }[]> {
		const unlocked: { folder: TeamFolder; opened: OpenedMarker }[] = [];
		for (const folder of folders) {
			try {
				const opened = await openMarker(folder, password);
				if (opened !== null) unlocked.push({ folder, opened });
			} catch (err) {
				if (!isLocked(err)) throw err;
			}
		}
		if (unlocked.length === 0) {
			throw new SecurePackageError("No team opens with this password", {
				code: "wrongPasswordOrTampered",
			});
		}
		return unlocked;
	}

	/** The teams to choose from, by name and then id. */
	function teamOptions(
		unlocked: readonly { folder: TeamFolder; opened: OpenedMarker }[],
	): TeamOption[] {
		const teams: TeamOption[] = unlocked.map((u) => ({
			teamId: u.folder.teamId,
			name: u.opened.name,
		}));
		return teams.sort((x, y) =>
			x.name !== y.name
				? x.name < y.name
					? -1
					: 1
				: x.teamId < y.teamId
					? -1
					: 1,
		);
	}

	/**
	 * Matches before and after merging this team with the folder's, from the
	 * file names alone: a match's name is built from the team id and the
	 * match id, so the local matches are named as the folder's team would.
	 */
	async function matchCounts(
		teamId: string,
		opened: OpenedMarker,
	): Promise<MergeCounts> {
		const incoming = new Set(opened.entries.matches.map((m) => m.name));
		const local = loadMatchFiles();
		let shared = 0;
		for (const match of local) {
			if (
				incoming.has(await driveFileName("match", teamId, match.audit.matchId))
			) {
				shared++;
			}
		}
		const localCount = new Set(local.map((m) => m.audit.matchId)).size;
		return {
			local: localCount,
			incoming: incoming.size,
			merged: localCount + incoming.size - shared,
		};
	}

	return { backup, restore };
}
