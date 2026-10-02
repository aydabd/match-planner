import type { DriveFileEntry } from "../core/driveSync.js";

/**
 * The Drive REST calls backup (#56, #70, #135) needs, kept to exactly the
 * `drive.file` scope allows: read/write JSON files in a folder the coach
 * picked (src/ui/drivePicker.ts). No DOM here, but it depends on `fetch`,
 * so - like driveAuth.ts - it lives in src/ui, not src/core.
 *
 * It lists, creates, updates and downloads files by name and id and knows
 * nothing about what they mean: which file is whose, and what a name
 * stands for, is core/driveNames.ts and driveBackup.ts. Match files are
 * only ever created; a device updates only its own notes and squad files,
 * so no two devices ever write the same file.
 */

const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

export interface DriveFolderEntry {
	name: string;
	folderId: string;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface DriveClient {
	/** Every file in `folderId`, by name and Drive id. */
	listFiles(folderId: string): Promise<DriveFileEntry[]>;
	/** Every subfolder of `parentId`, by name and Drive id. */
	listFolders(parentId: string): Promise<DriveFolderEntry[]>;
	/** Create the subfolder `name` in `parentId`; returns its Drive id. */
	createFolder(parentId: string, name: string): Promise<string>;
	/** Create `name` in `folderId` holding `contents` verbatim. */
	createFile(folderId: string, name: string, contents: string): Promise<void>;
	/** Replace the contents of the file with Drive id `fileId`. */
	updateFile(fileId: string, contents: string): Promise<void>;
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
	/** Every id and name in `folderId` that matches `extra` (a Drive query clause). */
	async function listChildren(
		folderId: string,
		extra: string,
	): Promise<{ id: string; name: string }[]> {
		const query = `'${folderId}' in parents and trashed=false${extra}`;
		const entries: { id: string; name: string }[] = [];
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
			entries.push(...(body.files ?? []));
			pageToken = body.nextPageToken;
		} while (pageToken !== undefined);
		return entries;
	}

	async function listFiles(folderId: string): Promise<DriveFileEntry[]> {
		const children = await listChildren(
			folderId,
			` and mimeType!='${FOLDER_MIME}'`,
		);
		return children.map((file) => ({ name: file.name, fileId: file.id }));
	}

	async function listFolders(parentId: string): Promise<DriveFolderEntry[]> {
		const children = await listChildren(
			parentId,
			` and mimeType='${FOLDER_MIME}'`,
		);
		return children.map((folder) => ({
			name: folder.name,
			folderId: folder.id,
		}));
	}

	async function createFolder(parentId: string, name: string): Promise<string> {
		const token = await accessToken();
		const response = await driveFetch(token, `${FILES_URL}?fields=id`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name,
				mimeType: FOLDER_MIME,
				parents: [parentId],
			}),
		});
		return ((await response.json()) as { id: string }).id;
	}

	async function downloadJson(fileId: string): Promise<unknown> {
		const token = await accessToken();
		const response = await driveFetch(
			token,
			`${FILES_URL}/${fileId}?alt=media`,
		);
		return response.json();
	}

	async function createFile(
		folderId: string,
		name: string,
		contents: string,
	): Promise<void> {
		const token = await accessToken();
		const metadata = { name, parents: [folderId] };
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

	async function updateFile(fileId: string, contents: string): Promise<void> {
		const token = await accessToken();
		await driveFetch(
			token,
			`${UPLOAD_URL}/${fileId}?uploadType=media&fields=id`,
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: contents,
			},
		);
	}

	return {
		listFiles,
		listFolders,
		createFolder,
		createFile,
		updateFile,
		downloadJson,
	};
}
