import type { DriveFileEntry } from "../../src/core/driveSync.js";
import type { DriveClient } from "../../src/ui/driveClient.js";

/** An in-memory Drive: folders hold files by name; ids are made up. */
export class FakeDrive {
	readonly files = new Map<
		string,
		{ name: string; folderId: string; contents: string }
	>();
	private nextId = 1;
	creates = 0;
	updates = 0;

	client(): DriveClient {
		return {
			listFiles: async (folderId) =>
				[...this.files]
					.filter(([, f]) => f.folderId === folderId)
					.map(([fileId, f]): DriveFileEntry => ({ name: f.name, fileId })),
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

	names(folderId: string): string[] {
		return [...this.files.values()]
			.filter((f) => f.folderId === folderId)
			.map((f) => f.name)
			.sort();
	}
}
