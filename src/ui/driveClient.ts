import { isDriveId } from "../core/driveIds.js";
import type { DriveFileEntry } from "../core/driveSync.js";
import { LIMITS } from "../core/limits.js";

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

/** `id` if it is a plausible Drive id; anything else never reaches a request. */
function checkedId(id: unknown, what: string): string {
	if (!isDriveId(id)) throw new Error(`Ogiltigt Drive-id (${what})`);
	return id;
}

/** The body of `response` as text, refusing one larger than LIMITS.driveFileBytes. */
async function readLimitedText(response: Response): Promise<string> {
	const tooLarge = () => new Error("Filen i Drive är för stor");
	const declared = Number(response.headers.get("Content-Length"));
	if (Number.isFinite(declared) && declared > LIMITS.driveFileBytes) {
		throw tooLarge();
	}
	const reader = response.body?.getReader();
	if (!reader) return response.text();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > LIMITS.driveFileBytes) {
			await reader.cancel();
			throw tooLarge();
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
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
		const query = `'${checkedId(folderId, "mapp")}' in parents and trashed=false${extra}`;
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
			// An entry with an id that could change a later request is left out.
			entries.push(...(body.files ?? []).filter((file) => isDriveId(file.id)));
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
		const parent = checkedId(parentId, "mapp");
		const token = await accessToken();
		const response = await driveFetch(token, `${FILES_URL}?fields=id`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name,
				mimeType: FOLDER_MIME,
				parents: [parent],
			}),
		});
		return checkedId(((await response.json()) as { id: string }).id, "mapp");
	}

	async function downloadJson(fileId: string): Promise<unknown> {
		const id = checkedId(fileId, "fil");
		const token = await accessToken();
		const response = await driveFetch(
			token,
			`${FILES_URL}/${encodeURIComponent(id)}?alt=media`,
		);
		return JSON.parse(await readLimitedText(response));
	}

	async function createFile(
		folderId: string,
		name: string,
		contents: string,
	): Promise<void> {
		const parent = checkedId(folderId, "mapp");
		const token = await accessToken();
		const metadata = { name, parents: [parent] };
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
		const id = checkedId(fileId, "fil");
		const token = await accessToken();
		await driveFetch(
			token,
			`${UPLOAD_URL}/${encodeURIComponent(id)}?uploadType=media&fields=id`,
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
