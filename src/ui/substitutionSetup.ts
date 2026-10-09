import type { LimitedPlan, PlayerChoice } from "../core/limitedPlan.js";
import { LIMITS, numberWithin } from "../core/limits.js";
import type { RosterFile } from "../core/storage.js";
import {
	type FairnessPeriod,
	parseFairnessPeriod,
	presetOf,
	type RulesPreset,
	rulesForPreset,
	type SubstitutionRules,
} from "../core/substitutionRules.js";
import { aheadOfSquad, proposalFor, rulesForMatch } from "./matchProposal.js";
import {
	loadMatchSetup,
	type MatchSetupChoices,
	saveMatchSetup,
} from "./matchSetupStorage.js";
import { activeTeamId } from "./teamStorage.js";
import { TEXT } from "./text.js";

const PRESETS: readonly RulesPreset[] = ["free", "ersattare", "custom"];
const FAIRNESS_KINDS: readonly FairnessPeriod["kind"][] = [
	"recentMatches",
	"season",
	"range",
];
const CHOICES: readonly PlayerChoice[] = ["start", "bench", "sitOut"];

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

/** A labelled field: label above the control, optional help below. */
function field(
	id: string,
	label: string,
	control: HTMLElement,
	help?: string,
): HTMLDivElement {
	const wrap = el("div", "field");
	const labelEl = el("label", "field-label", label);
	labelEl.htmlFor = id;
	control.id = id;
	wrap.append(labelEl, control);
	if (help) {
		const helpEl = el("span", "field-help", help);
		helpEl.id = `${id}Help`;
		control.setAttribute("aria-describedby", helpEl.id);
		wrap.append(helpEl);
	}
	return wrap;
}

function numberInput(range: { min: number; max: number }): HTMLInputElement {
	const input = el("input");
	input.type = "number";
	input.inputMode = "numeric";
	input.min = String(range.min);
	input.max = String(range.max);
	return input;
}

function options(
	select: HTMLSelectElement,
	values: readonly string[],
	label: (value: string) => string,
): void {
	select.replaceChildren(
		...values.map((value) => {
			const option = el("option", undefined, label(value));
			option.value = value;
			return option;
		}),
	);
}

/**
 * Editing one set of substitution rules: a preset, and for "Egna regler"
 * the three limits. Calls `onChange` with valid rules only.
 */
function rulesEditor(
	idPrefix: string,
	legend: string,
	onChange: (rules: SubstitutionRules) => void,
): { element: HTMLFieldSetElement; show: (rules: SubstitutionRules) => void } {
	const fieldset = el("fieldset", "choice-group");
	fieldset.append(el("legend", "field-label", legend));
	const preset = el("select");
	options(preset, PRESETS, (p) => TEXT.rules.preset(p as RulesPreset));
	const substitutesIn = numberInput(LIMITS.substitutesIn);
	const occasions = numberInput(LIMITS.occasions);
	const reEntry = el("input");
	reEntry.type = "checkbox";
	reEntry.className = "keeper-toggle-box";
	const reEntryLabel = el("label", "check-field");
	reEntryLabel.append(reEntry, el("span", undefined, TEXT.rules.reEntry));
	const custom = el("div", "field-grid rules-custom");
	custom.append(
		field(`${idPrefix}SubstitutesIn`, TEXT.rules.substitutesIn, substitutesIn),
		field(
			`${idPrefix}Occasions`,
			TEXT.rules.occasions,
			occasions,
			TEXT.rules.occasionsHelp,
		),
		reEntryLabel,
	);
	const summary = el("p", "field-help");
	fieldset.append(
		field(`${idPrefix}Preset`, TEXT.rules.presetLabel, preset),
		custom,
		summary,
	);

	let current: SubstitutionRules = rulesForPreset("free");
	/** "Egna regler" stays chosen even when its values match a preset. */
	let customChosen = false;

	function show(rules: SubstitutionRules): void {
		current = rules;
		const chosen = customChosen ? "custom" : presetOf(rules);
		preset.value = chosen;
		custom.hidden = chosen !== "custom";
		summary.textContent = TEXT.rules.summary(rules);
		if (rules.kind === "limited") {
			substitutesIn.value = String(rules.substitutesIn);
			occasions.value = rules.occasions === null ? "" : String(rules.occasions);
			reEntry.checked = rules.reEntry;
		}
	}

	preset.addEventListener("change", () => {
		const chosen = preset.value as RulesPreset;
		customChosen = chosen === "custom";
		onChange(rulesForPreset(chosen));
	});
	const fromFields = () => {
		const base =
			current.kind === "limited" ? current : rulesForPreset("custom");
		if (base.kind !== "limited") return;
		onChange({
			kind: "limited",
			substitutesIn: numberWithin(
				substitutesIn.value,
				LIMITS.substitutesIn,
				base.substitutesIn,
			),
			occasions:
				occasions.value.trim() === ""
					? null
					: numberWithin(
							occasions.value,
							LIMITS.occasions,
							base.occasions ?? LIMITS.occasions.min,
						),
			reEntry: reEntry.checked,
		});
	};
	for (const input of [substitutesIn, occasions, reEntry])
		input.addEventListener("change", fromFields);
	return { element: fieldset, show };
}

