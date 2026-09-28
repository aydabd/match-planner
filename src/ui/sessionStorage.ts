import type {
	MutableAssignment,
	SchedulerState,
	TempSwap,
} from "../core/types.js";
import { readItem, removeItem, STORAGE_KEYS, writeItem } from "./appStorage.js";

export type { MutableAssignment, TempSwap };

/**
 * Everything needed to resume a match exactly where it was left off after
 * a page reload. Kept deliberately flat and small - it is written to
 * browser storage (via appStorage) every second while the clock runs, so it must stay cheap
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

export function saveSession(session: MatchSession): void {
	writeItem(STORAGE_KEYS.session, JSON.stringify(session));
}

export function loadSession(): MatchSession | null {
	const raw = readItem(STORAGE_KEYS.session);
	if (!raw) return null;
	try {
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
	removeItem(STORAGE_KEYS.session);
}
