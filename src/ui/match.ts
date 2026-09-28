import { getFormat } from "../core/formations.js";
import { LIMITS } from "../core/limits.js";
import {
	assignKeeper,
	changeKeeper,
	cloneAssignment,
	formatTime,
	generateRotationSafe,
	lineupChanges,
	resetPlayers,
	swapWithBench,
	takeOutForMatch,
	tickTempSwaps,
	undoTempSwaps,
} from "../core/match.js";
import {
	kickoff,
	lineupChanged,
	type MatchClock,
	type MatchPlan,
	matchSecond,
	NEW_CLOCK,
	periodStatus,
	rotationStatus,
	startNextPeriod,
	swapDueAt,
	tick as tickClock,
} from "../core/matchClock.js";
import {
	type MatchFile,
	matchFileToJson,
	newMatchFile,
	parseMatchFile,
} from "../core/matchFile.js";
import { buildReport, type StoredReport } from "../core/report.js";
import {
	applyElapsed,
	createSchedulerState,
	fairnessSpread,
	generateRotation,
	SchedulingError,
	addPlayer as schedulerAddPlayer,
	setUnavailable,
} from "../core/scheduler.js";
import type { MatchDetails, RosterFile } from "../core/storage.js";
import {
	applyChain,
	type SubstitutionChain,
	substitutionChains,
} from "../core/substitutions.js";
import { recordLineup, type TimelineEvent } from "../core/timeline.js";
import type {
	FormatConfig,
	RotationAssignment,
	SchedulerState,
} from "../core/types.js";
import { loadCoachName } from "./coachName.js";
import { confirmWithSecondTap } from "./confirmButton.js";
import { keepMatchFiles } from "./matchFileStorage.js";
import { saveReport } from "./reportStorage.js";
import {
	clearSession,
	loadSession,
	type MatchSession,
	type MutableAssignment,
	type PendingSwap,
	saveSession,
	type TempSwap,
} from "./sessionStorage.js";
import { TEXT } from "./text.js";

interface Els {
	formatLabel: HTMLElement;
	rotationLabel: HTMLElement;
	fairnessLabel: HTMLElement;
	swapAnnouncer: HTMLElement;
	periodLabel: HTMLElement;
	periodTime: HTMLElement;
	nextPeriodBtn: HTMLButtonElement;
	breakKeeperField: HTMLElement;
	breakKeeperSelect: HTMLSelectElement;
	keeperPanel: HTMLElement;
	keeperPanelText: HTMLElement;
	keeperPanelSelect: HTMLSelectElement;
	keeperPanelConfirm: HTMLButtonElement;
	keeperPanelCancel: HTMLButtonElement;
	timerDisplay: HTMLElement;
	timerProgress: HTMLElement;
	timerRemaining: HTMLElement;
	clockCard: HTMLElement;
	matchMenu: HTMLDetailsElement;
	startBtn: HTMLButtonElement;
	pauseBtn: HTMLButtonElement;
	testBtn: HTMLButtonElement;
	newTeamBtn: HTMLButtonElement;
	pitch: HTMLElement;
	previewBody: HTMLElement;
	benchList: HTMLElement;
	swapPanel: HTMLElement;
	undoBtn: HTMLButtonElement;
	alertBanner: HTMLElement;
	alertList: HTMLElement;
	playtimeList: HTMLElement;
	resetBtn: HTMLButtonElement;
	addLateBtn: HTMLButtonElement;
	lateArrivalPanel: HTMLElement;
	backToSetupBtn: HTMLButtonElement;
	endMatchBtn: HTMLButtonElement;
	clockNotice: HTMLElement;
	reportBtn: HTMLButtonElement;
}

function getEls(): Els {
	const byId = <T extends HTMLElement>(id: string) =>
		document.getElementById(id) as T;
	return {
		formatLabel: byId("formatLabel"),
		rotationLabel: byId("rotationLabel"),
		fairnessLabel: byId("fairnessLabel"),
		swapAnnouncer: byId("swapAnnouncer"),
		periodLabel: byId("periodLabel"),
		periodTime: byId("periodTime"),
		nextPeriodBtn: byId("nextPeriodBtn"),
		breakKeeperField: byId("breakKeeperField"),
		breakKeeperSelect: byId("breakKeeperSelect"),
		keeperPanel: byId("keeperPanel"),
		keeperPanelText: byId("keeperPanelText"),
		keeperPanelSelect: byId("keeperPanelSelect"),
		keeperPanelConfirm: byId("keeperPanelConfirm"),
		keeperPanelCancel: byId("keeperPanelCancel"),
		timerDisplay: byId("timerDisplay"),
		timerProgress: byId("timerProgress"),
		timerRemaining: byId("timerRemaining"),
		clockCard: byId("clockCard"),
		matchMenu: byId<HTMLDetailsElement>("matchMenu"),
		startBtn: byId("startBtn"),
		pauseBtn: byId("pauseBtn"),
		testBtn: byId("testBtn"),
		newTeamBtn: byId("newTeamBtn"),
		pitch: byId("pitch"),
		previewBody: byId("previewBody"),
		benchList: byId("benchList"),
		swapPanel: byId("swapPanel"),
		undoBtn: byId("undoBtn"),
		alertBanner: byId("alertBanner"),
		alertList: byId("alertList"),
		playtimeList: byId("playtimeList"),
		resetBtn: byId("resetMatchBtn"),
		addLateBtn: byId("addLateBtn"),
		lateArrivalPanel: byId("lateArrivalPanel"),
		backToSetupBtn: byId("backToSetupBtn"),
		endMatchBtn: byId("endMatchBtn"),
		clockNotice: byId("clockNotice"),
		reportBtn: byId("reportBtn"),
	};
}

export interface MatchCallbacks {
	onExitToSetup: () => void;
	/** The match is over (or the coach asks again): show its report. */
	onShowReport: (report: StoredReport) => void;
}

/** A new id for a match; unique across devices so match files never clash. */
function newMatchId(): string {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
	);
}

/**
 * Mutable "current match" cell. Event listeners (wired exactly once, see
 * initMatchView) always read/write through this so that starting a second
 * match after returning to setup never re-attaches duplicate handlers.
 */
