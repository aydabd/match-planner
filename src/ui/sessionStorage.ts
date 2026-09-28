import type { MatchClock, MatchPlan } from "../core/matchClock.js";
import { type MatchDetails, newRoster } from "../core/storage.js";
import type {
	MutableAssignment,
	SchedulerState,
	TempSwap,
} from "../core/types.js";
import { readItem, removeItem, STORAGE_KEYS, writeItem } from "./appStorage.js";

export type { MutableAssignment, TempSwap };

/**
 * Everything needed to resume a match exactly where it was left off after
 * a page reload. Kept deliberately flat and small: it is written to browser
 * storage (via appStorage) every second while the clock runs, so it must
 * stay cheap to serialize.
 */
export interface MatchSession {
	schemaVersion: 2;
	formatId: string;
	plan: MatchPlan;
	clock: MatchClock;
	match: MatchDetails;
	playerNames: Record<string, string>;
	schedulerPlayers: SchedulerState["players"];
	schedulerOrder: string[];
	rotationIndex: number;
	currentAssignment: MutableAssignment | null;
	tempSwaps: TempSwap[];
}

export function saveSession(session: MatchSession): void {
	writeItem(STORAGE_KEYS.session, JSON.stringify(session));
}

/**
 * A match saved before periods existed (version 1) resumes in period 1 of the
 * team size's default match, with its swap timer where it was.
 */
function fromVersion1(v1: Record<string, unknown>): MatchSession | null {
	if (typeof v1.formatId !== "string" || typeof v1.rotationSeconds !== "number")
		return null;
	const defaults = newRoster({ formatId: v1.formatId });
	const elapsed = typeof v1.elapsedSeconds === "number" ? v1.elapsedSeconds : 0;
	const {
		schemaVersion: _v,
		rotationSeconds,
		elapsedSeconds: _e,
		...rest
	} = v1;
	return {
		...(rest as Omit<
			MatchSession,
			"schemaVersion" | "plan" | "clock" | "match"
		>),
		schemaVersion: 2,
		plan: {
			periods: defaults.periods,
			periodSeconds: defaults.periodSeconds,
			rotationSeconds,
		},
		clock: {
			phase: "playing",
			period: 1,
			periodElapsed: elapsed,
			rotationElapsed: elapsed,
		},
		match: { ...defaults.match },
	};
}

export function loadSession(): MatchSession | null {
	const raw = readItem(STORAGE_KEYS.session);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (typeof parsed !== "object" || parsed === null) return null;
		const session = parsed as Record<string, unknown>;
		if (session.schemaVersion === 1) return fromVersion1(session);
		if (
			session.schemaVersion !== 2 ||
			typeof session.plan !== "object" ||
			session.plan === null ||
			typeof session.clock !== "object" ||
			session.clock === null
		)
			return null;
		return parsed as MatchSession;
	} catch {
		return null;
	}
}

export function clearSession(): void {
	removeItem(STORAGE_KEYS.session);
}
