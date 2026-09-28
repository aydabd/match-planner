import { getFormat } from "../core/formations.js";
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
import {
	clearSession,
	loadSession,
	type MatchSession,
	type MutableAssignment,
	saveSession,
	type TempSwap,
} from "./sessionStorage.js";

function cloneAssignment(a: RotationAssignment): MutableAssignment {
	const zones: Record<string, string[]> = {};
	for (const zoneId of Object.keys(a.zones))
		zones[zoneId] = [...(a.zones[zoneId] ?? [])];
	return { zones, bench: [...a.bench] };
}

function formatTime(totalSeconds: number): string {
	const m = Math.floor(totalSeconds / 60)
		.toString()
		.padStart(2, "0");
	const s = Math.floor(totalSeconds % 60)
		.toString()
		.padStart(2, "0");
	return `${m}:${s}`;
}

interface Els {
	formatLabel: HTMLElement;
	rotationLabel: HTMLElement;
	fairnessLabel: HTMLElement;
	timerDisplay: HTMLElement;
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

let live: LiveMatch | null = null;
let els: Els | null = null;
let callbacksRef: MatchCallbacks | null = null;
let wired = false;

function generateRotationSafe(state: SchedulerState): RotationAssignment {
	try {
		return generateRotation(state);
	} catch (err) {
		if (err instanceof SchedulingError) {
			return {
				zones: Object.fromEntries(state.format.zones.map((z) => [z.id, []])),
				bench: [...state.order],
			};
		}
		throw err;
	}
}

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
	const el = document.createElement("div");
	el.className = "chip selectable";
	if (
		live?.selected &&
		live.selected.zoneId === zoneId &&
		live.selected.idx === idx
	)
		el.classList.add("selected");
	el.textContent = nameOf(id);
	el.addEventListener("click", () => onPitchClick(zoneId, idx));
	return el;
}

function benchChip(id: string, idx: number): HTMLElement {
	const wrap = document.createElement("div");
	wrap.className = "bench-chip";
	if (live?.pendingBenchIdx === idx) wrap.classList.add("selected");
	wrap.textContent = nameOf(id);
	const activeTemp = live?.tempSwaps.find((t) => t.inId === id);
	if (activeTemp) {
		const cd = document.createElement("span");
		cd.className = "bench-countdown";
		cd.textContent = `ers. ${nameOf(activeTemp.outId)} · ${formatTime(activeTemp.remainingSeconds)}`;
		wrap.appendChild(cd);
	}
	wrap.addEventListener("click", () => onBenchClick(idx));
	return wrap;
}

function renderPitch(): void {
	if (!live || !els) return;
	els.pitch.innerHTML = "";
	const zonesTopFirst = [...live.format.zones].reverse();
	for (const zone of zonesTopFirst) {
		const row = document.createElement("div");
		row.className = "line-row";
		for (const [idx, id] of (
			live.currentAssignment.zones[zone.id] ?? []
		).entries()) {
			row.appendChild(pitchChip(id, zone.id, idx));
		}
		els.pitch.appendChild(row);
	}
}

function renderBench(): void {
	if (!live || !els) return;
	els.benchList.innerHTML = "";
	for (const [idx, id] of live.currentAssignment.bench.entries()) {
		els.benchList.appendChild(benchChip(id, idx));
	}
}

