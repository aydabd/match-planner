import { getFormat, outfieldCount } from "../core/formations.js";
import { LIMITS, rotationMinutesFrom } from "../core/limits.js";
import {
	parseRosterFile,
	type RosterFile,
	StorageError,
	squadFile,
} from "../core/storage.js";
import type { Player } from "../core/types.js";
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

	// Limits come from core/limits.ts, never from numbers written in the HTML.
	rotationInput.min = String(LIMITS.rotationMinutes.min);
	rotationInput.max = String(LIMITS.rotationMinutes.max);
	nameInput.maxLength = LIMITS.playerNameLength;
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
				draft = { ...draft, formatId };
				persist();
			} else {
				render();
			}
		},
	});

	function render(): void {
		formationPicker.render(draft.formatId);
		rotationInput.value = String(Math.round(draft.rotationSeconds / 60));

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

			row.appendChild(input);
			row.appendChild(removeBtn);
			playerList.appendChild(row);
		});

		const format = getFormat(draft.formatId);
		squadCount.textContent = TEXT.setup.squadCount(
			draft.players.length,
			outfieldCount(format),
		);

		const squadFull = draft.players.length >= LIMITS.squadSize;
		nameInput.disabled = squadFull;
		addPlayerBtn.disabled = squadFull;
		squadFullMessage.textContent = squadFull
			? TEXT.setup.squadFull(LIMITS.squadSize)
			: "";

		const missing = outfieldCount(format) - draft.players.length;
		startBtn.disabled = !formationValid || missing > 0;
		startBtn.textContent = !formationValid
			? TEXT.setup.startNeedsFormation
			: missing > 0
				? TEXT.setup.startNeedsPlayers(missing)
				: TEXT.setup.start(draft.players.length);
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

	function removePlayer(id: string): void {
		draft = { ...draft, players: draft.players.filter((p) => p.id !== id) };
		persist();
	}

	function addPlayer(name: string): void {
		const player: Player = { id: freshId(), name };
		draft = { ...draft, players: [...draft.players, player] };
		persist();
	}

	rotationInput.addEventListener("change", () => {
		const minutes = rotationMinutesFrom(
			rotationInput.value,
			Math.round(draft.rotationSeconds / 60),
		);
		draft = { ...draft, rotationSeconds: minutes * 60 };
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
		const { fileName, json } = squadFile(draft);
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
			importError.textContent = "";
			importError.classList.remove("error");
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
				importError.textContent = "";
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
