import {
	type DriveManifest,
	EMPTY_MANIFEST,
	manifestToJson,
	parseManifest,
} from "../core/driveSync.js";
import { type MatchFile, matchFileToJson } from "../core/matchFile.js";

/**
 * The Drive REST calls backup (#56) needs, kept to exactly the drive.file
 * scope allows: create/find the app's own folder, and read/write JSON
 * files in it. No DOM here, but it depends on `fetch`, so - like
 * driveAuth.ts - it lives in src/ui, not src/core.
 */

const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_NAME = "MatchPlanner-säkerhetskopia";
const MANIFEST_NAME = "manifest.json";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface DriveClient {
	/** The app's backup folder in the coach's Drive, creating it if needed. */
	ensureFolder(): Promise<string>;
	/** The manifest in `folderId`, and its own Drive file id (null if there is none yet). */
	getManifest(
		folderId: string,
	): Promise<{ manifest: DriveManifest; fileId: string | null }>;
	/** Create or update the manifest; returns its Drive file id. */
	saveManifest(
		folderId: string,
		fileId: string | null,
		manifest: DriveManifest,
	): Promise<string>;
	/** Upload one match file as `<matchId>.json`; returns its Drive file id. */
	uploadMatch(
		folderId: string,
		matchId: string,
		file: MatchFile,
	): Promise<string>;
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

	async function downloadJson(fileId: string): Promise<unknown> {
		const token = await accessToken();
		const response = await driveFetch(
			token,
			`${FILES_URL}/${fileId}?alt=media`,
		);
		return response.json();
	}

	/** Only sets `parents` on create: Drive rejects it in an update's metadata. */
	async function uploadJson(
		folderId: string | null,
		fileId: string | null,
		name: string,
		json: string,
	): Promise<string> {
		const token = await accessToken();
		const metadata: Record<string, unknown> = { name };
		if (folderId && !fileId) metadata.parents = [folderId];
		const boundary = "matchplanner-drive-boundary";
		const body = [
			`--${boundary}`,
			"Content-Type: application/json; charset=UTF-8",
			"",
			JSON.stringify(metadata),
			`--${boundary}`,
			"Content-Type: application/json",
			"",
			json,
			`--${boundary}--`,
		].join("\r\n");
		const url = fileId
			? `${UPLOAD_URL}/${fileId}?uploadType=multipart&fields=id`
			: `${UPLOAD_URL}?uploadType=multipart&fields=id`;
		const response = await driveFetch(token, url, {
			method: fileId ? "PATCH" : "POST",
			headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
			body,
		});
		const result = (await response.json()) as { id: string };
		return result.id;
	}

	async function getManifest(folderId: string) {
		const fileId = await findFile(
			`name='${MANIFEST_NAME}' and '${folderId}' in parents and trashed=false`,
		);
		if (!fileId) return { manifest: EMPTY_MANIFEST, fileId: null };
		return { manifest: parseManifest(await downloadJson(fileId)), fileId };
	}

	async function saveManifest(
		folderId: string,
		fileId: string | null,
		manifest: DriveManifest,
	): Promise<string> {
		return uploadJson(
			folderId,
			fileId,
			MANIFEST_NAME,
			manifestToJson(manifest),
		);
	}

	async function uploadMatch(
		folderId: string,
		matchId: string,
		file: MatchFile,
	): Promise<string> {
		return uploadJson(folderId, null, `${matchId}.json`, matchFileToJson(file));
	}

	return {
		ensureFolder,
		getManifest,
		saveManifest,
		uploadMatch,
		downloadJson,
	};
}
