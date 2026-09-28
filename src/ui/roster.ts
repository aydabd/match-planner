import { FORMATS, getFormat, outfieldCount } from "../core/formations.js";
import {
	parseRosterFile,
	type RosterFile,
	StorageError,
	squadFile,
} from "../core/storage.js";
import type { Player } from "../core/types.js";
import { loadDraft, saveDraft } from "./draftStorage.js";

let draft: RosterFile = loadDraft();
let nextIdCounter = 1;

function freshId(): string {
	// Stable, human-inspectable ids (not shown to users) - avoids depending
	// on crypto.randomUUID, which is fine to have but not worth requiring.
	while (draft.players.some((p) => p.id === `p${nextIdCounter}`))
		nextIdCounter++;
	return `p${nextIdCounter++}`;
}

export interface RosterViewCallbacks {
	onStartMatch: (roster: RosterFile) => void;
}

export function initRosterView(callbacks: RosterViewCallbacks): void {
	const formatSelect = document.getElementById(
		"formatSelect",
	) as HTMLSelectElement;
	const rotationInput = document.getElementById(
		"rotationMinutesInput",
	) as HTMLInputElement;
	const playerList = document.getElementById("playerList") as HTMLDivElement;
	const squadCount = document.getElementById("squadCount") as HTMLSpanElement;
	const addForm = document.getElementById("addPlayerForm") as HTMLFormElement;
	const nameInput = document.getElementById(
		"newPlayerName",
	) as HTMLInputElement;
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

	for (const format of Object.values(FORMATS)) {
		const opt = document.createElement("option");
		opt.value = format.id;
		opt.textContent = format.label;
		formatSelect.appendChild(opt);
	}

	function render(): void {
		// Older squads saved "7v7"; show the quick pick it stands for.
		formatSelect.value = getFormat(draft.formatId).id;
		rotationInput.value = String(Math.round(draft.rotationSeconds / 60));

		playerList.innerHTML = "";
		if (draft.players.length === 0) {
			const empty = document.createElement("p");
			empty.className = "empty-state";
			empty.textContent = "Inga spelare än. Lägg till dem som är med idag.";
			playerList.appendChild(empty);
		}
		draft.players.forEach((player, idx) => {
			const row = document.createElement("div");
			row.className = "player-row";

			const input = document.createElement("input");
			input.type = "text";
			input.value = player.name;
			input.maxLength = 40;
			input.setAttribute("aria-label", `Namn, spelare ${idx + 1}`);
			input.addEventListener("change", () => {
				const trimmed = input.value.trim();
				if (trimmed) updatePlayer(player.id, trimmed);
				else input.value = player.name;
			});

			const removeBtn = document.createElement("button");
			removeBtn.type = "button";
			removeBtn.className = "remove-btn";
			removeBtn.textContent = "✕";
			removeBtn.setAttribute("aria-label", `Ta bort ${player.name}`);
			removeBtn.addEventListener("click", () => removePlayer(player.id));

			row.appendChild(input);
			row.appendChild(removeBtn);
			playerList.appendChild(row);
		});

		const format = getFormat(draft.formatId);
		squadCount.textContent = `${draft.players.length} av minst ${outfieldCount(format)}`;

		const canStart = draft.players.length >= outfieldCount(format);
		startBtn.disabled = !canStart;
		startBtn.textContent = canStart
			? `Starta match med ${draft.players.length} spelare`
			: `Lägg till ${outfieldCount(format) - draft.players.length} spelare till för att starta`;
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

	formatSelect.addEventListener("change", () => {
		draft = { ...draft, formatId: formatSelect.value };
		persist();
	});

	rotationInput.addEventListener("change", () => {
		const minutes = Math.max(
			1,
			Math.min(30, Number(rotationInput.value) || 10),
		);
		draft = { ...draft, rotationSeconds: minutes * 60 };
		persist();
	});

	addForm.addEventListener("submit", (e) => {
		e.preventDefault();
		const name = nameInput.value.trim();
		if (!name) return;
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
			importError.textContent = "";
			importError.classList.remove("error");
			persist();
		} catch (err) {
			const message =
				err instanceof StorageError
					? err.message
					: "Filen kunde inte läsas. Välj en fil som sparats från MatchPlanner.";
			importError.textContent = message;
			importError.classList.add("error");
		}
	});

	startBtn.addEventListener("click", () => {
		if (draft.players.length < outfieldCount(getFormat(draft.formatId))) return;
		callbacks.onStartMatch(draft);
	});

	render();
}
