import {
	type CollectedTeam,
	collectTeams,
	describeData,
} from "../core/importCollect.js";
import {
	type Classified,
	classifyFiles,
	type InputFile,
	type Skipped,
	screenBySize,
} from "../core/importPlan.js";
import type { PlacementChoice } from "../core/importTeam.js";
import {
	type Opened,
	openPackages,
	type PackageFile,
	type UnlockResult,
} from "../core/importUnlock.js";
import { LIMITS } from "../core/limits.js";
import { readItem, STORAGE_KEYS, teamScoped } from "./appStorage.js";
import { byId } from "./domHelpers.js";
import { DRIVE_CLIENT_ID } from "./driveConfig.js";
import { importTeam } from "./importApply.js";
import { createPlacementPanel } from "./placementChoice.js";
import { activeTeamId } from "./teamStorage.js";
import { TEXT } from "./text.js";

/** What has been chosen and unlocked so far, until "Läs in" or a new choice. */
interface Selection {
	plain: Classified[];
	packages: PackageFile[];
	skipped: Skipped[];
	opened: Opened[];
	locked: UnlockResult["locked"];
	damaged: UnlockResult["damaged"];
	/** Whether a password has been tried, so locked teams may be listed by id. */
	attempted: boolean;
}

const shortId = (id: string): string => id.slice(0, 8);

function addItem(list: HTMLElement, text: string, error = false): void {
	const li = document.createElement("li");
	li.textContent = text;
	if (error) li.classList.add("error");
	list.append(li);
}

/** A picked file's path: the folder-relative one when a folder was chosen. */
const pathOf = (file: File): string => file.webkitRelativePath || file.name;

async function readSelection(files: readonly File[]): Promise<Selection> {
	const entries = files.map((file) => ({
		file,
		path: pathOf(file),
		size: file.size,
	}));
	// Sizes first, so a huge file or a huge folder is never read into memory.
	const { accepted, skipped } = screenBySize(entries);
	const inputs: InputFile[] = [];
	for (const entry of accepted) {
		try {
			inputs.push({ path: entry.path, text: await entry.file.text() });
		} catch {
			skipped.push({ path: entry.path, reason: "notJson" });
		}
	}
	const sorted = classifyFiles(inputs);
	const texts = new Map(inputs.map((input) => [input.path, input.text]));
	const packages = sorted.files.filter((f) => f.kind === "package");
	return {
		plain: sorted.files.filter((f) => f.kind !== "package"),
		packages: packages.map((f) => ({
			path: f.path,
			text: texts.get(f.path) ?? "",
			teamIdHint: f.teamIdHint,
		})),
		skipped: [...skipped, ...sorted.skipped],
		opened: [],
		locked: [],
		damaged: [],
		attempted: false,
	};
}

/**
 * The "Hämta in" card (#154): pick files or a whole folder, see what each one
 * is before anything changes, open encrypted files with a password, and
 * apply with one button. Everything is read and decided on this device; the
 * password is only used to unlock and is cleared as soon as that is done.
 */