function renderSwapPanel(): void {
	if (!live || !els) return;
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
		const p = document.createElement("p");
		p.innerHTML = `Vald: <strong>${nameOf(outId)}</strong>. Tryck på en bänkspelare för tillfälligt byte, eller:`;
		els.swapPanel.appendChild(p);
		const row = document.createElement("div");
		row.className = "row";
		const outBtn = document.createElement("button");
		outBtn.className = "btn-danger";
		outBtn.textContent = "🚑 Ute resten av matchen";
		const selected = live.selected;
		if (!selected) return;
		outBtn.addEventListener("click", () =>
			markUnavailable(selected.zoneId, selected.idx),
		);
		const cancelBtn = document.createElement("button");
		cancelBtn.className = "btn-cancel";
		cancelBtn.textContent = "Avbryt";
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
		const p = document.createElement("p");
		p.innerHTML = `<strong>${nameOf(inId)}</strong> byts in för <strong>${nameOf(outId)}</strong> i:`;
		els.swapPanel.appendChild(p);
		const row = document.createElement("div");
		row.className = "row";
		(
			[
				["1 min", 60],
				["2 min", 120],
				["5 min", 300],
			] as const
		).forEach(([label, secs]) => {
			const b = document.createElement("button");
			b.className = "btn-chip";
			b.textContent = label;
			b.addEventListener("click", () => commitTempSwap(secs));
			row.appendChild(b);
		});
		const untilNext = document.createElement("button");
		untilNext.className = "btn-chip";
		untilNext.textContent = "Till nästa byte";
		untilNext.addEventListener("click", () => commitTempSwap(null));
		row.appendChild(untilNext);
		const cancelBtn = document.createElement("button");
		cancelBtn.className = "btn-cancel";
		cancelBtn.textContent = "Avbryt";
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
	if (!live || !els) return;
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
		span.textContent = `${nameOf(id)} — spelar inte mer idag`;
		const btn = document.createElement("button");
		btn.textContent = "↩ Tillbaka i truppen";
		btn.addEventListener("click", () => {
			// Rows outlive a single render now, so resolve the match at click time.
			if (!live) return;
			setUnavailable(live.schedulerState, id, false);
			render();
		});
		row.appendChild(span);
		row.appendChild(btn);
		els?.alertList.appendChild(row);
	});
}

function renderPreview(): void {
	if (!live || !els) return;
	els.previewBody.innerHTML = "";
	let next: RotationAssignment;
	try {
		next = generateRotation(live.schedulerState);
	} catch (err) {
		const p = document.createElement("p");
		p.className = "preview-none";
		p.textContent =
			err instanceof SchedulingError
				? `⚠️ ${err.message}`
				: "Kunde inte beräkna nästa byte.";
		els.previewBody.appendChild(p);
		return;
	}
	const currentOnPitch = new Set(
		Object.values(live.currentAssignment.zones).flat(),
	);
	const nextOnPitch = new Set(Object.values(next.zones).flat());

	const zonesTopFirst = [...live.format.zones].reverse();
	for (const zone of zonesTopFirst) {
		const row = document.createElement("div");
		row.className = "preview-line";
		const tag = document.createElement("span");
		tag.className = "zone-tag";
		tag.textContent = `${zone.label}:`;
		row.appendChild(tag);
		(next.zones[zone.id] ?? []).forEach((id) => {
			const c = document.createElement("span");
			c.className = `chip-ghost${currentOnPitch.has(id) ? "" : " is-new"}`;
			c.textContent = nameOf(id);
			row.appendChild(c);
		});
		els?.previewBody.appendChild(row);
	}
	const benchRow = document.createElement("div");
	benchRow.className = "preview-line";
	const benchTag = document.createElement("span");
	benchTag.className = "zone-tag";
	benchTag.textContent = "Bänk:";
	benchRow.appendChild(benchTag);
	next.bench.forEach((id) => {
		const c = document.createElement("span");
		c.className = `chip-ghost${currentOnPitch.has(id) ? "" : " is-new"}`;
		c.textContent = nameOf(id);
		benchRow.appendChild(c);
	});
	els.previewBody.appendChild(benchRow);

	const goingOut = [...currentOnPitch].filter((id) => !nextOnPitch.has(id));
	if (goingOut.length) {
		const p = document.createElement("p");
		p.className = "preview-out";
		p.textContent = `⬅ Går ut till bänken: ${goingOut.map(nameOf).join(", ")}  ·  🆕 = kommer in`;
		els.previewBody.appendChild(p);
	}
}

