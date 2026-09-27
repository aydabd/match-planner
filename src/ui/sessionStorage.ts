import type { SchedulerState } from "../core/types.js";

/**
 * The UI keeps a mutable working copy of a rotation so manual swaps (an
 * injury sub, a late arrival) can edit it in place. core/scheduler.ts's
 * own RotationAssignment is intentionally readonly - it is a pure
 * calculation result - so this is a deliberately separate, mutable shape.
 */
export interface MutableAssignment {
	zones: Record<string, string[]>;
	bench: string[];
}

/**
 * Everything needed to resume a match exactly where it was left off after
 * a page reload. Kept deliberately flat and small - it is written to
 * localStorage every second while the clock runs, so it must stay cheap
 * to serialize.
 */
export interface MatchSession {
	schemaVersion: 1;
	formatId: string;
	rotationSeconds: number;
	playerNames: Record<string, string>;
	schedulerPlayers: SchedulerState["players"];
	schedulerOrder: string[];
	rotationIndex: number;
	elapsedSeconds: number;
	currentAssignment: MutableAssignment | null;
	tempSwaps: TempSwap[];
}

export interface TempSwap {
	zoneId: string;
	idx: number;
	outId: string;
	inId: string;
	remainingSeconds: number;
}

const KEY = "matchplanner:session:v1";

export function saveSession(session: MatchSession): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(session));
	} catch {
		// Storage can be unavailable (private browsing, quota, disabled) -
		// the app still works for the rest of this tab session, it just
		// won't survive a reload. Not fatal.
	}
}

export function loadSession(): MatchSession | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as unknown;
		if (typeof parsed !== "object" || parsed === null) return null;
		if ((parsed as { schemaVersion?: unknown }).schemaVersion !== 1)
			return null;
		return parsed as MatchSession;
	} catch {
		return null;
	}
}

export function clearSession(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// ignore
	}
}