/** Editing the period fairness is measured over. */
function fairnessEditor(onChange: (period: FairnessPeriod) => void): {
	element: HTMLFieldSetElement;
	show: (period: FairnessPeriod) => void;
} {
	const fieldset = el("fieldset", "choice-group");
	fieldset.append(el("legend", "field-label", TEXT.rules.fairnessLegend));
	const kind = el("select");
	options(kind, FAIRNESS_KINDS, (k) =>
		TEXT.rules.fairnessKind(k as FairnessPeriod["kind"]),
	);
	const count = numberInput(LIMITS.fairnessMatches);
	const year = numberInput(LIMITS.seasonYear);
	const from = el("input");
	from.type = "date";
	const to = el("input");
	to.type = "date";
	const countField = field("fairnessCount", TEXT.rules.fairnessCount, count);
	const yearField = field("fairnessYear", TEXT.rules.fairnessYear, year);
	const fromField = field("fairnessFrom", TEXT.rules.fairnessFrom, from);
	const toField = field("fairnessTo", TEXT.rules.fairnessTo, to);
	const message = el("p", "field-help");
	message.setAttribute("role", "status");
	const grid = el("div", "field-grid");
	grid.append(
		field("fairnessKind", TEXT.rules.fairnessKindLabel, kind),
		countField,
		yearField,
		fromField,
		toField,
	);
	fieldset.append(
		grid,
		el("p", "field-help", TEXT.rules.fairnessHelp),
		message,
	);

	let current: FairnessPeriod = {
		kind: "recentMatches",
		count: LIMITS.recentMatches,
	};

	function show(period: FairnessPeriod): void {
		current = period;
		kind.value = period.kind;
		countField.hidden = period.kind !== "recentMatches";
		yearField.hidden = period.kind !== "season";
		fromField.hidden = period.kind !== "range";
		toField.hidden = period.kind !== "range";
		if (period.kind === "recentMatches") count.value = String(period.count);
		if (period.kind === "season") year.value = String(period.year);
		if (period.kind === "range") {
			from.value = period.from;
			to.value = period.to;
		}
		message.textContent = "";
		message.classList.remove("error");
	}

	const today = () => new Date().toISOString().slice(0, 10);
	kind.addEventListener("change", () => {
		const thisYear = new Date().getFullYear();
		switch (kind.value) {
			case "season":
				onChange({ kind: "season", year: thisYear });
				return;
			case "range":
				onChange({ kind: "range", from: `${thisYear}-01-01`, to: today() });
				return;
			default:
				onChange({ kind: "recentMatches", count: LIMITS.recentMatches });
		}
	});
	count.addEventListener("change", () => {
		const previous =
			current.kind === "recentMatches" ? current.count : LIMITS.recentMatches;
		onChange({
			kind: "recentMatches",
			count: numberWithin(count.value, LIMITS.fairnessMatches, previous),
		});
	});
	year.addEventListener("change", () => {
		const previous =
			current.kind === "season" ? current.year : new Date().getFullYear();
		onChange({
			kind: "season",
			year: numberWithin(year.value, LIMITS.seasonYear, previous),
		});
	});
	for (const input of [from, to]) {
		input.addEventListener("change", () => {
			const period = parseFairnessPeriod({
				kind: "range",
				from: from.value,
				to: to.value,
			});
			if (period) onChange(period);
			else {
				message.textContent = TEXT.rules.fairnessInvalid;
				message.classList.add("error");
			}
		});
	}
	return { element: fieldset, show };
}

