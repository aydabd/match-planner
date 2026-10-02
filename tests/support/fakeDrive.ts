import type { DriveFileEntry } from "../../src/core/driveSync.js";
import type { DriveClient } from "../../src/ui/driveClient.js";

/** An in-memory Drive: folders hold files and subfolders by name; ids are made up. */
export class FakeDrive {
	readonly files = new Map<
		string,
		{ name: string; folderId: string; contents: string }
	>();
	readonly folders = new Map<string, { name: string; parentId: string }>();
	private nextId = 1;
	creates = 0;
	updates = 0;

	client(): DriveClient {
		return {
			listFiles: async (folderId) =>
				[...this.files]
					.filter(([, f]) => f.folderId === folderId)
					.map(([fileId, f]): DriveFileEntry => ({ name: f.name, fileId })),
			listFolders: async (parentId) =>
				[...this.folders]
					.filter(([, f]) => f.parentId === parentId)
					.map(([folderId, f]) => ({ name: f.name, folderId })),
			createFolder: async (parentId, name) => {
				const folderId = `folder-${this.nextId++}`;
				this.folders.set(folderId, { name, parentId });
				return folderId;
			},
			createFile: async (folderId, name, contents) => {
				this.creates++;
				this.files.set(`id-${this.nextId++}`, { name, folderId, contents });
			},
			updateFile: async (fileId, contents) => {
				this.updates++;
				const file = this.files.get(fileId);
				if (!file) throw new Error("no such file");
				file.contents = contents;
			},
			downloadJson: async (fileId) => {
				const file = this.files.get(fileId);
				if (!file) throw new Error("no such file");
				return JSON.parse(file.contents);
			},
		};
	}

	/** The file names in one folder, sorted. */
	names(folderId: string): string[] {
		return [...this.files.values()]
			.filter((f) => f.folderId === folderId)
			.map((f) => f.name)
			.sort();
	}

	/** The subfolder names in one folder, sorted. */
	folderNames(parentId: string): string[] {
		return [...this.folders.values()]
			.filter((f) => f.parentId === parentId)
			.map((f) => f.name)
			.sort();
	}

	/** The Drive id of the subfolder called `name` in `parentId`, if any. */
	folderId(parentId: string, name: string): string | undefined {
		return [...this.folders].find(
			([, f]) => f.parentId === parentId && f.name === name,
		)?.[0];
	}
}
