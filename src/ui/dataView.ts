import {
	EXPORT_BUNDLE_VERSION,
	type ExportBundle,
} from "../core/exportBundle.js";
import type { PlacementChoice } from "../core/importTeam.js";
import { LIMITS } from "../core/limits.js";
import { isAcceptableNewPassword } from "../core/passwords.js";
import {
	encryptJson,
	SecurePackageError,
	securePackageToJson,
} from "../core/securePackage.js";
import { readItem, STORAGE_KEYS, teamScoped, writeItem } from "./appStorage.js";
import { byId, downloadJson } from "./domHelpers.js";
import { loadDraft } from "./draftStorage.js";
import { createDriveAuth } from "./driveAuth.js";
import {
	createDriveBackup,
	DriveFolderError,
	DriveMarkerError,
	PasswordTooShortError,
} from "./driveBackup.js";
import { createDriveClient } from "./driveClient.js";
import {
	DRIVE_APP_ID,
	DRIVE_CLIENT_ID,
	DRIVE_PICKER_API_KEY,
	DRIVE_SCOPE,
} from "./driveConfig.js";
import { pickFolder } from "./drivePicker.js";
import { loadSeasonData } from "./historyData.js";
import { setUpImport } from "./importView.js";
import { loadMatchFiles } from "./matchFileStorage.js";
import { renderTeamSwitcher } from "./page.js";
import { createPlacementPanel } from "./placementChoice.js";
import { loadPlayerNotes } from "./playerNotesStorage.js";
import { activeTeamId } from "./teamStorage.js";
import { TEXT } from "./text.js";

/**
 * Wires the "backup to Google Drive" card; hidden when no client id is
 * set. The folder is chosen via drivePicker.ts (#70) rather than the app
 * silently creating one, both so it is easy to find and so a folder
 * shared between coaches can be picked by each of them. Every file is
 * encrypted with a password the coach types in for each call (#81); it is
 * never saved anywhere.
 */
