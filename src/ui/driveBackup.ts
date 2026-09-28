import {
	matchesToBackUp,
	matchesToRestore,
	withManifestEntry,
} from "../core/driveSync.js";
import { type MatchFile, parseMatchFile } from "../core/matchFile.js";
import type { DriveAuth } from "./driveAuth.js";
import { createDriveClient } from "./driveClient.js";
import { keepMatchFiles, loadMatchFiles } from "./matchFileStorage.js";

/**
 * Backup and restore (#56), wiring the pure planning in core/driveSync.ts
 * to the Drive REST calls in driveClient.ts and this device's own match
 * files in matchFileStorage.ts.
 */
export interface DriveBackup {
	/** Upload every local match not yet in the Drive manifest. */
	backup(): Promise<{ uploaded: number }>;
	/** Download every manifest entry not already kept on this device. */
	restore(): Promise<{ downloaded: number }>;
}

export function createDriveBackup(auth: DriveAuth): DriveBackup {
	const client = createDriveClient(() => auth.accessToken());

	async function backup(): Promise<{ uploaded: number }> {
		const folderId = await client.ensureFolder();
		const { manifest, fileId } = await client.getManifest(folderId);
		const toUpload = matchesToBackUp(loadMatchFiles(), manifest);
		let current = manifest;
		for (const file of toUpload) {
			const driveFileId = await client.uploadMatch(
				folderId,
				file.audit.matchId,
				file,
			);
			current = withManifestEntry(current, file.audit.matchId, driveFileId);
		}
		if (toUpload.length > 0) {
			await client.saveManifest(folderId, fileId, current);
		}
		return { uploaded: toUpload.length };
	}

	async function restore(): Promise<{ downloaded: number }> {
		const folderId = await client.ensureFolder();
		const { manifest } = await client.getManifest(folderId);
		const localIds = new Set(loadMatchFiles().map((f) => f.audit.matchId));
		const toDownload = matchesToRestore(manifest, localIds);
		const files: MatchFile[] = [];
		for (const { fileId } of toDownload) {
			files.push(parseMatchFile(await client.downloadJson(fileId)));
		}
		const { newMatches } = keepMatchFiles(files);
		return { downloaded: newMatches };
	}

	return { backup, restore };
}