function renderPlaytime(): void {
	if (!live || !els) return;
	const currentLive = live;
	const elements = els;
	elements.playtimeList.innerHTML = "";
	const onPitch = new Set(Object.values(live.currentAssignment.zones).flat());
	currentLive.schedulerState.order.forEach((id) => {
		const p = currentLive.schedulerState.players[id];
		if (!p) return;
		const row = document.createElement("div");
		row.className = "pt-row";
		const nameEl = document.createElement("span");
		nameEl.className = `pt-name ${p.unavailable ? "out" : onPitch.has(id) ? "on-pitch" : "on-bench"}`;
		nameEl.textContent = nameOf(id) + (onPitch.has(id) ? " ●" : "");
		const timeEl = document.createElement("span");
		timeEl.className = "pt-time";
		timeEl.textContent = formatTime(p.totalSeconds);
		row.appendChild(nameEl);
		row.appendChild(timeEl);
		elements.playtimeList.appendChild(row);
	});
}

function render(): void {
	if (!live || !els) return;
	// Inside a live region: skip identical writes so ticks don't re-announce.
	const rotationText = String(live.rotationIndex + 1);
	if (els.rotationLabel.textContent !== rotationText)
		els.rotationLabel.textContent = rotationText;
	els.fairnessLabel.textContent = `spridning ${formatTime(fairnessSpread(live.schedulerState))}`;
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
	const zonePlayers = live.currentAssignment.zones[zoneId];
	const outId = zonePlayers?.[idx];
	const inId = live.currentAssignment.bench[live.pendingBenchIdx];
	if (!zonePlayers || outId === undefined || inId === undefined) return;
	zonePlayers[idx] = inId;
	live.currentAssignment.bench[live.pendingBenchIdx] = outId;
	if (durationSeconds !== null) {
		live.tempSwaps.push({
			zoneId,
			idx,
			outId,
			inId,
			remainingSeconds: durationSeconds,
		});
	}
	live.selected = null;
	live.pendingBenchIdx = null;
	render();
}

function markUnavailable(zoneId: string, idx: number): void {
	if (!live) return;
	const currentLive = live;
	const zonePlayers = currentLive.currentAssignment.zones[zoneId];
	const outId = zonePlayers?.[idx];
	if (!zonePlayers || outId === undefined) return;
	setUnavailable(currentLive.schedulerState, outId, true);
	const benchCandidates = currentLive.currentAssignment.bench.filter(
		(id) => !currentLive.schedulerState.players[id]?.unavailable,
	);
	benchCandidates.sort((a, b) => {
		const playerA = currentLive.schedulerState.players[a];
		const playerB = currentLive.schedulerState.players[b];
		if (!playerA || !playerB) return 0;
		return playerA.totalSeconds - playerB.totalSeconds;
	});
	const cover = benchCandidates[0];
	if (cover !== undefined) {
		zonePlayers[idx] = cover;
		currentLive.currentAssignment.bench =
			currentLive.currentAssignment.bench.filter((id) => id !== cover);
	} else {
		currentLive.currentAssignment.zones[zoneId]?.splice(idx, 1);
	}
	currentLive.selected = null;
	currentLive.pendingBenchIdx = null;
	render();
}

function revertTempSwap(t: TempSwap): void {
	if (!live) return;
	const arr = live.currentAssignment.zones[t.zoneId];
	if (arr && arr[t.idx] === t.inId) {
		const benchIdx = live.currentAssignment.bench.indexOf(t.inId);
		arr[t.idx] = t.outId;
		if (benchIdx !== -1) live.currentAssignment.bench[benchIdx] = t.outId;
		else live.currentAssignment.bench.push(t.outId);
	}
}

// ---------------- clock ----------------

function tick(): void {
	if (!live || !els) return;
	applyElapsed(live.schedulerState, live.currentAssignment, 1);
	live.tempSwaps = live.tempSwaps.filter((t) => {
		t.remainingSeconds -= 1;
		if (t.remainingSeconds <= 0) {
			revertTempSwap(t);
			return false;
		}
		return true;
	});
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
	if (!live || !els) return;
	els.timerDisplay.textContent = formatTime(live.elapsedSeconds);
	els.timerDisplay.classList.toggle(
		"done",
		live.elapsedSeconds >= live.schedulerState.rotationSeconds,
	);
}