interface LiveMatch {
	matchId: string;
	schedulerState: SchedulerState;
	playerNames: Map<string, string>;
	format: FormatConfig;
	rotationIndex: number;
	plan: MatchPlan;
	clock: MatchClock;
	match: MatchDetails;
	/** Players marked as goalkeeper in the squad, offered first as keeper. */
	goalkeepers: string[];
	/** Who is in goal next period, as chosen during a break. */
	nextKeeperId: string | null;
	/** Everything that happened; lineup snapshots give minutes per line. */
	timeline: TimelineEvent[];
	/** The next lineup, fixed when the swap warning starts. */
	pendingSwap: PendingSwap | null;
	/** The interval is ticking (the coach has not paused). */
	running: boolean;
	/** Wall-clock time (ms) up to which the clock has counted. */
	lastTickMs: number;
	timerHandle: ReturnType<typeof setInterval> | null;
	currentAssignment: MutableAssignment;
	tempSwaps: TempSwap[];
	selected: { zoneId: string; idx: number } | null;
	pendingBenchIdx: number | null;
}

export interface MatchView {
	/** Start a new match with this squad. */
	start: (roster: RosterFile) => void;
	/** Resume the saved match, if there is one. Returns false otherwise. */
	resume: () => boolean;
}

/**
 * The live match screen. Looks up its elements and wires every button once;
 * the match in progress lives in this closure, so starting a new match only
 * replaces `live` and never re-attaches handlers.
 */
