/**
 * Google sign-in for Drive backup (#56), wrapping Google Identity Services
 * (GIS). Loaded by <script> at first use, not an npm dependency - the app
 * stays free of runtime dependencies either way. State (the loaded script,
 * the cached token) lives in the object createDriveAuth returns, never at
 * module level (src/ has none - see tests/architecture.test.ts), same as
 * createMatchView's `live`.
 */

interface TokenResponse {
	access_token?: string;
	error?: string;
}

interface TokenClient {
	requestAccessToken(options?: { prompt?: string }): void;
}

/**
 * The Google Picker classes drivePicker.ts uses (#70). Declared here,
 * alongside `accounts`, because TypeScript requires every declaration of
 * `Window.google` across the project to agree on one shape - see
 * drivePicker.ts's own comment.
 */
interface PickerDoc {
	id: string;
	name: string;
}

interface PickerResponse {
	action: string;
	docs?: PickerDoc[];
}

interface PickerView {
	setSelectFolderEnabled(enabled: boolean): PickerView;
	setIncludeFolders(include: boolean): PickerView;
}

interface Picker {
	setVisible(visible: boolean): void;
}

interface PickerBuilder {
	addView(view: PickerView): PickerBuilder;
	setOAuthToken(token: string): PickerBuilder;
	setDeveloperKey(key: string): PickerBuilder;
	setAppId(appId: string): PickerBuilder;
	setCallback(callback: (response: PickerResponse) => void): PickerBuilder;
	build(): Picker;
}

declare global {
	interface Window {
		google?: {
			accounts: {
				oauth2: {
					initTokenClient(config: {
						client_id: string;
						scope: string;
						callback: (response: TokenResponse) => void;
					}): TokenClient;
				};
			};
			picker?: {
				DocsView: new (viewId: string) => PickerView;
				PickerBuilder: new () => PickerBuilder;
				ViewId: { FOLDERS: string };
				Action: { PICKED: string; CANCEL: string };
			};
		};
		gapi?: {
			load(api: string, callback: () => void): void;
		};
	}
}

const GIS_SRC = "https://accounts.google.com/gsi/client";
/** Google Drive tokens last an hour; ask again a little before that. */
const TOKEN_LIFETIME_MS = 55 * 60_000;

export interface DriveAuth {
	/** A Drive access token, asking the coach to sign in only if needed. */
	accessToken(): Promise<string>;
	/** Forget the cached token; the next accessToken() asks the coach again. */
	signOut(): void;
}

export function createDriveAuth(clientId: string, scope: string): DriveAuth {
	let gisReady: Promise<void> | null = null;
	let cached: { value: string; expiresAt: number } | null = null;

	function loadGis(): Promise<void> {
		if (!gisReady) {
			gisReady = new Promise((resolve, reject) => {
				if (window.google?.accounts?.oauth2) {
					resolve();
					return;
				}
				const script = document.createElement("script");
				script.src = GIS_SRC;
				script.async = true;
				script.addEventListener("load", () => resolve());
				script.addEventListener("error", () => {
					// Don't cache the failure: a later call (another tap on
					// "Koppla Google Drive") should try loading the script again,
					// not keep replaying this one rejection for the rest of the
					// page's life.
					gisReady = null;
					script.remove();
					reject(new Error("Kunde inte läsa in Google-inloggningen."));
				});
				document.head.append(script);
			});
		}
		return gisReady;
	}

	async function accessToken(): Promise<string> {
		if (cached && cached.expiresAt > Date.now()) return cached.value;
		await loadGis();
		const google = window.google;
		if (!google) throw new Error("Google-inloggningen kunde inte läsas in.");
		return new Promise<string>((resolve, reject) => {
			const client = google.accounts.oauth2.initTokenClient({
				client_id: clientId,
				scope,
				callback: (response) => {
					if (response.error || !response.access_token) {
						reject(new Error("Inloggningen misslyckades eller avbröts."));
						return;
					}
					cached = {
						value: response.access_token,
						expiresAt: Date.now() + TOKEN_LIFETIME_MS,
					};
					resolve(response.access_token);
				},
			});
			client.requestAccessToken();
		});
	}

	function signOut(): void {
		cached = null;
	}

	return { accessToken, signOut };
}