function startClock(): void {
	if (!live || !els) return;
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
	if (!live || !els) return;
	live.running = false;
	if (live.timerHandle !== null) clearInterval(live.timerHandle);
	els.startBtn.disabled =
		live.elapsedSeconds >= live.schedulerState.rotationSeconds;
	els.pauseBtn.disabled = true;
}

function pauseClock(): void {
	if (!live || !els) return;
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
	if (!live || !els) return;
	els.pitch.classList.add("fade-out");
	els.benchList.classList.add("fade-out");
	setTimeout(() => {
		if (!live || !els) return;
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

/** Wire every button exactly once. Safe to call multiple times (no-ops after the first). */
export function initMatchView(callbacks: MatchCallbacks): void {
	callbacksRef = callbacks;
	if (wired) return;
	wired = true;
	els = getEls();

	els.startBtn.addEventListener("click", startClock);
	els.pauseBtn.addEventListener("click", pauseClock);
	els.testBtn.addEventListener("click", testByte);
	els.newTeamBtn.addEventListener("click", advanceRotation);
	els.undoBtn.addEventListener("click", () => {
		if (!live) return;
		live.tempSwaps = live.tempSwaps.filter((t) => {
			revertTempSwap(t);
			return false;
		});
		live.selected = null;
		live.pendingBenchIdx = null;
		render();
	});
	els.backToSetupBtn.addEventListener("click", () =>
		callbacksRef?.onExitToSetup(),
	);

	els.addLateBtn.addEventListener("click", () => {
		if (!els) return;
		els.lateArrivalPanel.classList.toggle("show");
		if (!els.lateArrivalPanel.classList.contains("show")) return;
		els.lateArrivalPanel.innerHTML = "";
		const form = document.createElement("form");
		form.className = "add-player-form";
		const input = document.createElement("input");
		input.type = "text";
		input.placeholder = "Namn på spelaren som just kom";
		input.maxLength = 40;
		input.required = true;
		const btn = document.createElement("button");
		btn.type = "submit";
		btn.className = "btn btn-primary";
		btn.textContent = "Lägg till";
		form.appendChild(input);
		form.appendChild(btn);
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			if (!live || !els) return;
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
	});

	let resetArmed = false;
	let resetArmTimeout: ReturnType<typeof setTimeout> | null = null;
	els.resetBtn.addEventListener("click", () => {
		if (!live || !els) return;
		if (!resetArmed) {
			resetArmed = true;
			els.resetBtn.textContent = "⚠️ Tryck igen för att nollställa";
			els.resetBtn.classList.add("confirming");
			const elements = els;
			resetArmTimeout = setTimeout(() => {
				resetArmed = false;
				elements.resetBtn.textContent = "🔄 Nollställ matchen";
				elements.resetBtn.classList.remove("confirming");
			}, 3000);
		} else {
			if (resetArmTimeout) clearTimeout(resetArmTimeout);
			resetArmed = false;
			els.resetBtn.textContent = "🔄 Nollställ matchen";
			els.resetBtn.classList.remove("confirming");
			clearSession();
			stopClock();
			for (const id of live.schedulerState.order) {
				const player = live.schedulerState.players[id];
				if (!player) continue;
				player.totalSeconds = 0;
				player.zonesPlayed = [];
				player.unavailable = false;
			}
			live.rotationIndex = 0;
			live.elapsedSeconds = 0;
			live.currentAssignment = cloneAssignment(
				generateRotationSafe(live.schedulerState),
			);
			live.tempSwaps = [];
			live.selected = null;
			live.pendingBenchIdx = null;
			els.newTeamBtn.classList.remove("show");
			updateTimerDisplay();
			render();
		}
	});
}

function loadLive(next: LiveMatch): void {
	live = next;
	if (!els) return;
	els.formatLabel.textContent = `${live.format.label} · byte var ${Math.round(live.schedulerState.rotationSeconds / 60)} min`;
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

export function startMatch(
	roster: RosterFile,
	callbacks: MatchCallbacks,
): void {
	initMatchView(callbacks);
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

export function resumeMatch(callbacks: MatchCallbacks): boolean {
	const session = loadSession();
	if (!session) return false;
	initMatchView(callbacks);
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
