import type { BrowserContext } from "@playwright/test";
import { matchFileToJson } from "../../src/core/matchFile.js";
import { makeMatchFile, NAMES } from "../../tests/support/matchFiles.js";
import { expect, test } from "../fixtures.js";
import { HistoryPage } from "../pages/HistoryPage.js";
import { SetupPage } from "../pages/SetupPage.js";

/**
 * A minimal in-memory stand-in for Google Identity Services and the Drive
 * REST API, so backup and restore can be tested without a real Google
 * account or network access. Both "phones" in a test route through the
 * same `drive` object, so a file one uploads is one the other can restore -
 * exactly like two coaches' phones sharing one Drive account.
 */
interface FakeFile {
	name: string;
	mimeType?: string;
	parents?: string[];
	content: string;
}

function createFakeDrive() {
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
const GIS_SCRIPT = `window.google = {
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

const BOUNDARY = "matchplanner-drive-boundary";
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

async function mockGoogle(
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
			const parent = /'([^']*)' in parents/.exec(q)?.[1];
			const matches = [...drive.files.entries()].filter(([, f]) => {
				if (name !== undefined && f.name !== name) return false;
				if (mimeType !== undefined && f.mimeType !== mimeType) return false;
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
			};
			const id = drive.nextId();
			drive.files.set(id, {
				name: body.name,
				...(body.mimeType !== undefined && { mimeType: body.mimeType }),
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

const MATCH = matchFileToJson(
	makeMatchFile({ matchId: "drive-1", names: NAMES.slice(0, 9) }),
);

// The service worker (src/sw/serviceWorker.js) proxies every GET request,
// including these mocked cross-origin ones; blocking it keeps the test
// about the Drive wiring, not an interaction with offline caching.
test.use({ serviceWorkers: "block" });

test.describe("Google Drive backup and restore", () => {
	test("retries loading Google sign-in after a failed attempt", async ({
		setup,
		history,
		page,
	}) => {
		let scriptRequests = 0;
		await page
			.context()
			.route("https://accounts.google.com/gsi/client", async (route) => {
				scriptRequests++;
				if (scriptRequests === 1) {
					await route.abort();
					return;
				}
				await route.fulfill({
					contentType: "application/javascript",
					headers: CORS_HEADERS,
					body: GIS_SCRIPT,
				});
			});

		await setup.open();
		await history.open();

		await history.driveConnectButton.click();
		await expect(history.driveStatus).toHaveText(
			"Inloggningen misslyckades eller avbröts.",
		);

		// A second tap must load the script again, not replay the same
		// cached failure for the rest of the page's life.
		await history.driveConnectButton.click();
		await expect(history.driveStatus).toHaveText("Kopplad till Google Drive.");
		expect(scriptRequests).toBe(2);
	});

	test("ignores a legacy manifest.json and pages through many files", async ({
		history,
		setup,
		page,
	}) => {
		// A folder left over from before #70's listing-based sync: a
		// manifest.json (which also ends in ".json", so must not be mistaken
		// for a match file) alongside more match files than one Drive
		// "page" (2, per the fake server above) holds, so restoring them
		// exercises the nextPageToken loop, not just a single page.
		const drive = createFakeDrive();
		const folderId = "folder-1";
		drive.files.set(folderId, {
			name: "MatchPlanner-säkerhetskopia",
			mimeType: "application/vnd.google-apps.folder",
			content: "",
		});
		drive.files.set("legacy-manifest", {
			name: "manifest.json",
			parents: [folderId],
			content: JSON.stringify({ schemaVersion: 1, files: {} }),
		});
		for (const suffix of ["a", "b", "c"]) {
			drive.files.set(`seed-${suffix}`, {
				name: `seed-${suffix}.json`,
				parents: [folderId],
				content: matchFileToJson(
					makeMatchFile({
						matchId: `seed-${suffix}`,
						names: NAMES.slice(0, 9),
					}),
				),
			});
		}
		await mockGoogle(page.context(), drive);

		await setup.open();
		await history.open();
		await history.driveConnectButton.click();
		await expect(history.driveStatus).toHaveText("Kopplad till Google Drive.");
		await history.driveRestoreButton.click();
		await expect(history.driveStatus).toHaveText("3 matcher lästes in.");
		await expect(history.count).toHaveText("3 matcher över 1 månad.");
	});

	test("backs up on one phone and restores on another", async ({
		browser,
		history,
		setup,
		page,
	}) => {
		const drive = createFakeDrive();
		await mockGoogle(page.context(), drive);

		await setup.open();
		await history.open();
		await history.importFiles([{ name: "match.json", contents: MATCH }]);
		await expect(history.count).toHaveText("1 match över 1 månad.");

		const password = "hemligt-lösenord";

		await history.driveConnectButton.click();
		await expect(history.driveStatus).toHaveText("Kopplad till Google Drive.");
		await history.driveChooseFolderButton.click();
		await expect(history.driveStatus).toHaveText("Mapp: MatchPlanner-mapp");
		await history.drivePasswordInput.fill(password);
		await expect(history.driveBackupButton).toBeVisible();

		await history.driveBackupButton.click();
		await expect(history.driveStatus).toHaveText(
			"1 match säkerhetskopierades.",
		);

		// Backing up again finds nothing new to upload.
		await history.driveBackupButton.click();
		await expect(history.driveStatus).toHaveText(
			"Allt var redan säkerhetskopierat.",
		);

		// A second phone, empty, connected to the same shared Drive folder -
		// each coach signs in and picks the folder on their own device (#70);
		// this test's fake picker always "picks" the same fixed folder id.
		const otherContext = await browser.newContext({
			reducedMotion: "reduce",
			serviceWorkers: "block",
		});
		await mockGoogle(otherContext, drive);
		const otherPage = await otherContext.newPage();
		const otherSetup = new SetupPage(otherPage);
		const otherHistory = new HistoryPage(otherPage);
		await otherSetup.open();
		await otherHistory.open();
		await expect(otherHistory.count).toHaveText(
			"Inga matcher än. Spela en match eller läs in matchfiler.",
		);

		await otherHistory.driveConnectButton.click();
		await expect(otherHistory.driveStatus).toHaveText(
			"Kopplad till Google Drive.",
		);
		await otherHistory.driveChooseFolderButton.click();
		await expect(otherHistory.driveStatus).toHaveText(
			"Mapp: MatchPlanner-mapp",
		);

		// The wrong password refuses to decrypt instead of importing garbage.
		await otherHistory.drivePasswordInput.fill("fel lösenord");
		await otherHistory.driveRestoreButton.click();
		await expect(otherHistory.driveStatus).toHaveText(
			"Fel lösenord, eller filen har ändrats. Kontrollera lösenordet och försök igen.",
		);

		await otherHistory.drivePasswordInput.fill(password);
		await otherHistory.driveRestoreButton.click();
		await expect(otherHistory.driveStatus).toHaveText("1 match lästes in.");
		await expect(otherHistory.count).toHaveText("1 match över 1 månad.");

		await otherContext.close();
	});
});