export function createMatchView(callbacks: MatchCallbacks): MatchView {
	const els = getEls();
	let live: LiveMatch | null = null;
	let caughtUpTimer: ReturnType<typeof setTimeout> | null = null;

	function nameOf(id: string): string {
		return live?.playerNames.get(id) ?? id;
	}

	function persist(): void {
		if (!live) return;
		const session: MatchSession = {
			schemaVersion: 2,
			running: live.running,
			lastTickMs: live.lastTickMs,
			matchId: live.matchId,
			formatId: live.format.id,
			plan: live.plan,
			clock: live.clock,
			match: live.match,
			playerNames: Object.fromEntries(live.playerNames.entries()),
			schedulerPlayers: live.schedulerState.players,
			schedulerOrder: live.schedulerState.order,
			keeperId: live.schedulerState.keeperId,
			goalkeepers: live.goalkeepers,
			timeline: live.timeline,
			pendingSwap: live.pendingSwap,
			rotationIndex: live.rotationIndex,
			currentAssignment: live.currentAssignment,
			tempSwaps: live.tempSwaps,
		};
		saveSession(session);
	}

	// ---------------- rendering ----------------

	function pitchChip(id: string, zoneId: string, idx: number): HTMLElement {
		const el = document.createElement("button");
		el.type = "button";
		el.className = "chip";
		const isSelected =
			live?.selected?.zoneId === zoneId && live.selected.idx === idx;
		if (isSelected) el.classList.add("selected");
		el.setAttribute("aria-pressed", String(isSelected));
		el.textContent = nameOf(id);
		el.addEventListener("click", () => onPitchClick(zoneId, idx));
		return el;
	}

	function benchChip(id: string, idx: number): HTMLElement {
		const wrap = document.createElement("button");
		wrap.type = "button";
		wrap.className = "bench-chip";
		const isSelected = live?.pendingBenchIdx === idx;
		if (isSelected) wrap.classList.add("selected");
		else if (live?.selected) wrap.classList.add("is-target");
		wrap.setAttribute("aria-pressed", String(isSelected));
		const name = document.createElement("span");
		name.className = "bench-name";
		name.textContent = nameOf(id);
		wrap.appendChild(name);
		// A player resting on a temporary swap shows when they go back on.
		const activeTemp = live?.tempSwaps.find((t) => t.outId === id);
		if (activeTemp) {
			const cd = document.createElement("span");
			cd.className = "bench-countdown";
			cd.textContent = TEXT.match.backIn(
				formatTime(activeTemp.remainingSeconds),
			);
			wrap.appendChild(cd);
		}
		wrap.addEventListener("click", () => onBenchClick(idx));
		return wrap;
	}

	function renderPitch(): void {
		if (!live) return;
		els.pitch.innerHTML = "";
		const zonesTopFirst = [...live.format.zones].reverse();
		for (const zone of zonesTopFirst) {
			const row = document.createElement("div");
			row.className = "line-row";
			const label = document.createElement("span");
			label.className = "zone-label";
			label.textContent = TEXT.match.zoneName(zone.id);
			const chips = document.createElement("div");
			chips.className = "line-chips";
			for (const [idx, id] of (
				live.currentAssignment.zones[zone.id] ?? []
			).entries()) {
				chips.appendChild(pitchChip(id, zone.id, idx));
			}
			row.appendChild(label);
			row.appendChild(chips);
			els.pitch.appendChild(row);
		}
		const keeperId = live.schedulerState.keeperId;
		if (keeperId !== null) {
			const row = document.createElement("div");
			row.className = "line-row";
			const label = document.createElement("span");
			label.className = "zone-label";
			label.textContent = TEXT.match.keeperLine;
			const chips = document.createElement("div");
			chips.className = "line-chips";
			const chip = document.createElement("button");
			chip.type = "button";
			chip.className = "chip gk";
			chip.textContent = nameOf(keeperId);
			chip.setAttribute("aria-expanded", String(keeperPanelOpen));
			chip.addEventListener("click", toggleKeeperPanel);
			chips.appendChild(chip);
			row.appendChild(label);
			row.appendChild(chips);
			els.pitch.appendChild(row);
		}
	}

	// ---------------- goalkeeper ----------------

	let keeperPanelOpen = false;

	/**
	 * Who may take over in goal: available players other than the keeper,
	 * marked goalkeepers first, then everyone else in squad order.
	 */
	function keeperCandidates(): string[] {
		if (!live) return [];
		const state = live.schedulerState;
		const available = state.order.filter(
			(id) => id !== state.keeperId && !state.players[id]?.unavailable,
		);
		const goalkeepers = available.filter((id) =>
			live?.goalkeepers.includes(id),
		);
		return [
			...goalkeepers,
			...available.filter((id) => !goalkeepers.includes(id)),
		];
	}

	function fillKeeperOptions(
		select: HTMLSelectElement,
		ids: readonly string[],
		selected: string | null,
	): void {
		select.replaceChildren(
			...ids.map((id) => {
				const option = document.createElement("option");
				option.value = id;
				option.textContent = live?.goalkeepers.includes(id)
					? TEXT.match.goalkeeperOption(nameOf(id))
					: nameOf(id);
				option.selected = id === selected;
				return option;
			}),
		);
	}

	function toggleKeeperPanel(): void {
		if (!live || live.schedulerState.keeperId === null) return;
		keeperPanelOpen = !keeperPanelOpen;
		renderKeeperPanel();
		renderPitch();
	}

	function renderKeeperPanel(): void {
		const keeperId = live?.schedulerState.keeperId ?? null;
		const open = keeperPanelOpen && keeperId !== null;
		els.keeperPanel.classList.toggle("show", open);
		if (!open || keeperId === null) return;
		els.keeperPanelText.textContent = TEXT.match.keeperInGoal(nameOf(keeperId));
		fillKeeperOptions(els.keeperPanelSelect, keeperCandidates(), null);
	}

	function confirmKeeperChange(): void {
		if (!live) return;
		const next = els.keeperPanelSelect.value;
		if (!next) return;
		if (!switchKeeper(next)) {
			// Nobody may take the new keeper's seat: say so, keep the panel open.
			els.keeperPanelText.textContent = TEXT.match.keeperChangeBlocked(
				nameOf(next),
			);
			return;
		}
		keeperPanelOpen = false;
		renderKeeperPanel();
		render();
	}

	/** During a break: keep the keeper, or pick who plays in goal next period. */
	function renderBreakKeeper(): void {
		if (!live) return;
		const keeperId = live.schedulerState.keeperId;
		const show = live.clock.phase === "periodBreak" && keeperId !== null;
		els.breakKeeperField.hidden = !show;
		if (!show || keeperId === null) return;
		const options = [keeperId, ...keeperCandidates()];
		const selected = live.nextKeeperId ?? keeperId;
		if (els.breakKeeperSelect.dataset.key === options.join()) return;
		els.breakKeeperSelect.dataset.key = options.join();
		fillKeeperOptions(els.breakKeeperSelect, options, selected);
	}

	function renderBench(): void {
		if (!live) return;
		els.benchList.innerHTML = "";
		if (live.currentAssignment.bench.length === 0) {
			const empty = document.createElement("p");
			empty.className = "empty-state";
			empty.textContent = TEXT.match.emptyBench;
			els.benchList.appendChild(empty);
			return;
		}
		for (const [idx, id] of live.currentAssignment.bench.entries()) {
			els.benchList.appendChild(benchChip(id, idx));
		}
	}

	/** Build a paragraph from plain text and bold (player name) parts, without innerHTML. */
	function sentence(
		parts: readonly (string | { bold: string })[],
	): HTMLElement {
		const p = document.createElement("p");
		for (const part of parts) {
			if (typeof part === "string") p.append(part);
			else {
				const strong = document.createElement("strong");
				strong.textContent = part.bold;
				p.appendChild(strong);
			}
		}
		return p;
	}

	function renderSwapPanel(): void {
		if (!live) return;
		els.swapPanel.innerHTML = "";
		if (!live.selected) {
			els.swapPanel.classList.remove("show");
			return;
		}
		const outId =
			live.currentAssignment.zones[live.selected.zoneId]?.[live.selected.idx];
		if (outId === undefined) {
			live.selected = null;
			els.swapPanel.classList.remove("show");
			return;
		}
		els.swapPanel.classList.add("show");

		if (live.pendingBenchIdx === null) {
			els.swapPanel.appendChild(
				sentence([{ bold: nameOf(outId) }, TEXT.match.selected]),
			);
			const row = document.createElement("div");
			row.className = "row";
			const outBtn = document.createElement("button");
			outBtn.type = "button";
			outBtn.className = "btn-danger";
			outBtn.textContent = TEXT.match.outForMatch;
			const selected = live.selected;
			if (!selected) return;
			outBtn.addEventListener("click", () =>
				markUnavailable(selected.zoneId, selected.idx),
			);
			const cancelBtn = document.createElement("button");
			cancelBtn.type = "button";
			cancelBtn.className = "btn-cancel";
			cancelBtn.textContent = TEXT.match.cancel;
			cancelBtn.addEventListener("click", () => {
				if (live) live.selected = null;
				render();
			});
			row.appendChild(outBtn);
			row.appendChild(cancelBtn);
			els.swapPanel.appendChild(row);
		} else {
			const inId = live.currentAssignment.bench[live.pendingBenchIdx];
			if (inId === undefined) {
				live.pendingBenchIdx = null;
				render();
				return;
			}
			els.swapPanel.appendChild(
				sentence([
					{ bold: nameOf(inId) },
					TEXT.match.goesInFor,
					{ bold: nameOf(outId) },
					TEXT.match.howLong,
				]),
			);
			const row = document.createElement("div");
			row.className = "row";
			LIMITS.tempSwapSeconds.forEach((secs) => {
				const b = document.createElement("button");
				b.type = "button";
				b.className = "btn-chip";
				b.textContent = TEXT.match.minutes(secs / 60);
				b.addEventListener("click", () => commitTempSwap(secs));
				row.appendChild(b);
			});
			const untilNext = document.createElement("button");
			untilNext.type = "button";
			untilNext.className = "btn-chip";
			untilNext.textContent = TEXT.match.untilNextSwap;
			untilNext.addEventListener("click", () => commitTempSwap(null));
			row.appendChild(untilNext);
			const cancelBtn = document.createElement("button");
			cancelBtn.type = "button";
			cancelBtn.className = "btn-cancel";
			cancelBtn.textContent = TEXT.match.cancel;
			cancelBtn.addEventListener("click", () => {
				if (live) {
					live.selected = null;
					live.pendingBenchIdx = null;
				}
				render();
			});
			row.appendChild(cancelBtn);
			els.swapPanel.appendChild(row);
		}
	}

	function renderAlertBanner(): void {
		if (!live) return;
		const currentLive = live;
		const unavailableIds = currentLive.schedulerState.order.filter(
			(id) => currentLive.schedulerState.players[id]?.unavailable,
		);
		// The banner is role="alert" and render() runs every clock tick; only
		// rebuild when the list changes so screen readers don't re-announce it.
		const key = JSON.stringify(unavailableIds.map((id) => [id, nameOf(id)]));
		if (els.alertList.dataset.key === key) return;
		els.alertList.dataset.key = key;
		els.alertList.innerHTML = "";
		if (unavailableIds.length === 0) {
			els.alertBanner.classList.remove("show");
			return;
		}
		els.alertBanner.classList.add("show");
		unavailableIds.forEach((id) => {
			const row = document.createElement("div");
			row.className = "alert-row";
			const span = document.createElement("span");
			span.textContent = TEXT.match.notPlayingToday(nameOf(id));
			const btn = document.createElement("button");
			btn.type = "button";
			btn.textContent = TEXT.match.backInSquad;
			btn.addEventListener("click", () => {
				// Rows outlive a single render now, so resolve the match at click time.
				if (!live) return;
				setUnavailable(live.schedulerState, id, false);
				render();
			});
			row.appendChild(span);
			row.appendChild(btn);
			els.alertList.appendChild(row);
		});
	}

	function nameColumn(
		title: string,
		className: string,
		ids: readonly string[],
		emptyText: string,
	): HTMLElement {
		const col = document.createElement("div");
		col.className = `next-col ${className}`;
		const h = document.createElement("h3");
		h.textContent = title;
		col.appendChild(h);
		if (ids.length === 0) {
			const p = document.createElement("span");
			p.className = "next-empty";
			p.textContent = emptyText;
			col.appendChild(p);
			return col;
		}
		const list = document.createElement("ul");
		list.className = "next-names";
		for (const id of ids) {
			const li = document.createElement("li");
			li.textContent = nameOf(id);
			list.appendChild(li);
		}
		col.appendChild(list);
		return col;
	}

	/**
	 * The warning before a swap: one row per substitution, each with Klart.
	 * The rows are rebuilt only when the substitutions change, so keyboard
	 * focus stays put while the countdown ticks, and the screen reader hears
	 * the warning once when it starts and once when the swap is due.
	 */
	function renderSwapWarning(): void {
		if (!live?.pendingSwap) return;
		const { remainingSeconds, due } = rotationStatus(live.clock, live.plan);
		const chains = pendingChains();
		const rowsKey = JSON.stringify(chains);

		let status = els.previewBody.querySelector<HTMLElement>(
			".swap-warning-status",
		);
		if (!status || els.previewBody.dataset.rows !== rowsKey) {
			els.previewBody.dataset.rows = rowsKey;
			els.previewBody.replaceChildren();
			status = document.createElement("p");
			status.className = "swap-warning-status";
			els.previewBody.append(status, swapRows(chains));
		}
		status.textContent = due
			? TEXT.match.swapNow
			: TEXT.match.swapIn(formatTime(remainingSeconds));

		const announcement = due
			? TEXT.match.swapNow
			: TEXT.match.swapAnnouncement(
					chains.map((c) =>
						TEXT.match.substitution(nameOf(c.inId), nameOf(c.outId)),
					),
				);
		const announceKey = due ? "due" : `warning:${rowsKey}`;
		if (els.swapAnnouncer.dataset.key !== announceKey) {
			els.swapAnnouncer.dataset.key = announceKey;
			els.swapAnnouncer.textContent = announcement;
		}
	}

	function swapRows(chains: readonly SubstitutionChain[]): HTMLElement {
		if (chains.length === 0) {
			const same = document.createElement("p");
			same.className = "preview-none";
			same.textContent = TEXT.match.sameTeam;
			return same;
		}
		const list = document.createElement("ul");
		list.className = "swap-list";
		for (const chain of chains) {
			const item = document.createElement("li");
			item.className = "swap-item";
			const text = document.createElement("div");
			const main = document.createElement("span");
			main.className = "swap-title";
			main.textContent = TEXT.match.substitution(
				nameOf(chain.inId),
				nameOf(chain.outId),
			);
			text.appendChild(main);
			for (const move of chain.moves) {
				const line = document.createElement("span");
				line.className = "swap-move";
				line.textContent = TEXT.match.moves(
					nameOf(move.playerId),
					TEXT.match.zoneName(move.to),
				);
				text.appendChild(line);
			}
			const done = document.createElement("button");
			done.type = "button";
			done.className = "btn btn-primary";
			done.textContent = TEXT.match.done;
			done.setAttribute(
				"aria-label",
				TEXT.match.doneLabel(nameOf(chain.inId), nameOf(chain.outId)),
			);
			done.addEventListener("click", () => {
				confirmChain(chain);
				refreshClock();
				render();
			});
			item.append(text, done);
			list.appendChild(item);
		}
		return list;
	}

	function renderPreview(): void {
		if (!live) return;
		els.previewBody.parentElement?.classList.toggle(
			"heads-up",
			live.pendingSwap !== null,
		);
		if (live.pendingSwap) {
			renderSwapWarning();
			return;
		}
		delete els.previewBody.dataset.rows;
		delete els.swapAnnouncer.dataset.key;
		// Keep the full-lineup disclosure open across clock ticks.
		const wasOpen =
			els.previewBody.querySelector<HTMLDetailsElement>(".next-lineup")?.open ??
			false;
		els.previewBody.innerHTML = "";
		let next: RotationAssignment;
		try {
			next = generateRotation(live.schedulerState);
		} catch (err) {
			const p = document.createElement("p");
			p.className = "preview-none";
			p.textContent =
				err instanceof SchedulingError
					? TEXT.match.schedulingProblem(err.problem)
					: TEXT.match.cannotPlanNextSwap;
			els.previewBody.appendChild(p);
			return;
		}
		const { comingIn, goingOut } = lineupChanges(live.currentAssignment, next);

		const summary = document.createElement("div");
		summary.className = "next-summary";
		summary.appendChild(
			nameColumn(
				TEXT.match.comingIn,
				"next-in",
				comingIn,
				TEXT.match.noneComingIn,
			),
		);
		summary.appendChild(
			nameColumn(
				TEXT.match.goingOut,
				"next-out",
				goingOut,
				TEXT.match.noneGoingOut,
			),
		);
		els.previewBody.appendChild(summary);

		const lineup = document.createElement("details");
		lineup.className = "next-lineup";
		lineup.open = wasOpen;
		const lineupSummary = document.createElement("summary");
		lineupSummary.textContent = TEXT.match.showFullLineup;
		lineup.appendChild(lineupSummary);

		const zonesTopFirst = [...live.format.zones].reverse();
		for (const zone of zonesTopFirst) {
			const row = document.createElement("div");
			row.className = "preview-line";
			const tag = document.createElement("span");
			tag.className = "zone-tag";
			tag.textContent = TEXT.match.zoneName(zone.id);
			row.appendChild(tag);
			(next.zones[zone.id] ?? []).forEach((id) => {
				const c = document.createElement("span");
				c.className = "chip-ghost";
				c.textContent = nameOf(id);
				if (comingIn.includes(id)) {
					// Colour marks incoming players visually; the hidden text says it
					// for screen readers, so the legend isn't colour-only.
					c.classList.add("is-new");
					const sr = document.createElement("span");
					sr.className = "visually-hidden";
					sr.textContent = TEXT.match.comingInHint;
					c.appendChild(sr);
				}
				row.appendChild(c);
			});
			lineup.appendChild(row);
		}
		const benchRow = document.createElement("div");
		benchRow.className = "preview-line";
		const benchTag = document.createElement("span");
		benchTag.className = "zone-tag";
		benchTag.textContent = TEXT.match.benchLine;
		benchRow.appendChild(benchTag);
		next.bench.forEach((id) => {
			const c = document.createElement("span");
			c.className = "chip-ghost";
			c.textContent = nameOf(id);
			benchRow.appendChild(c);
		});
		lineup.appendChild(benchRow);
		const legend = document.createElement("p");
		legend.className = "hint";
		legend.textContent = TEXT.match.comingInLegend;
		lineup.appendChild(legend);
		els.previewBody.appendChild(lineup);
	}

	function renderPlaytime(): void {
		if (!live) return;
		const currentLive = live;
		els.playtimeList.innerHTML = "";
		const onPitch = new Set(Object.values(live.currentAssignment.zones).flat());
		const maxSeconds = Math.max(
			1,
			...currentLive.schedulerState.order.map(
				(id) => currentLive.schedulerState.players[id]?.totalSeconds ?? 0,
			),
		);
		currentLive.schedulerState.order.forEach((id) => {
			const p = currentLive.schedulerState.players[id];
			if (!p) return;
			const inGoal = id === currentLive.schedulerState.keeperId;
			const status = p.unavailable
				? "out"
				: onPitch.has(id) || inGoal
					? "on-pitch"
					: "on-bench";
			const row = document.createElement("div");
			row.className = `pt-row${status === "on-bench" ? " is-bench" : ""}`;
			const nameEl = document.createElement("span");
			nameEl.className = `pt-name ${status}`;
			nameEl.textContent = nameOf(id);
			if (status === "on-pitch") {
				const tag = document.createElement("span");
				tag.className = "pt-status";
				tag.textContent = inGoal ? TEXT.match.inGoal : TEXT.match.onPitch;
				nameEl.appendChild(tag);
			}
			const timeEl = document.createElement("span");
			timeEl.className = "pt-time";
			timeEl.textContent = formatTime(p.totalSeconds);
			const bar = document.createElement("div");
			bar.className = "pt-bar";
			bar.setAttribute("aria-hidden", "true");
			const fill = document.createElement("span");
			fill.style.width = `${(p.totalSeconds / maxSeconds) * 100}%`;
			bar.appendChild(fill);
			row.appendChild(nameEl);
			row.appendChild(timeEl);
			row.appendChild(bar);
			els.playtimeList.appendChild(row);
		});
	}

	function render(): void {
		if (!live) return;
		// Inside a live region: skip identical writes so ticks don't re-announce.
		const rotationText = String(live.rotationIndex + 1);
		if (els.rotationLabel.textContent !== rotationText)
			els.rotationLabel.textContent = rotationText;
		els.fairnessLabel.textContent = TEXT.match.fairness(
			formatTime(fairnessSpread(live.schedulerState)),
		);
		renderPitch();
		renderBreakKeeper();
		renderBench();
		renderSwapPanel();
		renderAlertBanner();
		renderPreview();
		renderPlaytime();
		persist();
	}

	// ---------------- interactions ----------------

	function onPitchClick(zoneId: string, idx: number): void {
		if (!live) return;
		if (
			live.selected &&
			live.selected.zoneId === zoneId &&
			live.selected.idx === idx
		)
			live.selected = null;
		else live.selected = { zoneId, idx };
		live.pendingBenchIdx = null;
		render();
	}

	function onBenchClick(idx: number): void {
		if (!live?.selected) return;
		live.pendingBenchIdx = idx;
		render();
	}

	function commitTempSwap(durationSeconds: number | null): void {
		if (!live?.selected || live.pendingBenchIdx === null) return;
		const { zoneId, idx } = live.selected;
		const swap = swapWithBench(
			live.currentAssignment,
			zoneId,
			idx,
			live.pendingBenchIdx,
			durationSeconds,
		);
		if (swap === undefined) return;
		if (swap) live.tempSwaps.push(swap);
		live.selected = null;
		live.pendingBenchIdx = null;
		noteLineup();
		render();
	}

	function markUnavailable(zoneId: string, idx: number): void {
		if (!live) return;
		const playerId = live.currentAssignment.zones[zoneId]?.[idx];
		takeOutForMatch(live.schedulerState, live.currentAssignment, zoneId, idx);
		if (playerId !== undefined) {
			live.timeline.push({
				type: "outForMatch",
				at: now(),
				period: live.clock.period,
				playerId,
			});
		}
		// The planned swap may include the player; plan it again.
		live.pendingSwap = null;
		noteLineup();
		live.selected = null;
		live.pendingBenchIdx = null;
		render();
	}

	// ---------------- clock ----------------
	// The rules live in core/matchClock.ts; here we only tick it once a second
	// while the match is running and show its state.

	/**
	 * The clock follows the device's wall clock, not the number of timer
	 * callbacks: a phone that pauses timers while the screen is locked, or a
	 * page that was reloaded, catches up the seconds it missed. The seconds
	 * are counted one by one, so swaps, rests, period ends and the timeline
	 * come out exactly as if the page had stayed open.
	 */
	function tick(): void {
		if (live?.running !== true || live.clock.phase !== "playing") return;
		const passed = Math.floor((Date.now() - live.lastTickMs) / 1000);
		if (passed < 0) {
			// The device clock went backwards: start again from now and count
			// just the one second this timer call stands for.
			live.lastTickMs = Date.now() - 1000;
			countSeconds(1, { show: true });
			return;
		}
		// Less than a whole second since the last count (a timer that fired a
		// hair early, or right after catching up): nothing to add yet.
		if (passed >= 1) countSeconds(passed, { show: true });
	}

	/** One second of play; true if it ended the match. */
	function step(): boolean {
		if (live?.clock.phase !== "playing") return false;
		applyElapsed(live.schedulerState, live.currentAssignment, 1);
		const restsBefore = live.tempSwaps.length;
		live.tempSwaps = tickTempSwaps(live.currentAssignment, live.tempSwaps, 1);
		const restEnded = live.tempSwaps.length < restsBefore;
		const result = tickClock(live.clock, live.plan);
		live.clock = result.clock;
		// A rest that ended changed the lineup; record it from this second.
		if (restEnded) noteLineup();
		let matchEnded = false;
		for (const event of result.events) {
			if (event.type === "matchEnded") matchEnded = true;
			if (event.type === "periodEnded") {
				live.timeline.push({
					type: "periodEnd",
					at: now(),
					period: event.period,
				});
				live.pendingSwap = null;
			}
		}
		if (live.clock.phase === "playing") prepareSwapWarning();
		return matchEnded;
	}

	/** Count `seconds` of play; returns how many were counted (a period end stops early). */
	function countSeconds(seconds: number, options: { show: boolean }): number {
		if (!live) return 0;
		live.lastTickMs += seconds * 1000;
		let matchEnded = false;
		let counted = 0;
		while (counted < seconds && live.clock.phase === "playing") {
			matchEnded = step() || matchEnded;
			counted++;
		}
		// A period end stops the clock; the coach starts the next period.
		if (live.clock.phase !== "playing") stopTimer();
		refreshClock();
		render();
		if (matchEnded) finishMatch(options);
		return counted;
	}

	/** The report from the timeline so far, as it would be saved. */
	function currentReport(): StoredReport | null {
		if (!live) return null;
		return {
			schemaVersion: 1,
			matchId: live.matchId,
			savedAt: new Date().toISOString(),
			createdBy: loadCoachName(),
			appVersion: __APP_VERSION__,
			formatLabel: live.format.label,
			match: live.match,
			report: buildReport({
				timeline: live.timeline,
				players: live.schedulerState.order.map((id) => ({
					id,
					name: nameOf(id),
				})),
				endedAt: now(),
			}),
		};
	}

	/** The match file: audit, setup, squad and the whole timeline. */
	function currentMatchFile(): MatchFile | null {
		if (!live) return null;
		const { plan } = live;
		return newMatchFile({
			audit: {
				matchId: live.matchId,
				createdAt: new Date().toISOString(),
				createdBy: loadCoachName(),
				appVersion: __APP_VERSION__,
			},
			match: live.match,
			setup: {
				formatId: live.format.id,
				periods: plan.periods,
				periodSeconds: plan.periodSeconds,
				rotationSeconds: plan.rotationSeconds,
			},
			players: live.schedulerState.order.map((id) => ({
				id,
				name: nameOf(id),
				goalkeeper: live?.goalkeepers.includes(id) ?? false,
			})),
			timeline: live.timeline,
			endedAt: now(),
		});
	}

	/**
	 * The match is over: keep its report and its match file on this device
	 * (for the season history) and show the report. A match file that would
	 * not pass the same checks as an imported one is not kept.
	 */
	function finishMatch(options: { show: boolean } = { show: true }): void {
		const stored = currentReport();
		if (!stored) return;
		saveReport(stored);
		const file = currentMatchFile();
		if (file) {
			try {
				keepMatchFiles([parseMatchFile(JSON.parse(matchFileToJson(file)))]);
			} catch {
				// Nothing to add to the history from a match that never kicked off.
			}
		}
		if (options.show) callbacks.onShowReport(stored);
	}

	/** End the match now, in the middle of a period or during a break. */
	function endMatch(): void {
		if (!live) return;
		const { phase, period } = live.clock;
		if (phase !== "playing" && phase !== "periodBreak") return;
		if (phase === "playing") {
			stopTimer();
			live.timeline.push({ type: "periodEnd", at: now(), period });
		}
		live.pendingSwap = null;
		live.clock = { ...live.clock, phase: "finished" };
		refreshClock();
		render();
		finishMatch();
	}

	/** Timer, period and buttons, all from the match state in one place. */
	function refreshClock(): void {
		if (!live) return;
		const { clock, plan } = live;
		const rotation = rotationStatus(clock, plan);
		const period = periodStatus(clock, plan);
		const due = clock.phase === "playing" && rotation.due;

		els.timerDisplay.textContent = formatTime(clock.rotationElapsed);
		els.timerDisplay.classList.toggle("done", due);
		els.clockCard.classList.toggle("is-due", due);
		els.timerProgress.style.width = `${rotation.progress * 100}%`;
		els.timerRemaining.textContent =
			clock.phase === "finished"
				? TEXT.match.matchOver
				: clock.phase === "periodBreak"
					? TEXT.match.periodOver(clock.period)
					: due
						? TEXT.match.swapDue(
								formatTime(rotation.lateSeconds),
								rotation.lateSeconds > 0,
							)
						: TEXT.match.timeLeft(formatTime(rotation.remainingSeconds));

		// Inside a live region: only write when the text changes.
		const periodText = TEXT.match.periodOf(period.period, period.periods);
		if (els.periodLabel.textContent !== periodText)
			els.periodLabel.textContent = periodText;
		els.periodTime.textContent = TEXT.match.periodLeft(
			formatTime(period.remainingSeconds),
		);

		// One obvious action at a time (disabled buttons are hidden).
		const canRun = clock.phase === "beforeKickoff" || clock.phase === "playing";
		els.startBtn.disabled = live.running || !canRun;
		els.startBtn.textContent =
			clock.phase === "beforeKickoff"
				? TEXT.match.kickoff
				: TEXT.match.continueClock;
		els.pauseBtn.disabled = !live.running;
		els.newTeamBtn.classList.toggle("show", due);
		els.endMatchBtn.disabled =
			clock.phase === "beforeKickoff" || clock.phase === "finished";
		els.reportBtn.hidden = clock.phase !== "finished";
		els.nextPeriodBtn.disabled = clock.phase !== "periodBreak";
		els.nextPeriodBtn.textContent = TEXT.match.startPeriod(clock.period + 1);
	}

	function startClock(): void {
		if (!live || live.running) return;
		const kickingOff = live.clock.phase === "beforeKickoff";
		live.clock = kickoff(live.clock);
		if (live.clock.phase !== "playing") return;
		if (kickingOff) {
			live.timeline.push({ type: "periodStart", at: now(), period: 1 });
			noteLineup();
		}
		live.running = true;
		live.lastTickMs = Date.now();
		live.timerHandle = setInterval(tick, 1000);
		refreshClock();
		persist();
	}

	function stopTimer(): void {
		if (!live) return;
		live.running = false;
		if (live.timerHandle !== null) clearInterval(live.timerHandle);
		live.timerHandle = null;
	}

	function pauseClock(): void {
		if (!live?.running) return;
		stopTimer();
		refreshClock();
		persist();
	}

	function testByte(): void {
		if (!live) return;
		live.clock = {
			...live.clock,
			rotationElapsed: Math.max(0, live.plan.rotationSeconds - 2),
		};
		startClock();
		prepareSwapWarning();
		refreshClock();
		render();
	}

	/** Put the scheduler's next lineup on; the swap timer starts again. */
	function putNextLineupOn(): void {
		if (!live) return;
		live.rotationIndex += 1;
		live.currentAssignment = cloneAssignment(
			generateRotationSafe(live.schedulerState),
		);
		live.tempSwaps = [];
		live.selected = null;
		live.pendingBenchIdx = null;
		live.pendingSwap = null;
		live.clock = lineupChanged(live.clock);
		noteLineup();
	}

	// ---------------- swaps and the timeline ----------------

	/** Seconds since kickoff: the time stamp for timeline events. */
	function now(): number {
		return live ? matchSecond(live.clock, live.plan) : 0;
	}

	/** Record the lineup if it changed (recordLineup skips duplicates). */
	function noteLineup(): void {
		if (!live || live.clock.phase === "beforeKickoff") return;
		recordLineup(
			live.timeline,
			now(),
			live.currentAssignment,
			live.schedulerState.keeperId,
		);
	}

	/**
	 * Change who is in goal and record it. During play the lineup adjusts
	 * (changeKeeper); right before a new lineup (period break) only the keeper
	 * is chosen (assignKeeper). Returns false if the change was refused.
	 */
	function switchKeeper(
		toId: string,
		options: { beforeNextLineup?: boolean } = {},
	): boolean {
		if (!live) return false;
		const fromId = live.schedulerState.keeperId;
		const changed = options.beforeNextLineup
			? assignKeeper(live.schedulerState, toId)
			: changeKeeper(live.schedulerState, live.currentAssignment, toId);
		if (!changed || live.schedulerState.keeperId === fromId) return false;
		live.timeline.push({
			type: "keeperChange",
			at: now(),
			period: live.clock.period,
			fromId,
			toId,
		});
		live.pendingSwap = null;
		noteLineup();
		return true;
	}

	/**
	 * From LIMITS.headsUpSeconds before a swap is due, fix the next lineup so
	 * the coach can call players over and make the swaps one at a time.
	 */
	function prepareSwapWarning(): void {
		if (!live || live.pendingSwap || live.clock.phase !== "playing") return;
		const { remainingSeconds } = rotationStatus(live.clock, live.plan);
		if (remainingSeconds > LIMITS.headsUpSeconds) return;
		live.pendingSwap = {
			plannedAt: swapDueAt(live.clock, live.plan),
			next: cloneAssignment(generateRotationSafe(live.schedulerState)),
		};
	}

	function pendingChains(): SubstitutionChain[] {
		if (!live?.pendingSwap) return [];
		return substitutionChains(live.currentAssignment, live.pendingSwap.next);
	}

	/** Make one substitution now; minutes change hands from this second. */
	function confirmChain(chain: SubstitutionChain): void {
		if (!live?.pendingSwap) return;
		applyChain(live.currentAssignment, chain);
		live.timeline.push({
			type: "substitution",
			at: now(),
			plannedAt: live.pendingSwap.plannedAt,
			period: live.clock.period,
			...chain,
		});
		noteLineup();
		if (pendingChains().length === 0) finishSwap();
	}

	/** All substitutions made: the planned lineup is on, swap timer restarts. */
	function finishSwap(): void {
		if (!live?.pendingSwap) return;
		live.currentAssignment = cloneAssignment(live.pendingSwap.next);
		live.rotationIndex += 1;
		live.tempSwaps = [];
		live.selected = null;
		live.pendingBenchIdx = null;
		live.pendingSwap = null;
		live.clock = lineupChanged(live.clock);
		noteLineup();
	}

	function advanceRotation(): void {
		if (!live) return;
		const swap = () => {
			if (!live) return;
			prepareSwapWarning();
			for (const chain of pendingChains()) confirmChain(chain);
			finishSwap();
			refreshClock();
			render();
			els.pitch.classList.remove("fade-out");
			els.benchList.classList.remove("fade-out");
		};
		// With reduced motion there is no fade to wait for.
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			swap();
			return;
		}
		els.pitch.classList.add("fade-out");
		els.benchList.classList.add("fade-out");
		setTimeout(swap, 380);
	}

	/** After a break: next period, next lineup, clock running. */
	function beginNextPeriod(): void {
		if (live?.clock.phase !== "periodBreak") return;
		const chosen = els.breakKeeperSelect.value;
		if (
			live.schedulerState.keeperId !== null &&
			chosen &&
			chosen !== live.schedulerState.keeperId
		) {
			// The next lineup is built after this, so just choose the keeper.
			switchKeeper(chosen, { beforeNextLineup: true });
		}
		live.nextKeeperId = null;
		live.clock = startNextPeriod(live.clock, live.plan);
		live.timeline.push({
			type: "periodStart",
			at: now(),
			period: live.clock.period,
		});
		putNextLineupOn();
		startClock();
		refreshClock();
		render();
	}

	// ---------------- public API ----------------

	/** Wire every button; runs once, when the view is created. */
	function wire(): void {
		// Close the match menu after any action except reset, which needs a
		// second tap to confirm.
		for (const item of els.matchMenu.querySelectorAll<HTMLButtonElement>(
			".menu-item",
		)) {
			if (item === els.resetBtn || item === els.endMatchBtn) continue;
			item.addEventListener("click", () => {
				els.matchMenu.open = false;
			});
		}

		// Back on the page after the screen was locked or the tab was hidden:
		// count what the timers missed right away.
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden) tick();
		});
		els.reportBtn.addEventListener("click", () => {
			const stored = currentReport();
			if (stored) callbacks.onShowReport(stored);
		});
		confirmWithSecondTap(els.endMatchBtn, {
			confirmLabel: TEXT.match.confirmEnd,
			onConfirm: () => {
				els.matchMenu.open = false;
				endMatch();
			},
		});
		els.startBtn.addEventListener("click", startClock);
		els.pauseBtn.addEventListener("click", pauseClock);
		els.testBtn.addEventListener("click", testByte);
		els.newTeamBtn.addEventListener("click", advanceRotation);
		els.nextPeriodBtn.addEventListener("click", beginNextPeriod);
		els.breakKeeperSelect.addEventListener("change", () => {
			if (live) live.nextKeeperId = els.breakKeeperSelect.value;
		});
		els.keeperPanelConfirm.addEventListener("click", confirmKeeperChange);
		els.keeperPanelCancel.addEventListener("click", () => {
			keeperPanelOpen = false;
			renderKeeperPanel();
			renderPitch();
		});
		els.undoBtn.addEventListener("click", () => {
			if (!live) return;
			undoTempSwaps(live.currentAssignment, live.tempSwaps);
			live.tempSwaps = [];
			live.selected = null;
			live.pendingBenchIdx = null;
			noteLineup();
			render();
		});
		els.backToSetupBtn.addEventListener("click", () =>
			callbacks.onExitToSetup(),
		);

		els.addLateBtn.addEventListener("click", () => {
			els.lateArrivalPanel.classList.toggle("show");
			if (!els.lateArrivalPanel.classList.contains("show")) return;
			els.lateArrivalPanel.innerHTML = "";
			const title = document.createElement("p");
			title.textContent = TEXT.match.lateArrivalHelp;
			els.lateArrivalPanel.appendChild(title);
			const form = document.createElement("form");
			form.className = "add-player-form";
			const input = document.createElement("input");
			input.type = "text";
			input.setAttribute("aria-label", TEXT.match.lateArrivalLabel);
			input.placeholder = TEXT.match.lateArrivalPlaceholder;
			input.maxLength = LIMITS.playerNameLength;
			input.required = true;
			const btn = document.createElement("button");
			btn.type = "submit";
			btn.className = "btn btn-primary";
			btn.textContent = TEXT.match.add;
			form.appendChild(input);
			form.appendChild(btn);
			form.addEventListener("submit", (e) => {
				e.preventDefault();
				if (!live) return;
				const name = input.value.trim();
				if (!name) return;
				// Unique even for two arrivals in the same millisecond.
				const id = `late-${Date.now()}-${live.schedulerState.order.length}`;
				live.playerNames.set(id, name);
				schedulerAddPlayer(live.schedulerState, id);
				live.currentAssignment.bench.push(id);
				live.timeline.push({
					type: "lateArrival",
					at: now(),
					period: live.clock.period,
					playerId: id,
				});
				live.pendingSwap = null;
				els.lateArrivalPanel.classList.remove("show");
				render();
			});
			els.lateArrivalPanel.appendChild(form);
			input.focus();
		});

		confirmWithSecondTap(els.resetBtn, {
			confirmLabel: TEXT.match.confirmReset,
			onConfirm: () => {
				if (!live) return;
				els.matchMenu.open = false;
				clearSession();
				stopTimer();
				live.matchId = newMatchId();
				resetPlayers(live.schedulerState);
				live.rotationIndex = 0;
				live.clock = NEW_CLOCK;
				live.timeline = [];
				live.pendingSwap = null;
				live.currentAssignment = cloneAssignment(
					generateRotationSafe(live.schedulerState),
				);
				live.tempSwaps = [];
				live.selected = null;
				live.pendingBenchIdx = null;
				refreshClock();
				render();
			},
		});
	}

	function loadLive(next: LiveMatch): void {
		live = next;
		els.formatLabel.textContent = TEXT.match.formatLabel(
			live.format.label,
			Math.round(live.schedulerState.rotationSeconds / 60),
		);
		els.lateArrivalPanel.classList.remove("show");
		refreshClock();
		render();
	}

	function start(roster: RosterFile): void {
		const format = getFormat(roster.formatId);
		const playerNames = new Map(
			roster.players.map((p) => [p.id, p.name] as const),
		);
		const schedulerState = createSchedulerState(
			format,
			roster.rotationSeconds,
			roster.players.map((p) => p.id),
			roster.startingKeeperId,
		);
		loadLive({
			matchId: newMatchId(),
			schedulerState,
			playerNames,
			format,
			rotationIndex: 0,
			plan: {
				periods: roster.periods,
				periodSeconds: roster.periodSeconds,
				rotationSeconds: roster.rotationSeconds,
			},
			clock: NEW_CLOCK,
			match: roster.match,
			goalkeepers: roster.players.filter((p) => p.goalkeeper).map((p) => p.id),
			timeline: [],
			pendingSwap: null,
			nextKeeperId: null,
			running: false,
			lastTickMs: Date.now(),
			timerHandle: null,
			currentAssignment: cloneAssignment(generateRotationSafe(schedulerState)),
			tempSwaps: [],
			selected: null,
			pendingBenchIdx: null,
		});
	}

	function resume(): boolean {
		const session = loadSession();
		if (!session) return false;
		const format = getFormat(session.formatId);
		const schedulerState: SchedulerState = {
			format,
			rotationSeconds: session.plan.rotationSeconds,
			players: session.schedulerPlayers,
			order: session.schedulerOrder,
			keeperId: session.keeperId ?? null,
		};
		const playerNames = new Map(Object.entries(session.playerNames));
		loadLive({
			matchId: session.matchId ?? newMatchId(),
			schedulerState,
			playerNames,
			format,
			rotationIndex: session.rotationIndex,
			plan: session.plan,
			clock: session.clock,
			match: session.match,
			goalkeepers: session.goalkeepers ?? [],
			timeline: session.timeline ?? [],
			pendingSwap: session.pendingSwap ?? null,
			nextKeeperId: null,
			running: false,
			lastTickMs: session.lastTickMs ?? Date.now(),
			timerHandle: null,
			currentAssignment:
				session.currentAssignment ??
				cloneAssignment(generateRotationSafe(schedulerState)),
			tempSwaps: session.tempSwaps,
			selected: null,
			pendingBenchIdx: null,
		});
		continueRunningClock(session);
		return true;
	}

	/**
	 * A match that was running when the page went away keeps running: the
	 * seconds since it was last saved are counted, and the clock carries on.
	 * A match the coach paused stays paused, whatever time has passed.
	 */
	function continueRunningClock(session: MatchSession): void {
		if (!live || session.running !== true) return;
		if (live.clock.phase !== "playing") return;
		const away = Math.max(0, Math.floor((Date.now() - live.lastTickMs) / 1000));
		live.running = true;
		live.timerHandle = setInterval(tick, 1000);
		if (away >= 1) {
			const counted = countSeconds(away, { show: false });
			if (counted > 0) showCaughtUp(counted);
		} else {
			refreshClock();
			persist();
		}
	}

	/** Tell the coach how much time the clock caught up, for a moment. */
	function showCaughtUp(seconds: number): void {
		els.clockNotice.textContent = TEXT.match.caughtUp(formatTime(seconds));
		// A newer notice must not be cleared by an older timer.
		if (caughtUpTimer !== null) clearTimeout(caughtUpTimer);
		caughtUpTimer = setTimeout(() => {
			els.clockNotice.textContent = "";
			caughtUpTimer = null;
		}, 20_000);
	}

	wire();
	return { start, resume };
}
