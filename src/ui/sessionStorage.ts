import type {
	MutableAssignment,
	SchedulerState,
	TempSwap,
} from "../core/types.js";

export type { MutableAssignment, TempSwap };

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
