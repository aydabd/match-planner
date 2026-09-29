import type { DriveFileEntry } from "../core/driveSync.js";
import { type MatchFile, matchFileToJson } from "../core/matchFile.js";

/**
 * The Drive REST calls backup (#56) needs, kept to exactly the drive.file
 * scope allows: create/find the app's own folder, and read/write JSON
 * files in it. No DOM here, but it depends on `fetch`, so - like
 * driveAuth.ts - it lives in src/ui, not src/core.
 *
 * Every match file is uploaded once and never edited again (#70's
 * src/core/driveSync.ts comment explains why that matters for concurrent
 * coaches), so there is no "update an existing file" case to handle here -
 * every upload is a plain create.
 */

const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_NAME = "MatchPlanner-säkerhetskopia";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MATCH_FILE_SUFFIX = ".json";

export interface DriveClient {
	/** The app's backup folder in the coach's Drive, creating it if needed. */
	ensureFolder(): Promise<string>;
	/** Every match file already in `folderId`, matchId read from its filename. */
	listMatchFiles(folderId: string): Promise<DriveFileEntry[]>;
	/** Upload one match file as `<matchId>.json`. */
	uploadMatch(
		folderId: string,
		matchId: string,
		file: MatchFile,
	): Promise<void>;
	downloadJson(fileId: string): Promise<unknown>;
}

async function driveFetch(
	token: string,
	url: string,
	init: RequestInit = {},
): Promise<Response> {
	const response = await fetch(url, {
		...init,
		headers: { ...init.headers, Authorization: `Bearer ${token}` },
	});
	if (!response.ok) throw new Error(`Drive svarade ${response.status}`);
	return response;
}

export function createDriveClient(
	accessToken: () => Promise<string>,
): DriveClient {
	async function findFile(query: string): Promise<string | null> {
		const token = await accessToken();
		const url = `${FILES_URL}?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id)`;
		const response = await driveFetch(token, url);
		const body = (await response.json()) as { files?: { id: string }[] };
		return body.files?.[0]?.id ?? null;
	}

	async function ensureFolder(): Promise<string> {
		const existing = await findFile(
			`name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`,
		);
		if (existing) return existing;
		const token = await accessToken();
		const response = await driveFetch(token, `${FILES_URL}?fields=id`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
		});
		const body = (await response.json()) as { id: string };
		return body.id;
	}

	async function listMatchFiles(folderId: string): Promise<DriveFileEntry[]> {
		const token = await accessToken();
		const query = `'${folderId}' in parents and trashed=false`;
		const url = `${FILES_URL}?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id,name)&pageSize=1000`;
		const response = await driveFetch(token, url);
		const body = (await response.json()) as {
			files?: { id: string; name: string }[];
		};
		return (body.files ?? [])
			.filter((file) => file.name.endsWith(MATCH_FILE_SUFFIX))
			.map((file) => ({
				matchId: file.name.slice(0, -MATCH_FILE_SUFFIX.length),
				fileId: file.id,
			}));
	}

	async function downloadJson(fileId: string): Promise<unknown> {
		const token = await accessToken();
		const response = await driveFetch(
			token,
			`${FILES_URL}/${fileId}?alt=media`,
		);
		return response.json();
	}

	async function uploadMatch(
		folderId: string,
		matchId: string,
		file: MatchFile,
	): Promise<void> {
		const token = await accessToken();
		const metadata = {
			name: `${matchId}${MATCH_FILE_SUFFIX}`,
			parents: [folderId],
		};
		const boundary = "matchplanner-drive-boundary";
		const body = [
			`--${boundary}`,
			"Content-Type: application/json; charset=UTF-8",
			"",
			JSON.stringify(metadata),
			`--${boundary}`,
			"Content-Type: application/json",
			"",
			matchFileToJson(file),
			`--${boundary}--`,
		].join("\r\n");
		await driveFetch(token, `${UPLOAD_URL}?uploadType=multipart&fields=id`, {
			method: "POST",
			headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
			body,
		});
	}

	return { ensureFolder, listMatchFiles, uploadMatch, downloadJson };
}
