import type { BrowserContext } from "@playwright/test";

/**
 * A minimal in-memory stand-in for Google Identity Services and the Drive
 * REST API, so backup and restore can be tested without a real Google
 * account or network access. Both "phones" in a test route through the
 * same `drive` object, so a file one uploads is one the other can restore -
 * exactly like two coaches' phones sharing one Drive account.
 */
export interface FakeFile {
	name: string;
	mimeType?: string;
	parents?: string[];
	content: string;
}

export function createFakeDrive() {
	const files = new Map<string, FakeFile>();
	let next = 1;
	return { files, nextId: () => String(next++) };
}

// Every test's page runs on a paused fake clock (see fixtures.ts), so this
// resolves synchronously rather than via setTimeout - a real setTimeout
// would never fire without the test advancing match time, which is
// unrelated to what this is testing. The `picker` stand-in fakes Google's
// hosted folder-picker iframe: build().setVisible() immediately "picks"
// one fixed fake folder, since driving the real Picker UI is not something
// Playwright can do without a live Google account.
export const GIS_SCRIPT = `window.google = {
	accounts: {
		oauth2: {
			initTokenClient(config) {
				return {
					requestAccessToken() {
						config.callback({ access_token: "fake-drive-token" });
					},
				};
			},
		},
	},
	picker: {
		DocsView: function () {
			return { setSelectFolderEnabled() { return this; }, setIncludeFolders() { return this; } };
		},
		PickerBuilder: function () {
			let callback = null;
			return {
				addView() { return this; },
				setOAuthToken() { return this; },
				setAppId() { return this; },
				setDeveloperKey() { return this; },
				setCallback(cb) { callback = cb; return this; },
				build() {
					return {
						setVisible() {
							callback({ action: "picked", docs: [{ id: "folder-1", name: "MatchPlanner-mapp" }] });
						},
					};
				},
			};
		},
		ViewId: { FOLDERS: "folders" },
		Action: { PICKED: "picked", CANCEL: "cancel" },
	},
};`;

const GAPI_SCRIPT = `window.gapi = { load(api, cb) { cb(); } };`;

export const FOLDER_MIME = "application/vnd.google-apps.folder";

/** The names of the subfolders of `parentId` in the fake Drive. */
export function subfolderNames(
	drive: ReturnType<typeof createFakeDrive>,
	parentId: string,
): string[] {
	return [...drive.files.values()]
		.filter(
			(f) => f.mimeType === FOLDER_MIME && (f.parents ?? []).includes(parentId),
		)
		.map((f) => f.name)
		.sort();
}

const BOUNDARY = "matchplanner-drive-boundary";
export const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

export async function mockGoogle(
	context: BrowserContext,
	drive: ReturnType<typeof createFakeDrive>,
): Promise<void> {
	await context.route("https://accounts.google.com/gsi/client", (route) =>
		route.fulfill({
			contentType: "application/javascript",
			headers: CORS_HEADERS,
			body: GIS_SCRIPT,
		}),
	);
	await context.route("https://apis.google.com/js/api.js", (route) =>
		route.fulfill({
			contentType: "application/javascript",
			headers: CORS_HEADERS,
			body: GAPI_SCRIPT,
		}),
	);

	await context.route("https://www.googleapis.com/**", async (route) => {
		const request = route.request();
		if (request.method() === "OPTIONS") {
			await route.fulfill({
				status: 204,
				headers: {
					...CORS_HEADERS,
					"Access-Control-Allow-Methods": "GET,POST,PATCH",
					"Access-Control-Allow-Headers": "authorization,content-type",
				},
			});
			return;
		}
		const url = new URL(request.url());
		const method = request.method();
		const json = (body: unknown) =>
			route.fulfill({
				contentType: "application/json",
				headers: CORS_HEADERS,
				body: JSON.stringify(body),
			});

		if (url.pathname === "/drive/v3/files" && method === "GET") {
			const q = url.searchParams.get("q") ?? "";
			const name = /name='([^']*)'/.exec(q)?.[1];
			const mimeType = /mimeType='([^']*)'/.exec(q)?.[1];
			const notMimeType = /mimeType!='([^']*)'/.exec(q)?.[1];
			const parent = /'([^']*)' in parents/.exec(q)?.[1];
			const matches = [...drive.files.entries()].filter(([, f]) => {
				if (name !== undefined && f.name !== name) return false;
				if (mimeType !== undefined && f.mimeType !== mimeType) return false;
				if (notMimeType !== undefined && f.mimeType === notMimeType)
					return false;
				if (parent !== undefined && !(f.parents ?? []).includes(parent))
					return false;
				return true;
			});
			// Pages of 2, regardless of the requested pageSize, so a folder
			// with more than one page of files (PAGED_MATCH_COUNT below)
			// exercises listMatchFiles' nextPageToken loop, not just its
			// single-page path.
			const PAGE_SIZE = 2;
			const offset = Number(url.searchParams.get("pageToken") ?? "0");
			const page = matches.slice(offset, offset + PAGE_SIZE);
			const nextOffset = offset + PAGE_SIZE;
			await json({
				files: page.map(([id, f]) => ({ id, name: f.name })),
				...(nextOffset < matches.length
					? { nextPageToken: String(nextOffset) }
					: {}),
			});
			return;
		}

		if (url.pathname === "/drive/v3/files" && method === "POST") {
			const body = request.postDataJSON() as {
				name: string;
				mimeType?: string;
				parents?: string[];
			};
			const id = drive.nextId();
			drive.files.set(id, {
				name: body.name,
				...(body.mimeType !== undefined && { mimeType: body.mimeType }),
				...(body.parents !== undefined && { parents: body.parents }),
				content: "",
			});
			await json({ id });
			return;
		}

		if (
			/^\/drive\/v3\/files\/[^/]+$/.test(url.pathname) &&
			url.searchParams.get("alt") === "media"
		) {
			const id = url.pathname.split("/").pop() as string;
			await route.fulfill({
				contentType: "application/json",
				headers: CORS_HEADERS,
				body: drive.files.get(id)?.content ?? "{}",
			});
			return;
		}

		if (
			method === "PATCH" &&
			url.searchParams.get("uploadType") === "media" &&
			url.pathname.startsWith("/upload/drive/v3/files/")
		) {
			const id = url.pathname.split("/").pop() as string;
			const file = drive.files.get(id);
			if (file) file.content = request.postData() ?? "";
			await json({ id });
			return;
		}

		if (url.pathname.startsWith("/upload/drive/v3/files")) {
			const body = request.postData() ?? "";
			const parts = body.split(`--${BOUNDARY}`);
			const metaBlock = parts[1]?.split("\r\n\r\n")[1]?.trim() ?? "{}";
			const contentBlock = parts[2]?.split("\r\n\r\n")[1]?.trim() ?? "{}";
			const meta = JSON.parse(metaBlock) as {
				name: string;
				parents?: string[];
			};
			const idInPath = url.pathname.replace("/upload/drive/v3/files", "");
			const id = idInPath.startsWith("/") ? idInPath.slice(1) : drive.nextId();
			const parents = meta.parents ?? drive.files.get(id)?.parents;
			drive.files.set(id, {
				name: meta.name,
				...(parents !== undefined && { parents }),
				content: contentBlock,
			});
			await json({ id });
			return;
		}

		await route.continue();
	});
}
