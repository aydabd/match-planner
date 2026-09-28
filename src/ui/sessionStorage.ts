import { getFormat } from "../core/formations.js";
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
	/** Who is in goal (null when the keeper is not tracked). */
	keeperId: string | null;
	/** Players marked as goalkeeper in the squad, offered first as keeper. */
	goalkeepers: string[];
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
		keeperId: null,
		goalkeepers: [],
	};
}

const PHASES: readonly string[] = [
	"beforeKickoff",
	"playing",
	"periodBreak",
	"finished",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isCount = (value: unknown): boolean =>
	typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * Whether a saved version 2 match has everything resume() reads. A damaged
 * one is dropped (the coach lands on setup) instead of crashing the app.
 */
function isResumable(s: Record<string, unknown>): boolean {
	if (s.schemaVersion !== 2 || typeof s.formatId !== "string") return false;
	try {
		getFormat(s.formatId);
	} catch {
		return false;
	}
	const { plan, clock } = s;
	return (
		isRecord(plan) &&
		isCount(plan.periods) &&
		isCount(plan.periodSeconds) &&
		isCount(plan.rotationSeconds) &&
		isRecord(clock) &&
		PHASES.includes(String(clock.phase)) &&
		isCount(clock.period) &&
		isCount(clock.periodElapsed) &&
		isCount(clock.rotationElapsed) &&
		isRecord(s.match) &&
		isRecord(s.playerNames) &&
		isRecord(s.schedulerPlayers) &&
		Array.isArray(s.schedulerOrder) &&
		isCount(s.rotationIndex) &&
		Array.isArray(s.tempSwaps)
	);
}

export function loadSession(): MatchSession | null {
	const raw = readItem(STORAGE_KEYS.session);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (typeof parsed !== "object" || parsed === null) return null;
		const session = parsed as Record<string, unknown>;
		if (session.schemaVersion === 1) return fromVersion1(session);
		return isResumable(session) ? (parsed as MatchSession) : null;
	} catch {
		return null;
	}
}

export function clearSession(): void {
	removeItem(STORAGE_KEYS.session);
}
