import { getFormat } from "../core/formations.js";
import { LIMITS } from "../core/limits.js";
import {
	clockStatus,
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
	applyElapsed,
	createSchedulerState,
	fairnessSpread,
	generateRotation,
	SchedulingError,
	addPlayer as schedulerAddPlayer,
	setUnavailable,
} from "../core/scheduler.js";
import type { RosterFile } from "../core/storage.js";
import type {
	FormatConfig,
	RotationAssignment,
	SchedulerState,
} from "../core/types.js";
import { confirmWithSecondTap } from "./confirmButton.js";
import {
	clearSession,
	loadSession,
	type MatchSession,
	type MutableAssignment,
	saveSession,
	type TempSwap,
} from "./sessionStorage.js";
import { TEXT } from "./text.js";

interface Els {
	formatLabel: HTMLElement;
	rotationLabel: HTMLElement;
	fairnessLabel: HTMLElement;
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
}

function getEls(): Els {
	const byId = <T extends HTMLElement>(id: string) =>
		document.getElementById(id) as T;
	return {
		formatLabel: byId("formatLabel"),
		rotationLabel: byId("rotationLabel"),
		fairnessLabel: byId("fairnessLabel"),
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
	};
}

export interface MatchCallbacks {
	onExitToSetup: () => void;
}

/**
 * Mutable "current match" cell. Event listeners (wired exactly once, see
 * initMatchView) always read/write through this so that starting a second
 * match after returning to setup never re-attaches duplicate handlers.
 */
interface LiveMatch {
	schedulerState: SchedulerState;
	playerNames: Map<string, string>;
	format: FormatConfig;
	rotationIndex: number;
	elapsedSeconds: number;
	running: boolean;
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

	function nameOf(id: string): string {
		return live?.playerNames.get(id) ?? id;
	}

