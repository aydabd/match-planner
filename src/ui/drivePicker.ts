/**
 * Google Picker–based folder chooser (#70): lets a coach pick, or create,
 * the Drive folder MatchPlanner backs up to, instead of the app silently
 * creating one somewhere in "My Drive" where it is hard to find.
 *
 * This is also what makes a *shared* folder possible on the `drive.file`
 * OAuth scope: that scope only grants access to files the app itself
 * created, or files the signed-in user explicitly opens through Picker -
 * shared-with-me folders included. So if one coach shares their backup
 * folder with a teammate the normal Drive-sharing way, the teammate can
 * pick that same folder here and both sync to it, without the app ever
 * asking for the broader `drive` scope.
 *
 * Loaded by <script> at first use, same pattern as driveAuth.ts's GIS
 * script - the app stays free of runtime dependencies either way. Ambient
 * `Window.google.picker`/`Window.gapi` types live in driveAuth.ts, so both
 * modules agree on one shape for `Window.google`.
 */

const GAPI_SRC = "https://apis.google.com/js/api.js";

export interface PickedFolder {
	id: string;
	name: string;
}

const PICKER_FIX_STYLE_ID = "matchplanner-picker-fix";

/**
 * Google's own picker.css positions `.picker-dialog-bg` (the backdrop) and
 * `.picker-dialog` (the dialog itself) with `position: absolute` and a
 * `top`/`left` measured against the full document, not the visible
 * viewport. On a page tall enough that the button which opens the picker
 * is not near the top - the Drive backup card, well down the season
 * history screen - that lands the dialog off-screen, so a coach has to
 * scroll the page to find it (#115). Forcing both to `position: fixed`
 * (an inline `!important` stylesheet rule beats Google's inline style,
 * which carries none) anchors them to the viewport instead, however far
 * down the page the coach has scrolled. Idempotent: safe to call before
 * every pickFolder() without piling up duplicate <style> tags.
 */
function ensurePickerFixedPositioning(): void {
	if (document.getElementById(PICKER_FIX_STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = PICKER_FIX_STYLE_ID;
	style.textContent = `
		.picker-dialog-bg {
			position: fixed !important;
			top: 0 !important;
			left: 0 !important;
			right: 0 !important;
			bottom: 0 !important;
		}
		.picker-dialog {
			position: fixed !important;
			top: 50% !important;
			left: 50% !important;
			transform: translate(-50%, -50%) !important;
		}
	`;
	document.head.append(style);
}

function loadGapiPicker(): Promise<void> {
	return new Promise((resolve, reject) => {
		function loadPickerLibrary(): void {
			const gapi = window.gapi;
			if (!gapi) {
				reject(new Error("Kunde inte läsa in Google Drive-väljaren."));
				return;
			}
			gapi.load("picker", () => resolve());
		}

		if (window.gapi) {
			loadPickerLibrary();
			return;
		}
		const script = document.createElement("script");
		script.src = GAPI_SRC;
		script.async = true;
		script.addEventListener("load", loadPickerLibrary);
		script.addEventListener("error", () => {
			script.remove();
			reject(new Error("Kunde inte läsa in Google Drive-väljaren."));
		});
		document.head.append(script);
	});
}

/**
 * Open Google's folder picker and resolve with the folder the coach chose,
 * or null if they closed it without choosing one. `appId` comes from
 * driveConfig.ts. `apiKey` is optional - the picker authenticates with
 * `accessToken` (the same Drive OAuth token backup/restore already use),
 * a developer key only raises the picker's own request quota, so an empty
 * one (a self-hosted fork that has not set one up) still works.
 */
export async function pickFolder(
	accessToken: string,
	apiKey: string,
	appId: string,
): Promise<PickedFolder | null> {
	await loadGapiPicker();
	const picker = window.google?.picker;
	if (!picker) {
		throw new Error("Kunde inte läsa in Google Drive-väljaren.");
	}
	ensurePickerFixedPositioning();
	return new Promise((resolve, reject) => {
		const view = new picker.DocsView(picker.ViewId.FOLDERS)
			.setSelectFolderEnabled(true)
			.setIncludeFolders(true);
		let builder = new picker.PickerBuilder()
			.addView(view)
			.setOAuthToken(accessToken)
			.setAppId(appId);
		if (apiKey !== "") builder = builder.setDeveloperKey(apiKey);
		const instance = builder
			.setCallback((response) => {
				if (response.action === picker.Action.PICKED) {
					const doc = response.docs?.[0];
					if (!doc) {
						reject(new Error("Ingen mapp valdes."));
						return;
					}
					resolve({ id: doc.id, name: doc.name });
				} else if (response.action === picker.Action.CANCEL) {
					resolve(null);
				}
			})
			.build();
		instance.setVisible(true);
	});
}
