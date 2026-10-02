import type { MergeCounts, PlacementChoice } from "../core/importTeam.js";
import { TEXT } from "./text.js";

export interface PlacementPrompt {
	source: "files" | "drive";
	/** The other team's name, "" when it has none. Shown as text only. */
	name: string;
	counts: MergeCounts;
}

export interface PlacementPanel {
	/** Show the two choices with the numbers; `onChoose` runs once one is picked (a merge only after a confirm step). */
	ask(
		prompt: PlacementPrompt,
		onChoose: (choice: PlacementChoice) => void,
	): void;
	hide(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	text = "",
	className = "",
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	node.textContent = text;
	if (className !== "") node.className = className;
	return node;
}

/**
 * The choice shown when a team with data is given another team's files or
 * Drive folder (#154): never decided silently. "Läs in som nytt lag" is the
 * default and mixes nothing; "Slå ihop" shows the numbers once more and
 * needs a second, explicit confirmation. The panel is built into
 * `container` with `textContent` only, so a hostile team name is just text.
 */
export function createPlacementPanel(container: HTMLElement): PlacementPanel {
	const t = TEXT.placement;
	const intro = element("p", "", "hint");
	const numbers = element("p", "", "hint");
	const newBtn = element("button", t.newTeam, "btn btn-primary");
	const mergeBtn = element("button", t.merge, "btn btn-secondary");
	for (const button of [newBtn, mergeBtn]) button.type = "button";
	const choices = element("div", "", "row-buttons");
	choices.append(newBtn, mergeBtn);
	const confirm = element("div");
	confirm.hidden = true;
	const confirmText = element("p", "", "hint");
	const confirmBtn = element("button", t.confirm, "btn btn-primary");
	const cancelBtn = element("button", t.cancel, "btn btn-ghost");
	for (const button of [confirmBtn, cancelBtn]) button.type = "button";
	const confirmRow = element("div", "", "row-buttons");
	confirmRow.append(confirmBtn, cancelBtn);
	confirm.append(confirmText, confirmRow);
	container.replaceChildren(
		intro,
		numbers,
		choices,
		element("p", t.newTeamHint, "hint"),
		element("p", t.mergeHint, "hint"),
		confirm,
	);

	let pending: ((choice: PlacementChoice) => void) | null = null;
	let sentence = "";

	function hide(): void {
		pending = null;
		container.hidden = true;
		confirm.hidden = true;
		choices.hidden = false;
	}
	function choose(choice: PlacementChoice): void {
		const run = pending;
		hide();
		run?.(choice);
	}

	newBtn.addEventListener("click", () => choose("new"));
	mergeBtn.addEventListener("click", () => {
		choices.hidden = true;
		confirm.hidden = false;
		confirmText.textContent = `${sentence} ${t.confirmNote}`;
		confirmBtn.focus();
	});
	confirmBtn.addEventListener("click", () => choose("merge"));
	cancelBtn.addEventListener("click", () => {
		confirm.hidden = true;
		choices.hidden = false;
		newBtn.focus();
	});

	return {
		ask(prompt, onChoose) {
			pending = onChoose;
			intro.textContent = t.intro(prompt.source, prompt.name);
			sentence = t.numbers(prompt.source, prompt.counts);
			numbers.textContent = sentence;
			confirm.hidden = true;
			choices.hidden = false;
			container.hidden = false;
			newBtn.focus();
		},
		hide,
	};
}
