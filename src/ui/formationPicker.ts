import {
	DEFAULT_TEAM_SIZE,
	formatChoice,
	parseFormation,
	TEAM_SIZES,
	type TeamSizeId,
} from "../core/formations.js";
import { TEXT } from "./text.js";

const CUSTOM = "custom";

export interface FormationPickerCallbacks {
	/** A valid format id was chosen, or null while a custom formation is invalid. */
	onChange: (formatId: string | null) => void;
}

export interface FormationPicker {
	/** Show the choice for this format id (the draft's last valid format). */
	render: (formatId: string) => void;
	/**
	 * Replace whatever the coach was choosing with this format, e.g. after
	 * loading a squad file: a half-typed custom formation is dropped.
	 */
	reset: (formatId: string) => void;
}

/** A pill-style radio button: the native input keeps keyboard and screen-reader support. */
function choice(
	name: string,
	value: string,
	label: string,
	checked: boolean,
): HTMLLabelElement {
	const wrap = document.createElement("label");
	wrap.className = "choice";
	const input = document.createElement("input");
	input.type = "radio";
	input.name = name;
	input.value = value;
	input.checked = checked;
	const text = document.createElement("span");
	text.className = "choice-label";
	text.textContent = label;
	wrap.append(input, text);
	return wrap;
}

/**
 * Team size and formation on the setup screen. The coach picks a size, then
 * one of its quick-pick formations or, opting in with "Egen", types their
 * own. Validation messages come from core/formations.parseFormation.
 */
export function initFormationPicker(
	callbacks: FormationPickerCallbacks,
): FormationPicker {
	const sizeChoices = document.getElementById("teamSizeChoices") as HTMLElement;
	const formationChoices = document.getElementById(
		"formationChoices",
	) as HTMLElement;
	const customField = document.getElementById(
		"customFormationField",
	) as HTMLElement;
	const customInput = document.getElementById(
		"customFormationInput",
	) as HTMLInputElement;
	const customMessage = document.getElementById(
		"customFormationMessage",
	) as HTMLElement;

	let size: TeamSizeId = DEFAULT_TEAM_SIZE;
	let customMode = false;
	let renderedKey = "";

	function showCustomResult(): void {
		const text = customInput.value;
		if (text.trim() === "") {
			customMessage.textContent = TEXT.formation.prompt(
				TEAM_SIZES[size].outfield,
			);
			customMessage.classList.remove("error");
			callbacks.onChange(null);
			return;
		}
		const parsed = parseFormation(text, size);
		if (parsed.ok) {
			customMessage.textContent = TEXT.formation.valid(
				parsed.formation,
				parsed.lines.length,
			);
			customMessage.classList.remove("error");
			callbacks.onChange(`${size}:${parsed.formation}`);
		} else {
			customMessage.textContent = TEXT.formation.problem(parsed.problem);
			customMessage.classList.add("error");
			callbacks.onChange(null);
		}
	}

	function render(formatId: string): void {
		const current = formatChoice(formatId);
		size = current.size;
		customMode ||= current.custom;
		const key = `${size}|${customMode ? CUSTOM : current.formation}`;
		// Rebuilding while the coach types would move focus out of the input.
		if (key === renderedKey) return;
		renderedKey = key;

		sizeChoices.replaceChildren(
			...Object.keys(TEAM_SIZES).map((id) =>
				choice("teamSize", id, id, id === size),
			),
		);
		formationChoices.replaceChildren(
			...TEAM_SIZES[size].presets.map((formation) =>
				choice(
					"formation",
					formation,
					formation,
					!customMode && formation === current.formation,
				),
			),
			choice("formation", CUSTOM, TEXT.formation.custom, customMode),
		);
		customField.hidden = !customMode;
		if (customMode && current.custom && customInput.value === "") {
			customInput.value = current.formation;
		}
	}

	function reset(formatId: string): void {
		const current = formatChoice(formatId);
		customMode = current.custom;
		customInput.value = current.custom ? current.formation : "";
		customMessage.textContent = "";
		customMessage.classList.remove("error");
		renderedKey = "";
		render(formatId);
	}

	sizeChoices.addEventListener("change", (event) => {
		const value = (event.target as HTMLInputElement).value as TeamSizeId;
		customMode = false;
		customInput.value = "";
		customMessage.textContent = "";
		callbacks.onChange(`${value}:${TEAM_SIZES[value].presets[0]}`);
	});

	formationChoices.addEventListener("change", (event) => {
		const value = (event.target as HTMLInputElement).value;
		if (value === CUSTOM) {
			customMode = true;
			renderedKey = "";
			customField.hidden = false;
			showCustomResult();
			customInput.focus();
			return;
		}
		customMode = false;
		callbacks.onChange(`${size}:${value}`);
	});

	customInput.addEventListener("input", showCustomResult);

	return { render, reset };
}