function setUpDriveBackup(callbacks: {
	refresh: () => void;
	teamChanged: () => void;
}): { syncTeam: () => void } {
	const card = byId("historyBackupCard");
	if (DRIVE_CLIENT_ID === "") return { syncTeam: () => {} };
	card.hidden = false;

	const connectBtn = byId("driveConnectBtn") as HTMLButtonElement;
	const chooseFolderBtn = byId("driveChooseFolderBtn") as HTMLButtonElement;
	const folderStatus = byId("driveFolderStatus");
	const folderLink = byId("driveFolderLink") as HTMLAnchorElement;
	const passwordField = byId("drivePasswordField");
	const passwordInput = byId("drivePasswordInput") as HTMLInputElement;
	const backupBtn = byId("driveBackupBtn") as HTMLButtonElement;
	const restoreBtn = byId("driveRestoreBtn") as HTMLButtonElement;
	const status = byId("driveStatus");
	const teamChoice = byId("driveTeamChoice");
	const teamSelect = byId("driveTeamSelect") as HTMLSelectElement;
	const restoreTeamBtn = byId("driveRestoreTeamBtn") as HTMLButtonElement;
	const t = TEXT.history.drive;

	/** The sentence for why a backup or restore did not go through. */
	function driveFailure(err: unknown): string {
		if (err instanceof SecurePackageError) return t.wrongPassword;
		if (err instanceof DriveFolderError) return t.folderRefused[err.reason];
		if (err instanceof PasswordTooShortError) {
			return t.passwordTooShort(LIMITS.minPasswordLength);
		}
		if (err instanceof DriveMarkerError) return t.markerInvalid;
		return t.failed;
	}

	const placement = createPlacementPanel(byId("drivePlacement"));
	const auth = createDriveAuth(DRIVE_CLIENT_ID, DRIVE_SCOPE);
	const backup = createDriveBackup(createDriveClient(() => auth.accessToken()));

	function showFolder(id: string, name: string): void {
		writeItem(teamScoped(STORAGE_KEYS.driveFolderId, activeTeamId()), id);
		writeItem(teamScoped(STORAGE_KEYS.driveFolderName, activeTeamId()), name);
		folderLink.textContent = name;
		folderLink.href = `https://drive.google.com/drive/folders/${id}`;
		folderStatus.hidden = false;
		chooseFolderBtn.textContent = t.changeFolder;
		passwordField.hidden = false;
		backupBtn.hidden = false;
		restoreBtn.hidden = false;
	}

	/** Show the folder the active team has chosen, or none: teams have a folder each. */
	function syncTeam(): void {
		const id = readItem(teamScoped(STORAGE_KEYS.driveFolderId, activeTeamId()));
		const name = readItem(
			teamScoped(STORAGE_KEYS.driveFolderName, activeTeamId()),
		);
		if (id !== null && name !== null) {
			showFolder(id, name);
			return;
		}
		folderStatus.hidden = true;
		chooseFolderBtn.textContent = t.chooseFolder;
		passwordField.hidden = true;
		backupBtn.hidden = true;
		restoreBtn.hidden = true;
		teamChoice.hidden = true;
		placement.hide();
	}

	connectBtn.addEventListener("click", async () => {
		status.textContent = t.connecting;
		try {
			await auth.accessToken();
			connectBtn.hidden = true;
			chooseFolderBtn.hidden = false;
			status.textContent = t.signedIn;
		} catch {
			status.textContent = t.signInFailed;
		}
	});

	chooseFolderBtn.addEventListener("click", async () => {
		status.textContent = t.choosingFolder;
		chooseFolderBtn.disabled = true;
		try {
			const token = await auth.accessToken();
			const chosen = await pickFolder(
				token,
				DRIVE_PICKER_API_KEY,
				DRIVE_APP_ID,
			);
			if (chosen) {
				showFolder(chosen.id, chosen.name);
				status.textContent = t.folderLabel(chosen.name);
			} else {
				// Cancelling "Byt mapp" leaves the previously chosen folder
				// active (it is still in storage, and backup/restore still
				// work against it) - only claim "no folder chosen" when
				// that is actually true.
				const currentName = readItem(
					teamScoped(STORAGE_KEYS.driveFolderName, activeTeamId()),
				);
				status.textContent =
					currentName !== null ? t.folderLabel(currentName) : t.noFolderChosen;
			}
		} catch {
			status.textContent = t.folderPickerFailed;
		} finally {
			chooseFolderBtn.disabled = false;
		}
	});

	function currentFolderId(): string | null {
		return readItem(teamScoped(STORAGE_KEYS.driveFolderId, activeTeamId()));
	}

	backupBtn.addEventListener("click", async () => {
		const folderId = currentFolderId();
		if (folderId === null) return;
		if (passwordInput.value === "") {
			status.textContent = t.needPassword;
			return;
		}
		status.textContent = t.backingUp;
		backupBtn.disabled = true;
		try {
			const { uploaded, stateSaved } = await backup.backup(
				folderId,
				passwordInput.value,
			);
			status.textContent = t.backedUp(uploaded, stateSaved);
		} catch (err) {
			status.textContent = driveFailure(err);
		} finally {
			backupBtn.disabled = false;
			// Not left on screen once the call is over (#147).
			passwordInput.value = "";
		}
	});

	/**
	 * Restore from the picked folder. When the folder holds several teams
	 * and this one is empty the coach is asked which (#142): the choice is
	 * shown, and "Läs in laget" restores that team.
	 */
	async function runRestore(
		teamId?: string,
		choice?: PlacementChoice,
	): Promise<void> {
		const folderId = currentFolderId();
		if (folderId === null) return;
		if (passwordInput.value === "") {
			status.textContent = t.needPassword;
			return;
		}
		status.textContent = t.restoring;
		restoreBtn.disabled = true;
		restoreTeamBtn.disabled = true;
		// The password has to stay for "Läs in laget" while a choice is open.
		let choicePending = false;
		const before = activeTeamId();
		try {
			const outcome = await backup.restore(
				folderId,
				passwordInput.value,
				teamId,
				choice,
			);
			if (outcome.kind === "different-team") {
				// This team has data and the folder is another team's (#154): the
				// coach picks, with the numbers in front of them. Nothing has
				// changed yet, and the password stays for the pick.
				teamChoice.hidden = true;
				status.textContent = "";
				placement.ask(
					{ source: "drive", name: outcome.name, counts: outcome.counts },
					(picked) => void runRestore(outcome.teamId, picked),
				);
				choicePending = true;
				return;
			}
			if (outcome.kind === "choose") {
				teamSelect.replaceChildren(
					...outcome.teams.map((team, index) => {
						const option = document.createElement("option");
						option.value = team.teamId;
						option.textContent =
							team.name === "" ? t.unnamedTeam(index + 1) : team.name;
						return option;
					}),
				);
				teamChoice.hidden = false;
				status.textContent = t.chooseTeam;
				choicePending = true;
				return;
			}
			teamChoice.hidden = true;
			placement.hide();
			status.textContent = t.restored(outcome);
			if (activeTeamId() !== before) callbacks.teamChanged();
			callbacks.refresh();
		} catch (err) {
			status.textContent = driveFailure(err);
		} finally {
			restoreBtn.disabled = false;
			restoreTeamBtn.disabled = false;
			if (!choicePending) passwordInput.value = "";
		}
	}

	restoreBtn.addEventListener("click", () => {
		placement.hide();
		void runRestore();
	});
	restoreTeamBtn.addEventListener(
		"click",
		() => void runRestore(teamSelect.value),
	);

	syncTeam();
	return { syncTeam };
}