	function persist(): void {
		if (!live) return;
		const session: MatchSession = {
			schemaVersion: 1,
			formatId: live.format.id,
			rotationSeconds: live.schedulerState.rotationSeconds,
			playerNames: Object.fromEntries(live.playerNames.entries()),
			schedulerPlayers: live.schedulerState.players,
			schedulerOrder: live.schedulerState.order,
			rotationIndex: live.rotationIndex,
			elapsedSeconds: live.elapsedSeconds,
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

	function renderPreview(): void {
		if (!live) return;
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
			const status = p.unavailable
				? "out"
				: onPitch.has(id)
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
				tag.textContent = TEXT.match.onPitch;
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
		render();
	}

	function markUnavailable(zoneId: string, idx: number): void {
		if (!live) return;
		takeOutForMatch(live.schedulerState, live.currentAssignment, zoneId, idx);
		live.selected = null;
		live.pendingBenchIdx = null;
		render();
	}

	// ---------------- clock ----------------

	function tick(): void {
		if (!live) return;
		applyElapsed(live.schedulerState, live.currentAssignment, 1);
		live.tempSwaps = tickTempSwaps(live.currentAssignment, live.tempSwaps, 1);
		live.elapsedSeconds += 1;
		if (live.elapsedSeconds >= live.schedulerState.rotationSeconds) {
			live.elapsedSeconds = live.schedulerState.rotationSeconds;
			stopClock();
			els.newTeamBtn.classList.add("show");
		}
		updateTimerDisplay();
		render();
	}

	function updateTimerDisplay(): void {
		if (!live) return;
		const { due, progress, remainingSeconds } = clockStatus(
			live.elapsedSeconds,
			live.schedulerState.rotationSeconds,
		);
		els.timerDisplay.textContent = formatTime(live.elapsedSeconds);
		els.timerDisplay.classList.toggle("done", due);
		els.clockCard.classList.toggle("is-due", due);
		els.timerProgress.style.width = `${progress * 100}%`;
		els.timerRemaining.textContent = due
			? TEXT.match.swapDue
			: TEXT.match.timeLeft(formatTime(remainingSeconds));
		els.startBtn.textContent =
			live.elapsedSeconds > 0
				? TEXT.match.continueClock
				: TEXT.match.startClock;
	}

	function startClock(): void {
		if (!live) return;
		if (
			live.running ||
			live.elapsedSeconds >= live.schedulerState.rotationSeconds
		)
			return;
		live.running = true;
		els.startBtn.disabled = true;
		els.pauseBtn.disabled = false;
		live.timerHandle = setInterval(tick, 1000);
	}

	function stopClock(): void {
		if (!live) return;
		live.running = false;
		if (live.timerHandle !== null) clearInterval(live.timerHandle);
		els.startBtn.disabled =
			live.elapsedSeconds >= live.schedulerState.rotationSeconds;
		els.pauseBtn.disabled = true;
	}

	function pauseClock(): void {
		if (!live) return;
		if (!live.running) return;
		stopClock();
		els.startBtn.disabled = false;
	}

	function testByte(): void {
		if (!live) return;
		if (live.elapsedSeconds >= live.schedulerState.rotationSeconds) return;
		live.elapsedSeconds = live.schedulerState.rotationSeconds - 2;
		updateTimerDisplay();
		startClock();
	}

	function advanceRotation(): void {
		if (!live) return;
		els.pitch.classList.add("fade-out");
		els.benchList.classList.add("fade-out");
		setTimeout(() => {
			if (!live) return;
			live.rotationIndex += 1;
			live.currentAssignment = cloneAssignment(
				generateRotationSafe(live.schedulerState),
			);
			live.tempSwaps = [];
			live.selected = null;
			live.pendingBenchIdx = null;
			live.elapsedSeconds = 0;
			updateTimerDisplay();
			els.newTeamBtn.classList.remove("show");
			els.startBtn.disabled = false;
			els.pauseBtn.disabled = true;
			render();
			els.pitch.classList.remove("fade-out");
			els.benchList.classList.remove("fade-out");
		}, 380);
	}

	// ---------------- public API ----------------

	/** Wire every button; runs once, when the view is created. */
	function wire(): void {
		// Close the match menu after any action except reset, which needs a
		// second tap to confirm.
		for (const item of els.matchMenu.querySelectorAll<HTMLButtonElement>(
			".menu-item",
		)) {
			if (item === els.resetBtn) continue;
			item.addEventListener("click", () => {
				els.matchMenu.open = false;
			});
		}

		els.startBtn.addEventListener("click", startClock);
		els.pauseBtn.addEventListener("click", pauseClock);
		els.testBtn.addEventListener("click", testByte);
		els.newTeamBtn.addEventListener("click", advanceRotation);
		els.undoBtn.addEventListener("click", () => {
			if (!live) return;
			undoTempSwaps(live.currentAssignment, live.tempSwaps);
			live.tempSwaps = [];
			live.selected = null;
			live.pendingBenchIdx = null;
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
				const id = `late-${Date.now()}`;
				live.playerNames.set(id, name);
				schedulerAddPlayer(live.schedulerState, id);
				live.currentAssignment.bench.push(id);
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
				stopClock();
				resetPlayers(live.schedulerState);
				live.rotationIndex = 0;
				live.elapsedSeconds = 0;
				live.currentAssignment = cloneAssignment(
					generateRotationSafe(live.schedulerState),
				);
				live.tempSwaps = [];
				live.selected = null;
				live.pendingBenchIdx = null;
				// stopClock() ran while the swap may have been due, which disables
				// Start; the match is back at 00:00, so it can start again.
				els.startBtn.disabled = false;
				els.pauseBtn.disabled = true;
				els.newTeamBtn.classList.remove("show");
				updateTimerDisplay();
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
		els.startBtn.disabled =
			live.elapsedSeconds >= live.schedulerState.rotationSeconds;
		els.pauseBtn.disabled = true;
		els.newTeamBtn.classList.toggle(
			"show",
			live.elapsedSeconds >= live.schedulerState.rotationSeconds,
		);
		els.lateArrivalPanel.classList.remove("show");
		updateTimerDisplay();
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
		);
		loadLive({
			schedulerState,
			playerNames,
			format,
			rotationIndex: 0,
			elapsedSeconds: 0,
			running: false,
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
			rotationSeconds: session.rotationSeconds,
			players: session.schedulerPlayers,
			order: session.schedulerOrder,
		};
		const playerNames = new Map(Object.entries(session.playerNames));
		loadLive({
			schedulerState,
			playerNames,
			format,
			rotationIndex: session.rotationIndex,
			elapsedSeconds: session.elapsedSeconds,
			running: false,
			timerHandle: null,
			currentAssignment:
				session.currentAssignment ??
				cloneAssignment(generateRotationSafe(schedulerState)),
			tempSwaps: session.tempSwaps,
			selected: null,
			pendingBenchIdx: null,
		});
		return true;
	}

	wire();
	return { start, resume };
}