export interface SubstitutionSetup {
	/** Show the draft's rules, fairness period and, with limited swaps, the proposal. */
	render: (draft: RosterFile) => void;
}

/**
 * The "Byten" step on the setup screen (#171): the team's rules and
 * fairness period (saved in the squad file through `onTeamChange`), the
 * match's own rules, and with limited swaps the proposal the coach can
 * change. The match's rules and the coach's changes are saved for the
 * match page (matchSetupStorage.ts).
 */
export function createSubstitutionSetup(
	container: HTMLElement,
	onTeamChange: (change: {
		substitutions?: SubstitutionRules;
		fairness?: FairnessPeriod;
	}) => void,
): SubstitutionSetup {
	let setup: MatchSetupChoices = loadMatchSetup();
	let draft: RosterFile | null = null;
	/** Standing by squad id, and what it was computed from. */
	let ahead: { key: string; values: Record<string, number> } | null = null;
	let loading: string | null = null;

	const team = rulesEditor("teamRules", TEXT.rules.teamLegend, (rules) =>
		onTeamChange({ substitutions: rules }),
	);
	const teamHelp = el("p", "field-help", TEXT.rules.teamHelp);
	const fairness = fairnessEditor((period) =>
		onTeamChange({ fairness: period }),
	);
	const toggle = el("input");
	toggle.type = "checkbox";
	toggle.id = "matchRulesToggle";
	toggle.className = "keeper-toggle-box";
	const toggleLabel = el("label", "check-field");
	toggleLabel.htmlFor = toggle.id;
	toggleLabel.append(toggle, el("span", undefined, TEXT.rules.matchToggle));
	const match = rulesEditor("matchRules", TEXT.rules.matchLegend, (rules) =>
		changeSetup({ ...setup, rules }),
	);
	const proposal = el("section", "proposal");
	proposal.id = "matchProposal";
	proposal.setAttribute("aria-live", "polite");
	container.append(
		team.element,
		teamHelp,
		fairness.element,
		toggleLabel,
		match.element,
		proposal,
	);

	toggle.addEventListener("change", () => {
		if (!draft) return;
		changeSetup({
			...setup,
			rules: toggle.checked ? structuredClone(draft.substitutions) : null,
		});
	});

	function changeSetup(next: MatchSetupChoices): void {
		setup = next;
		saveMatchSetup(setup);
		if (draft) render(draft);
	}

	function choose(playerId: string, choice: PlayerChoice): void {
		changeSetup({
			...setup,
			choices: { ...setup.choices, [playerId]: choice },
		});
	}

	function render(next: RosterFile): void {
		draft = next;
		team.show(next.substitutions);
		fairness.show(next.fairness);
		toggle.checked = setup.rules !== null;
		match.element.hidden = setup.rules === null;
		if (setup.rules) match.show(setup.rules);
		const rules = rulesForMatch(next, setup);
		fairness.element.hidden =
			rules.kind === "free" && next.substitutions.kind === "free";
		if (rules.kind === "free" || next.players.length === 0) {
			proposal.hidden = true;
			proposal.replaceChildren();
			return;
		}
		proposal.hidden = false;
		const key = JSON.stringify([
			activeTeamId(),
			next.fairness,
			next.players.map((p) => [p.id, p.name]),
		]);
		if (ahead?.key === key) {
			showProposal(next, ahead.values);
			return;
		}
		if (loading === key) return;
		loading = key;
		proposal.replaceChildren(el("p", "hint", TEXT.rules.proposalLoading));
		void aheadOfSquad(activeTeamId(), next).then((values) => {
			if (loading !== key) return;
			loading = null;
			ahead = { key, values };
			if (draft) render(draft);
		});
	}

	function playerRow(
		id: string,
		name: string,
		choice: PlayerChoice,
		detail?: string,
	): HTMLLIElement {
		const item = el("li", "proposal-player");
		const text = el("span", "proposal-name", name);
		if (detail) text.append(el("span", "field-help", ` ${detail}`));
		const select = el("select");
		select.setAttribute("aria-label", TEXT.rules.choiceLabel(name));
		options(select, CHOICES, (c) => TEXT.rules.choice(c as PlayerChoice));
		select.value = choice;
		select.addEventListener("change", () =>
			choose(id, select.value as PlayerChoice),
		);
		item.append(text, select);
		return item;
	}

	function showProposal(
		next: RosterFile,
		values: Record<string, number>,
	): void {
		const plan = proposalFor(next, setup, values) as LimitedPlan;
		const name = (id: string) =>
			next.players.find((p) => p.id === id)?.name ?? id;
		const nodes: HTMLElement[] = [
			el("h3", undefined, TEXT.rules.proposalTitle),
			el("p", "field-help", TEXT.rules.proposalHelp(next.fairness)),
		];
		const group = (
			title: string,
			rows: readonly HTMLLIElement[],
		): HTMLElement[] => {
			if (rows.length === 0) return [];
			const list = el("ul", "proposal-list");
			list.append(...rows);
			return [el("h4", undefined, title), list];
		};
		const zoneOf = new Map(
			Object.entries(plan.zones).flatMap(([zone, ids]) =>
				ids.map((id) => [id, zone] as const),
			),
		);
		nodes.push(
			...group(
				TEXT.rules.starting,
				[...zoneOf].map(([id, zone]) =>
					playerRow(id, name(id), "start", TEXT.match.zoneName(zone)),
				),
			),
			...group(
				TEXT.rules.comingOn,
				plan.bench.map((id) => playerRow(id, name(id), "bench")),
			),
			...group(
				TEXT.rules.sittingOut,
				plan.sittingOut.map((p) =>
					playerRow(
						p.playerId,
						name(p.playerId),
						"sitOut",
						TEXT.rules.reason(p.aheadSeconds, next.fairness),
					),
				),
			),
		);
		nodes.push(el("h4", undefined, TEXT.rules.occasionsTitle));
		if (plan.occasions.length === 0) {
			nodes.push(el("p", "hint", TEXT.rules.noOccasions));
		} else {
			const list = el("ol", "proposal-occasions");
			for (const occasion of plan.occasions) {
				const item = el(
					"li",
					undefined,
					TEXT.rules.occasionWhen(
						occasion.at,
						occasion.atBreak,
						next.periodSeconds,
					),
				);
				const swaps = el("ul");
				for (const swap of occasion.swaps) {
					swaps.append(
						el(
							"li",
							undefined,
							TEXT.rules.swap(name(swap.inId), name(swap.outId)),
						),
					);
				}
				item.append(swaps);
				list.append(item);
			}
			nodes.push(list);
		}
		for (const warning of plan.warnings) {
			nodes.push(el("p", "field-help error", TEXT.rules.warning(warning)));
		}
		if (Object.keys(setup.choices).length > 0) {
			const reset = el("button", "btn btn-quiet", TEXT.rules.resetProposal);
			reset.type = "button";
			reset.addEventListener("click", () =>
				changeSetup({ ...setup, choices: {} }),
			);
			nodes.push(reset);
		}
		proposal.replaceChildren(...nodes);
	}

	return { render };
}