export function setUpImport(callbacks: {
	refresh: () => void;
	/** The active team changed id or was replaced (a new team, an adopted id). */
	teamChanged: () => void;
}): void {
	const t = TEXT.dataImport;
	const filesInput = byId("importFilesInput") as HTMLInputElement;
	const folderInput = byId("importFolderInput") as HTMLInputElement;
	const summary = byId("importSummary");
	const skippedList = byId("importSkipped");
	const messages = byId("importMessages");
	const passwordField = byId("importPasswordField");
	const passwordInput = byId("importPasswordInput") as HTMLInputElement;
	const unlockBtn = byId("importUnlockBtn") as HTMLButtonElement;
	const progress = byId("importProgressText");
	const teamChoice = byId("importTeamChoice");
	const teamSelect = byId("importTeamSelect") as HTMLSelectElement;
	const applyBtn = byId("importApplyBtn") as HTMLButtonElement;
	const driveHint = byId("importDriveHint");
	byId("importHint").textContent = t.hint;
	byId("importFolderHint").textContent = t.folderHint;
	byId("importTeamHint").textContent = t.teamChoiceHint;
	driveHint.textContent = t.driveHint;

	let selection: Selection | null = null;
	const placement = createPlacementPanel(byId("importPlacement"));

	function teams(): CollectedTeam[] {
		return selection
			? collectTeams(selection.plain, selection.opened).filter(
					(g) => g.teamId !== null,
				)
			: [];
	}

	function render(): void {
		summary.replaceChildren();
		skippedList.replaceChildren();
		teamSelect.replaceChildren();
		teamChoice.hidden = true;
		passwordField.hidden = true;
		applyBtn.disabled = true;
		if (selection === null) return;

		const groups = collectTeams(selection.plain, selection.opened);
		for (const group of groups) {
			const described = t.describe(describeData(group.data));
			addItem(
				summary,
				group.teamId === null
					? t.looseLine(described)
					: t.teamLine(group.name, shortId(group.teamId), described),
			);
		}
		if (!selection.attempted && selection.packages.length > 0) {
			addItem(summary, t.needPassword(selection.packages.length));
		}
		if (selection.attempted) {
			// Locked teams are listed by id only (their name is encrypted); a
			// locked file in no team folder is only counted.
			const byTeam = new Map<string, number>();
			let unplaced = 0;
			for (const locked of selection.locked) {
				if (locked.teamIdHint === null) unplaced++;
				else
					byTeam.set(
						locked.teamIdHint,
						(byTeam.get(locked.teamIdHint) ?? 0) + 1,
					);
			}
			for (const [teamId, files] of byTeam) {
				addItem(summary, t.lockedTeam(shortId(teamId), files));
			}
			if (unplaced > 0) addItem(summary, t.needPassword(unplaced));
		}
		for (const damaged of selection.damaged) {
			addItem(summary, t.damaged[damaged.reason](damaged.path), true);
		}
		const listed = selection.skipped.slice(0, LIMITS.importListedProblems);
		for (const skipped of listed) {
			addItem(skippedList, skippedText(skipped), true);
		}
		const rest = selection.skipped.length - listed.length;
		if (rest > 0) addItem(skippedList, t.moreSkipped(rest));

		passwordField.hidden = selection.packages.length === 0;
		const named = teams();
		if (named.length > 1) {
			teamSelect.replaceChildren(
				...named.map((team) => {
					const option = document.createElement("option");
					option.value = team.teamId ?? "";
					option.textContent =
						team.name === ""
							? t.unnamedTeam(shortId(team.teamId ?? ""))
							: team.name;
					return option;
				}),
			);
			teamChoice.hidden = false;
		}
		applyBtn.disabled = groups.length === 0;
	}

	function skippedText(skipped: Skipped): string {
		if (skipped.reason === "tooLarge") {
			return t.skipped.tooLarge(
				skipped.path,
				LIMITS.importFileBytes / (1024 * 1024),
			);
		}
		return t.skipped[skipped.reason](skipped.path);
	}

	async function choose(input: HTMLInputElement): Promise<void> {
		const files = [...(input.files ?? [])];
		input.value = "";
		messages.replaceChildren();
		placement.hide();
		driveHint.hidden = true;
		progress.textContent = "";
		passwordInput.value = "";
		selection = files.length === 0 ? null : await readSelection(files);
		render();
	}

	filesInput.addEventListener("change", () => void choose(filesInput));
	folderInput.addEventListener("change", () => void choose(folderInput));

	unlockBtn.addEventListener("click", async () => {
		const chosen = selection;
		if (chosen === null) return;
		const password = passwordInput.value;
		messages.replaceChildren();
		if (password === "") {
			addItem(messages, t.needPasswordFirst);
			return;
		}
		const remaining = [
			...chosen.packages.filter(
				(file) => !chosen.opened.some((o) => o.path === file.path),
			),
		];
		unlockBtn.disabled = true;
		try {
			const result = await openPackages(remaining, password, (done, total) => {
				progress.textContent = t.unlocking(done, total);
			});
			chosen.attempted = true;
			chosen.opened.push(...result.opened);
			chosen.locked = result.locked;
			chosen.damaged = [
				...chosen.damaged.filter(
					(d) => !result.opened.some((o) => o.path === d.path),
				),
				...result.damaged,
			];
			if (result.opened.length === 0 && result.damaged.length === 0) {
				addItem(messages, t.wrongPassword);
			}
		} finally {
			// The password is only needed to unlock; it is not kept.
			passwordInput.value = "";
			progress.textContent = "";
			unlockBtn.disabled = false;
		}
		render();
	});

	/** Apply what is chosen; `choice` is the coach's pick when the files are another team's. */
	function apply(choice?: PlacementChoice): void {
		const chosen = selection;
		if (chosen === null) return;
		const groups = collectTeams(chosen.plain, chosen.opened);
		const loose = groups.find((g) => g.teamId === null) ?? null;
		const named = groups.filter((g) => g.teamId !== null);
		const team =
			named.length <= 1
				? (named[0] ?? null)
				: (named.find((g) => g.teamId === teamSelect.value) ?? null);
		const before = activeTeamId();
		const outcome = importTeam(loose, team, choice);
		messages.replaceChildren();
		if (outcome.kind === "ask") {
			placement.ask(
				{ source: "files", name: outcome.name, counts: outcome.counts },
				apply,
			);
			return;
		}
		if (outcome.kind === "refused") {
			addItem(messages, t.refusedBelongsToOtherLocalTeam, true);
			return;
		}
		addItem(
			messages,
			t.result({
				added: outcome.applied.added,
				known: outcome.offered - outcome.applied.added,
				notesChanged: outcome.applied.notesChanged,
				squadTaken: outcome.applied.squadTaken,
			}),
		);
		if (activeTeamId() !== before) callbacks.teamChanged();
		const driveConnected =
			readItem(teamScoped(STORAGE_KEYS.driveFolderId, activeTeamId())) !== null;
		driveHint.hidden = DRIVE_CLIENT_ID === "" || driveConnected;
		selection = null;
		passwordInput.value = "";
		render();
		callbacks.refresh();
	}

	applyBtn.addEventListener("click", () => apply());
}