/**
 * The "Skicka ut" card (#81): a coach's whole local season -
 * roster draft, every match file, player notes - as one file protected by
 * one password (core/exportBundle.ts, core/securePackage.ts), for moving
 * everything to another device without Google Drive. Purely local: no
 * network, no sign-in.
 */
function setUpSecureExport(): void {
	const passwordInput = byId("secureExportPasswordInput") as HTMLInputElement;
	const exportBtn = byId("secureExportBtn") as HTMLButtonElement;
	const status = byId("secureExportStatus");
	const t = TEXT.history.secureExport;

	exportBtn.addEventListener("click", async () => {
		if (passwordInput.value === "") {
			status.textContent = t.needPassword;
			return;
		}
		if (!isAcceptableNewPassword(passwordInput.value)) {
			status.textContent = t.passwordTooShort(LIMITS.minPasswordLength);
			return;
		}
		const bundle: ExportBundle = {
			schemaVersion: EXPORT_BUNDLE_VERSION,
			roster: loadDraft(),
			matches: loadMatchFiles(),
			playerNotes: loadPlayerNotes(),
		};
		const pkg = await encryptJson(passwordInput.value, bundle);
		downloadJson(
			`matchplanner-export-${new Date().toISOString().slice(0, 10)}.json`,
			securePackageToJson(pkg),
		);
		status.textContent = t.exported;
		passwordInput.value = "";
	});
}

/**
 * The Data page (#154): one place to bring data in, send it out and keep it
 * in Google Drive. The statistics page keeps only statistics.
 */
export function createDataView(): { refresh: () => void } {
	/** The team switcher and the Drive card show the active team; redraw them. */
	function teamChanged(): void {
		renderTeamSwitcher();
		drive.syncTeam();
	}

	// Only the newest call may draw, as on the statistics page.
	let latestRender = 0;
	async function refresh(): Promise<void> {
		const thisRender = ++latestRender;
		const { history } = await loadSeasonData();
		if (thisRender !== latestRender) return;
		byId("historyCount").textContent =
			history.matches === 0
				? TEXT.history.empty
				: TEXT.history.matchesCount(history.matches, history.months.length);
	}

	const drive = setUpDriveBackup({ refresh, teamChanged });
	setUpImport({ refresh, teamChanged });
	setUpSecureExport();
	void refresh();
	return { refresh };
}
