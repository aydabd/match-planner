import type { DriveFileEntry } from "../core/driveSync.js";

/**
 * The Drive REST calls backup (#56, #70) needs, kept to exactly the
 * `drive.file` scope allows: read/write JSON files in a folder the coach
 * picked (src/ui/drivePicker.ts). No DOM here, but it depends on `fetch`,
 * so - like driveAuth.ts - it lives in src/ui, not src/core.
 *
 * Every match file is uploaded once and never edited again (#70's
 * src/core/driveSync.ts comment explains why that matters for concurrent
 * coaches), so there is no "update an existing file" case to handle here
 * any more - every upload is a plain create.
 */

const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const MATCH_FILE_SUFFIX = ".json";
/** The pre-#70 manifest file name: excluded so an old one left in the
 * folder from before this version is never mistaken for a match file
 * (it also ends in ".json", but has no `audit`, so parsing it as one
 * would fail). */
const LEGACY_MANIFEST_NAME = "manifest.json";

export interface DriveClient {
	/** Every match file already in `folderId`, matchId read from its filename. */
	listMatchFiles(folderId: string): Promise<DriveFileEntry[]>;
	/** Create `<matchId>.json` in `folderId` holding `contents` verbatim. */
	uploadMatch(
		folderId: string,
		matchId: string,
		contents: string,
	): Promise<void>;
	/** The raw parsed JSON of a file by its Drive id. */
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
	async function listMatchFiles(folderId: string): Promise<DriveFileEntry[]> {
		const query = `'${folderId}' in parents and trashed=false`;
		const entries: DriveFileEntry[] = [];
		let pageToken: string | undefined;
		do {
			const token = await accessToken();
			const params = new URLSearchParams({
				q: query,
				spaces: "drive",
				fields: "nextPageToken,files(id,name)",
				pageSize: "1000",
			});
			if (pageToken !== undefined) params.set("pageToken", pageToken);
			const response = await driveFetch(token, `${FILES_URL}?${params}`);
			const body = (await response.json()) as {
				files?: { id: string; name: string }[];
				nextPageToken?: string;
			};
			for (const file of body.files ?? []) {
				if (file.name === LEGACY_MANIFEST_NAME) continue;
				if (!file.name.endsWith(MATCH_FILE_SUFFIX)) continue;
				entries.push({
					matchId: file.name.slice(0, -MATCH_FILE_SUFFIX.length),
					fileId: file.id,
				});
			}
			pageToken = body.nextPageToken;
		} while (pageToken !== undefined);
		return entries;
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
		contents: string,
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
			contents,
			`--${boundary}--`,
		].join("\r\n");
		await driveFetch(token, `${UPLOAD_URL}?uploadType=multipart&fields=id`, {
			method: "POST",
			headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
			body,
		});
	}

	return { listMatchFiles, uploadMatch, downloadJson };
}
