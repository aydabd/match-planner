import { matchesToBackUp, matchesToRestore } from "../core/driveSync.js";
import { type MatchFile, parseMatchFile } from "../core/matchFile.js";
import {
	decryptJson,
	encryptJson,
	parseSecurePackage,
	securePackageToJson,
} from "../core/securePackage.js";
import type { DriveAuth } from "./driveAuth.js";
import { createDriveClient } from "./driveClient.js";
import { keepMatchFiles, loadMatchFiles } from "./matchFileStorage.js";

/**
 * Backup and restore (#56, #70), wiring the pure planning in
 * core/driveSync.ts to the Drive REST calls in driveClient.ts, this
 * device's own match files in matchFileStorage.ts, and the encryption in
 * core/securePackage.ts (#81): every file uploaded or downloaded is
 * encrypted with the coach's password, so a Drive folder shared between
 * coaches (chosen via drivePicker.ts) is safe without relying on Drive's
 * own access control.
 *
 * The password is never kept anywhere - not in appStorage, not on this
 * object - a coach types it in for each backup/restore call.
 */
export interface DriveBackup {
	/** Upload every local match not yet in `folderId`, encrypted with `password`. */
	backup(folderId: string, password: string): Promise<{ uploaded: number }>;
	/** Download every match in `folderId` not already kept on this device. */
	restore(folderId: string, password: string): Promise<{ downloaded: number }>;
}

export function createDriveBackup(auth: DriveAuth): DriveBackup {
	const client = createDriveClient(() => auth.accessToken());

	async function backup(
		folderId: string,
		password: string,
	): Promise<{ uploaded: number }> {
		const remote = await client.listMatchFiles(folderId);
		const toUpload = matchesToBackUp(loadMatchFiles(), remote);
		for (const file of toUpload) {
			const pkg = await encryptJson(password, file);
			await client.uploadMatch(
				folderId,
				file.audit.matchId,
				securePackageToJson(pkg),
			);
		}
		return { uploaded: toUpload.length };
	}

	async function restore(
		folderId: string,
		password: string,
	): Promise<{ downloaded: number }> {
		const remote = await client.listMatchFiles(folderId);
		const localIds = new Set(loadMatchFiles().map((f) => f.audit.matchId));
		const toDownload = matchesToRestore(remote, localIds);
		const files: MatchFile[] = [];
		for (const { fileId } of toDownload) {
			const pkg = parseSecurePackage(await client.downloadJson(fileId));
			files.push(parseMatchFile(await decryptJson(password, pkg)));
		}
		const { newMatches } = keepMatchFiles(files);
		return { downloaded: newMatches };
	}

	return { backup, restore };
}
