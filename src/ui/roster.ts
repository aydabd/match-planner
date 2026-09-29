import { getFormat, outfieldCount, teamSizeOf } from "../core/formations.js";
import { LIMITS, numberWithin, rotationSecondsFrom } from "../core/limits.js";
import {
	newRoster,
	parseRosterFile,
	type RosterFile,
	StorageError,
	squadFile,
} from "../core/storage.js";
import type { Player } from "../core/types.js";
import { loadCoachName, saveCoachName } from "./coachName.js";
import { confirmWithSecondTap } from "./confirmButton.js";
import { emptyDraft, loadDraft, saveDraft } from "./draftStorage.js";
import { initFormationPicker } from "./formationPicker.js";
import { clearAllSavedData } from "./resetData.js";
import { clearSession } from "./sessionStorage.js";
import { TEXT } from "./text.js";

export interface RosterViewCallbacks {
	onStartMatch: (roster: RosterFile) => void;
}

/**
 * The setup screen. The squad being set up lives in this closure and is
 * loaded when the view is created, not when the module is imported.
 */
export function createRosterView(callbacks: RosterViewCallbacks): void {
	let draft: RosterFile = loadDraft();
	let nextIdCounter = 1;

	function freshId(): string {
		// Stable, human-inspectable ids (not shown to users) - avoids depending
		// on crypto.randomUUID, which is fine to have but not worth requiring.
		while (draft.players.some((p) => p.id === `p${nextIdCounter}`))
			nextIdCounter++;
		return `p${nextIdCounter++}`;
	}

	const rotationInput = document.getElementById(
		"rotationMinutesInput",
	) as HTMLInputElement;
	const playerList = document.getElementById("playerList") as HTMLDivElement;
	const squadCount = document.getElementById("squadCount") as HTMLSpanElement;
	const addForm = document.getElementById("addPlayerForm") as HTMLFormElement;
	const nameInput = document.getElementById(
		"newPlayerName",
	) as HTMLInputElement;
	const addPlayerBtn = document.getElementById(
		"addPlayerBtn",
	) as HTMLButtonElement;
	const squadFullMessage = document.getElementById(
		"squadFullMessage",
	) as HTMLElement;

	const byId = <T extends HTMLElement>(id: string) =>
		document.getElementById(id) as T;
	const periodsInput = byId<HTMLInputElement>("periodsInput");
	const periodMinutesInput = byId<HTMLInputElement>("periodMinutesInput");
	const opponentInput = byId<HTMLInputElement>("opponentInput");
	const venueInput = byId<HTMLInputElement>("venueInput");
	const matchDateInput = byId<HTMLInputElement>("matchDateInput");
	const coachNameInput = byId<HTMLInputElement>("coachNameInput");
	const startingKeeperField = byId<HTMLElement>("startingKeeperField");
	const startingKeeperSelect = byId<HTMLSelectElement>("startingKeeperSelect");

	// Limits come from core/limits.ts, never from numbers written in the HTML.
	rotationInput.min = String(LIMITS.rotationMinutes.min);
	rotationInput.max = String(LIMITS.rotationMinutes.max);
	rotationInput.step = "0.5";
	periodsInput.min = String(LIMITS.periods.min);
	periodsInput.max = String(LIMITS.periods.max);
	periodMinutesInput.min = String(LIMITS.periodMinutes.min);
	periodMinutesInput.max = String(LIMITS.periodMinutes.max);
	nameInput.maxLength = LIMITS.playerNameLength;
	for (const input of [opponentInput, venueInput]) {
		input.maxLength = LIMITS.matchDetailLength;
	}
	coachNameInput.maxLength = LIMITS.coachNameLength;
	coachNameInput.value = loadCoachName();
	const exportBtn = document.getElementById("exportBtn") as HTMLButtonElement;
	const importInput = document.getElementById(
		"importInput",
	) as HTMLInputElement;
	const importError = document.getElementById(
		"importError",
	) as HTMLParagraphElement;
	const startBtn = document.getElementById(
		"startMatchBtn",
	) as HTMLButtonElement;

	/** False while the coach is typing a custom formation that isn't valid yet. */
	let formationValid = true;
	const formationPicker = initFormationPicker({
		onChange: (formatId) => {
			formationValid = formatId !== null;
			if (formatId !== null && formatId !== draft.formatId) {
				// A new team size brings its own match length; a new formation
				// for the same team size keeps what the coach set.
				const sizeChanged = teamSizeOf(formatId) !== teamSizeOf(draft.formatId);
				const defaults = newRoster({ formatId });
				draft = sizeChanged
					? {
							...draft,
							formatId,
							periods: defaults.periods,
							periodSeconds: defaults.periodSeconds,
						}
					: { ...draft, formatId };
				persist();
			} else {
				render();
			}
		},
	});

	function render(): void {
		formationPicker.render(draft.formatId);
		rotationInput.value = String(draft.rotationSeconds / 60);
		periodsInput.value = String(draft.periods);
		periodMinutesInput.value = String(Math.round(draft.periodSeconds / 60));
		opponentInput.value = draft.match.opponent;
		venueInput.value = draft.match.venue;
		matchDateInput.value = draft.match.date;

		playerList.innerHTML = "";
		if (draft.players.length === 0) {
			const empty = document.createElement("p");
			empty.className = "empty-state";
			empty.textContent = TEXT.setup.emptySquad;
			playerList.appendChild(empty);
		}
		draft.players.forEach((player, idx) => {
			const row = document.createElement("div");
			row.className = "player-row";

			const input = document.createElement("input");
			input.type = "text";
			input.value = player.name;
			input.maxLength = LIMITS.playerNameLength;
			input.setAttribute("aria-label", TEXT.setup.playerNameLabel(idx + 1));
			input.addEventListener("change", () => {
				const trimmed = input.value.trim();
				if (trimmed) updatePlayer(player.id, trimmed);
				else input.value = player.name;
			});

			const removeBtn = document.createElement("button");
			removeBtn.type = "button";
			removeBtn.className = "remove-btn";
			removeBtn.textContent = "✕";
			removeBtn.setAttribute(
				"aria-label",
				TEXT.setup.removePlayer(player.name),
			);
			removeBtn.addEventListener("click", () => removePlayer(player.id));

			const keeperToggle = document.createElement("label");
			keeperToggle.className = "keeper-toggle";
			const keeperBox = document.createElement("input");
			keeperBox.type = "checkbox";
			keeperBox.className = "keeper-toggle-box";
			keeperBox.checked = player.goalkeeper;
			keeperBox.setAttribute(
				"aria-label",
				TEXT.setup.keeperToggleLabel(player.name),
			);
			keeperBox.addEventListener("change", () =>
				setGoalkeeper(player.id, keeperBox.checked),
			);
			const keeperText = document.createElement("span");
			keeperText.textContent = TEXT.setup.keeperToggle;
			keeperText.setAttribute("aria-hidden", "true");
			keeperToggle.append(keeperBox, keeperText);

			row.appendChild(input);
			row.appendChild(keeperToggle);
			row.appendChild(removeBtn);
			playerList.appendChild(row);
		});

		const format = getFormat(draft.formatId);
		// A tracked keeper plays in goal, so the outfield needs one more player.
		const needed = outfieldCount(format) + (draft.startingKeeperId ? 1 : 0);
		squadCount.textContent = TEXT.setup.squadCount(
			draft.players.length,
			needed,
		);

		const squadFull = draft.players.length >= LIMITS.squadSize;
		nameInput.disabled = squadFull;
		addPlayerBtn.disabled = squadFull;
		squadFullMessage.textContent = squadFull
			? TEXT.setup.squadFull(LIMITS.squadSize)
			: "";

		const missing = needed - draft.players.length;

		const keepers = draft.players.filter((p) => p.goalkeeper);
		startingKeeperField.hidden = keepers.length === 0;
		startingKeeperSelect.replaceChildren(
			...keepers.map((p) => {
				const option = document.createElement("option");
				option.value = p.id;
				option.textContent = p.name;
				option.selected = p.id === draft.startingKeeperId;
				return option;
			}),
		);
		startBtn.disabled = !formationValid || missing > 0;
		startBtn.textContent = !formationValid
			? TEXT.setup.startNeedsFormation
			: missing > 0
				? TEXT.setup.startNeedsPlayers(missing)
				: TEXT.setup.start(draft.players.length);
	}

	function clearImportError(): void {
		importError.textContent = "";
		importError.classList.remove("error");
	}

	function persist(): void {
		saveDraft(draft);
		render();
	}

	function updatePlayer(id: string, name: string): void {
		draft = {
			...draft,
			players: draft.players.map((p) => (p.id === id ? { ...p, name } : p)),
		};
		persist();
	}

	/**
	 * The starting keeper must be a marked goalkeeper: keep the current one if
	 * still marked, otherwise the first marked goalkeeper, or nobody.
	 */
	function withValidStartingKeeper(next: RosterFile): RosterFile {
		const keepers = next.players.filter((p) => p.goalkeeper);
		const stillKeeper = keepers.some((p) => p.id === next.startingKeeperId);
		return {
			...next,
			startingKeeperId: stillKeeper
				? next.startingKeeperId
				: (keepers[0]?.id ?? null),
		};
	}

	function setGoalkeeper(id: string, goalkeeper: boolean): void {
		draft = withValidStartingKeeper({
			...draft,
			players: draft.players.map((p) =>
				p.id === id ? { ...p, goalkeeper } : p,
			),
		});
		persist();
	}

	function removePlayer(id: string): void {
		draft = withValidStartingKeeper({
			...draft,
			players: draft.players.filter((p) => p.id !== id),
		});
		persist();
	}

	function addPlayer(name: string): void {
		const player: Player = { id: freshId(), name, goalkeeper: false };
		draft = { ...draft, players: [...draft.players, player] };
		persist();
	}

	periodsInput.addEventListener("change", () => {
		draft = {
			...draft,
			periods: numberWithin(periodsInput.value, LIMITS.periods, draft.periods),
		};
		persist();
	});

	periodMinutesInput.addEventListener("change", () => {
		const minutes = numberWithin(
			periodMinutesInput.value,
			LIMITS.periodMinutes,
			Math.round(draft.periodSeconds / 60),
		);
		draft = { ...draft, periodSeconds: minutes * 60 };
		persist();
	});

	for (const [input, field] of [
		[opponentInput, "opponent"],
		[venueInput, "venue"],
		[matchDateInput, "date"],
	] as const) {
		input.addEventListener("change", () => {
			draft = {
				...draft,
				match: { ...draft.match, [field]: input.value.trim() },
			};
			persist();
		});
	}

	startingKeeperSelect.addEventListener("change", () => {
		draft = { ...draft, startingKeeperId: startingKeeperSelect.value || null };
		persist();
	});

	coachNameInput.addEventListener("change", () => {
		coachNameInput.value = coachNameInput.value.trim();
		saveCoachName(coachNameInput.value);
	});

	rotationInput.addEventListener("change", () => {
		const rotationSeconds = rotationSecondsFrom(
			rotationInput.value,
			draft.rotationSeconds,
		);
		draft = { ...draft, rotationSeconds };
		persist();
	});

	addForm.addEventListener("submit", (e) => {
		e.preventDefault();
		const name = nameInput.value.trim();
		if (!name || draft.players.length >= LIMITS.squadSize) return;
		addPlayer(name);
		nameInput.value = "";
		nameInput.focus();
	});

	exportBtn.addEventListener("click", () => {
		const { fileName, json } = squadFile(draft, {
			createdAt: new Date().toISOString(),
			createdBy: loadCoachName(),
			appVersion: __APP_VERSION__,
		});
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = fileName;
		a.click();
		URL.revokeObjectURL(url);
	});

	importInput.addEventListener("change", async () => {
		const file = importInput.files?.[0];
		importInput.value = "";
		if (!file) return;
		try {
			const text = await file.text();
			const imported = parseRosterFile(JSON.parse(text));
			draft = imported;
			formationValid = true;
			formationPicker.reset(draft.formatId);
			clearImportError();
			persist();
		} catch (err) {
			const message =
				err instanceof StorageError
					? TEXT.squadFile.problem(err.problem)
					: TEXT.squadFile.unreadable;
			importError.textContent = message;
			importError.classList.add("error");
		}
	});

	confirmWithSecondTap(
		document.getElementById("startOverBtn") as HTMLButtonElement,
		{
			confirmLabel: TEXT.setup.confirmStartOver,
			onConfirm: () => {
				draft = emptyDraft();
				formationValid = true;
				formationPicker.reset(draft.formatId);
				clearImportError();
				clearSession();
				persist();
			},
		},
	);

	confirmWithSecondTap(
		document.getElementById("clearAllDataBtn") as HTMLButtonElement,
		{
			confirmLabel: TEXT.setup.confirmClearAll,
			onConfirm: () => {
				const appUrl = new URL(import.meta.env.BASE_URL, window.location.href);
				void clearAllSavedData(appUrl).finally(() => window.location.reload());
			},
		},
	);

	startBtn.addEventListener("click", () => {
		if (startBtn.disabled) return;
		callbacks.onStartMatch(draft);
	});

	render();
}
