import { applies, POLICY } from "./policy.js";
import type { MatchDetails } from "./storage.js";
import {
	parseSubstitutionRules,
	type SubstitutionRules,
} from "./substitutionRules.js";
import {
	GOAL,
	restsOf,
	secondsPlayed,
	secondsPlayedByPeriod,
	type TimelineEvent,
} from "./timeline.js";

/**
 * The post-match report (#13), computed only from the match timeline: who
 * played how long, how closely the swaps followed the plan, and a few
 * plain-language findings. Nothing here is stored separately, so the numbers
 * always agree with the timeline. src/ui/text.ts turns findings into Swedish.
 */

export type PlayerStatus = "played" | "outForMatch" | "lateArrival";

/** One rest on the bench, as audited in the report. */
export interface RestReport {
	startedAt: number;
	/** When the player came on; null if the rest went on to the end. */
	endedAt: number | null;
	seconds: number;
}

/** All the time a player spent resting, in seconds. */
export function totalRestSeconds(
	rests: readonly { seconds: number }[],
): number {
	return rests.reduce((sum, r) => sum + r.seconds, 0);
}

export interface PlayerReport {
	id: string;
	name: string;
	totalSeconds: number;
	/** Seconds in each period, index 0 = period 1. */
	periodSeconds: number[];
	/** Seconds per line id, and GOAL for the keeper. */
	zoneSeconds: Record<string, number>;
	/** Every rest on the bench, in order. */
	rests: RestReport[];
	status: PlayerStatus;
}

export interface SwapReport {
	inId: string;
	outId: string;
	inName: string;
	outName: string;
	period: number;
	/** When the swap was due and when it was made, seconds since kickoff. */
	plannedAt: number;
	at: number;
	/** Negative: early. Positive: late. */
	delaySeconds: number;
	/** How long the player coming on had rested; null if they started. */
	inRestedSeconds: number | null;
}

export interface SwapSummary {
	count: number;
	/** Average delay over all swaps, in seconds (negative: early). */
	averageDelaySeconds: number;
	/** The delay furthest from on time, with its sign (negative: early). */
	maxDelaySeconds: number;
	/** Swaps more than POLICY.lateSwapSeconds late. */
	lateCount: number;
	/** Swaps more than POLICY.veryLateSwapSeconds late. */
	veryLateCount: number;
	/** Average delay per period, index 0 = period 1; null if no swaps. */
	averageDelayByPeriod: (number | null)[];
}

/** A finding for the coach; the UI writes the sentence. */
export type Feedback =
	| { code: "noSwaps" }
	| { code: "swapsOnTime"; averageSeconds: number }
	| { code: "swapsLate"; averageSeconds: number; period: number | null }
	| { code: "evenPlaytime"; spreadSeconds: number }
	| { code: "playerBelowAverage"; playerId: string; belowSeconds: number };

/** A limit a swap went past (#171). */
export type DeviationRule = "substitutesIn" | "occasions" | "reEntry";

/** A swap that broke the match's substitution rules; it was made anyway. */
export interface Deviation {
	/** The substitution event, so the coach's note can refer to it. */
	eventId: string;
	at: number;
	period: number;
	inId: string;
	outId: string;
	rules: DeviationRule[];
}

/** How much of the substitution limits a match has used, and where it went past them. */
export interface SubstitutionUsage {
	/** Players brought on for the first time (a player coming back is not counted again). */
	substitutesIn: number;
	/** Occasions during play; swaps in a break between periods are not one. */
	occasions: number;
	/** Empty with free swaps: they have no limits to break. */
	deviations: Deviation[];
}

/**
 * Count the substitutions in the timeline against the rules. A swap made
 * while no period is on (a break) is not an occasion but its player counts
 * toward the substitutes (TB 4 kap. 5 §, POLICY.breakIsOccasion). Swaps
 * during play that were due at the same moment (`plannedAt`) are one
 * occasion. Players in the kickoff lineup have been on; one of them, or
 * anyone brought on earlier, coming on again is a re-entry.
 */
export function substitutionUsage(
	timeline: readonly TimelineEvent[],
	rules: SubstitutionRules,
): SubstitutionUsage {
	let periodOn = false;
	const everOn = new Set<string>();
	const occasionKeys: number[] = [];
	let substitutesIn = 0;
	const deviations: Deviation[] = [];
	for (const event of timeline) {
		if (event.type === "periodStart") periodOn = true;
		else if (event.type === "periodEnd") periodOn = false;
		else if (event.type === "lineup") {
			for (const id of Object.values(event.zones).flat()) everOn.add(id);
			if (event.keeperId !== null) everOn.add(event.keeperId);
		} else if (event.type === "substitution") {
			const reEntry = everOn.has(event.inId);
			everOn.add(event.inId);
			if (!reEntry) substitutesIn++;
			const duringPlay = periodOn || POLICY.breakIsOccasion;
			if (duringPlay && !occasionKeys.includes(event.plannedAt))
				occasionKeys.push(event.plannedAt);
			if (rules.kind === "free") continue;
			const broken: DeviationRule[] = [];
			if (!reEntry && substitutesIn > rules.substitutesIn)
				broken.push("substitutesIn");
			if (
				duringPlay &&
				rules.occasions !== null &&
				occasionKeys.indexOf(event.plannedAt) + 1 > rules.occasions
			)
				broken.push("occasions");
			if (reEntry && !rules.reEntry) broken.push("reEntry");
			if (broken.length > 0) {
				deviations.push({
					eventId: event.id,
					at: event.at,
					period: event.period,
					inId: event.inId,
					outId: event.outId,
					rules: broken,
				});
			}
		}
	}
	return { substitutesIn, occasions: occasionKeys.length, deviations };
}

export interface MatchReport {
	/** Seconds of match played, over all periods. */
	playedSeconds: number;
	periods: number;
	players: PlayerReport[];
	swaps: SwapReport[];
	swapSummary: SwapSummary;
	playtime: {
		/**
		 * Average over players who could play the whole match, excluding
		 * anyone who kept goal at all - a keeper's time is guaranteed and
		 * uninterrupted by design, not part of what the rotation equalizes.
		 */
		averageSeconds: number;
		/** Most minus least played among them. */
		spreadSeconds: number;
	};
	feedback: Feedback[];
	/** The rules the match was played under and what was used of them (#171). */
	substitutions: { rules: SubstitutionRules } & SubstitutionUsage;
}

export interface ReportInput {
	timeline: readonly TimelineEvent[];
	/** Everyone in the squad, in squad order. */
	players: readonly { id: string; name: string }[];
	/** Seconds the match lasted (the clock at the end). */
	endedAt: number;
	/** The substitution rules the match was played under. */
	rules: SubstitutionRules;
}

/** The delay furthest from on time, keeping its sign (so all-early swaps report the earliest). */
function worstDelay(delays: readonly number[]): number {
	return delays.reduce(
		(worst, delay) => (Math.abs(delay) > Math.abs(worst) ? delay : worst),
		0,
	);
}

const mean = (values: readonly number[]): number =>
	values.length === 0
		? 0
		: values.reduce((sum, v) => sum + v, 0) / values.length;

function statusOf(
	timeline: readonly TimelineEvent[],
	id: string,
): PlayerStatus {
	for (const event of timeline) {
		if (event.type === "outForMatch" && event.playerId === id)
			return "outForMatch";
	}
	for (const event of timeline) {
		if (event.type === "lateArrival" && event.playerId === id)
			return "lateArrival";
	}
	return "played";
}

export function buildReport(input: ReportInput): MatchReport {
	const { timeline, endedAt } = input;
	const names = new Map(input.players.map((p) => [p.id, p.name] as const));
	const nameOf = (id: string) => names.get(id) ?? id;
	const total = secondsPlayed(timeline, endedAt);
	const byPeriod = secondsPlayedByPeriod(timeline, endedAt);
	const periods = byPeriod.length;

	const allRests = restsOf(
		timeline,
		input.players.map((p) => p.id),
		endedAt,
	);
	const players: PlayerReport[] = input.players.map((p) => ({
		id: p.id,
		name: p.name,
		totalSeconds: total[p.id]?.total ?? 0,
		periodSeconds: byPeriod.map((period) => period[p.id] ?? 0),
		zoneSeconds: { ...(total[p.id]?.byZone ?? {}) },
		rests: allRests[p.id] ?? [],
		status: statusOf(timeline, p.id),
	}));

	const swaps: SwapReport[] = timeline.flatMap((event) =>
		event.type === "substitution"
			? [
					{
						inId: event.inId,
						outId: event.outId,
						inName: nameOf(event.inId),
						outName: nameOf(event.outId),
						period: event.period,
						plannedAt: event.plannedAt,
						at: event.at,
						delaySeconds: event.at - event.plannedAt,
						inRestedSeconds:
							(allRests[event.inId] ?? []).find((r) => r.endedAt === event.at)
								?.seconds ?? null,
					},
				]
			: [],
	);

	const delays = swaps.map((s) => s.delaySeconds);
	const swapSummary: SwapSummary = {
		count: swaps.length,
		averageDelaySeconds: mean(delays),
		maxDelaySeconds: worstDelay(delays),
		lateCount: delays.filter((d) => d > POLICY.lateSwapSeconds).length,
		veryLateCount: delays.filter((d) => d > POLICY.veryLateSwapSeconds).length,
		averageDelayByPeriod: byPeriod.map((_, i) => {
			const inPeriod = swaps.filter((s) => s.period === i + 1);
			return inPeriod.length === 0
				? null
				: mean(inPeriod.map((s) => s.delaySeconds));
		}),
	};

	// Fairness is judged among players who could play the whole match (someone
	// who arrived late or was hurt naturally plays less) and who were never
	// asked to keep goal: a keeper's stretch is guaranteed and uninterrupted
	// by design (scheduler.ts excludes the keeper from outfield rotation
	// entirely), not something the rotation is trying to equalize, so
	// counting it here would flag an evenly-rotated outfield as "unfair"
	// merely because the keeper played more, or flag the keeper as
	// underplayed for doing the job as intended.
	const played = players.filter((p) => p.status === "played");
	const outfieldOnly = played.filter((p) => (p.zoneSeconds[GOAL] ?? 0) === 0);
	// Falls back to everyone who played if every one of them kept goal at
	// some point (e.g. the whole squad rotates through goal) - an empty pool
	// would otherwise report a meaningless "0:00 average, perfectly even"
	// instead of the match's real, possibly uneven playtime.
	const compared = outfieldOnly.length > 0 ? outfieldOnly : played;
	const averageSeconds = mean(compared.map((p) => p.totalSeconds));
	const seconds = compared.map((p) => p.totalSeconds);
	const spreadSeconds =
		seconds.length === 0 ? 0 : Math.max(...seconds) - Math.min(...seconds);

	return {
		playedSeconds: endedAt,
		periods,
		players,
		swaps,
		swapSummary,
		playtime: { averageSeconds, spreadSeconds },
		feedback: feedbackFor(
			swapSummary,
			compared,
			averageSeconds,
			spreadSeconds,
			input.rules,
		),
		substitutions: {
			rules: input.rules,
			...substitutionUsage(timeline, input.rules),
		},
	};
}

function feedbackFor(
	summary: SwapSummary,
	compared: readonly PlayerReport[],
	averageSeconds: number,
	spreadSeconds: number,
	rules: SubstitutionRules,
): Feedback[] {
	const feedback: Feedback[] = [];
	// Swap timing and even playtime in every match assume free swaps; with
	// limited swaps fairness is measured over time instead ("fairOverTime").
	if (!applies("swapTiming", rules.kind)) return feedback;

	// Which periods ran late, worst first. When only one of several periods
	// did, say which; when the swaps were late throughout, say so overall.
	const inPeriods = summary.averageDelayByPeriod
		.map((delay, i) => ({ delay, period: i + 1 }))
		.filter((p): p is { delay: number; period: number } => p.delay !== null);
	const latePeriods = inPeriods
		.filter((p) => p.delay > POLICY.lateSwapSeconds)
		.sort((a, b) => b.delay - a.delay);
	const onlyOnePeriodLate = latePeriods.length === 1 && inPeriods.length > 1;

	if (summary.count === 0) {
		feedback.push({ code: "noSwaps" });
	} else if (onlyOnePeriodLate) {
		const [worst] = latePeriods as [{ delay: number; period: number }];
		feedback.push({
			code: "swapsLate",
			averageSeconds: worst.delay,
			period: worst.period,
		});
	} else if (summary.averageDelaySeconds > POLICY.lateSwapSeconds) {
		feedback.push({
			code: "swapsLate",
			averageSeconds: summary.averageDelaySeconds,
			period: null,
		});
	} else {
		feedback.push({
			code: "swapsOnTime",
			averageSeconds: summary.averageDelaySeconds,
		});
	}

	if (!applies("equalPlaytime", rules.kind)) return feedback;
	const below = compared
		.map((p) => ({ id: p.id, gap: averageSeconds - p.totalSeconds }))
		.filter((p) => p.gap >= POLICY.playtimeGapSeconds)
		.sort((a, b) => b.gap - a.gap)
		.slice(0, 3);
	if (below.length === 0) {
		feedback.push({ code: "evenPlaytime", spreadSeconds });
	} else {
		for (const p of below) {
			feedback.push({
				code: "playerBelowAverage",
				playerId: p.id,
				belowSeconds: p.gap,
			});
		}
	}
	return feedback;
}

/** A finished match's report as kept on the device and exported to a file. */
export interface StoredReport {
	schemaVersion: 1;
	/** Identifies the match; a report is never stored twice for one match. */
	matchId: string;
	/** ISO 8601 timestamp of when the report was made. */
	savedAt: string;
	createdBy: string;
	appVersion: string;
	formatLabel: string;
	match: MatchDetails;
	report: MatchReport;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);

const isNumbers = (value: unknown): boolean =>
	Array.isArray(value) && value.every(isNumber);

/** Whether an unknown value has every field the report screen reads. */
export function isStoredReport(value: unknown): value is StoredReport {
	if (!isRecord(value) || value.schemaVersion !== 1) return false;
	const { report, match } = value;
	if (
		typeof value.matchId !== "string" ||
		value.matchId === "" ||
		typeof value.savedAt !== "string" ||
		Number.isNaN(Date.parse(value.savedAt)) ||
		typeof value.createdBy !== "string" ||
		typeof value.appVersion !== "string" ||
		typeof value.formatLabel !== "string" ||
		!isRecord(match) ||
		typeof match.opponent !== "string" ||
		typeof match.venue !== "string" ||
		typeof match.date !== "string" ||
		!isRecord(report)
	) {
		return false;
	}
	const { players, swaps, swapSummary, playtime, feedback, substitutions } =
		report;
	return (
		isNumber(report.playedSeconds) &&
		isNumber(report.periods) &&
		Array.isArray(players) &&
		players.every(
			(p) =>
				isRecord(p) &&
				typeof p.id === "string" &&
				typeof p.name === "string" &&
				isNumber(p.totalSeconds) &&
				isNumbers(p.periodSeconds) &&
				isRecord(p.zoneSeconds) &&
				Object.values(p.zoneSeconds).every(isNumber) &&
				Array.isArray(p.rests) &&
				p.rests.every(
					(r) =>
						isRecord(r) &&
						isNumber(r.startedAt) &&
						(r.endedAt === null || isNumber(r.endedAt)) &&
						isNumber(r.seconds),
				) &&
				["played", "outForMatch", "lateArrival"].includes(String(p.status)),
		) &&
		Array.isArray(swaps) &&
		swaps.every(
			(s) =>
				isRecord(s) &&
				typeof s.inName === "string" &&
				typeof s.outName === "string" &&
				isNumber(s.period) &&
				isNumber(s.plannedAt) &&
				isNumber(s.at) &&
				isNumber(s.delaySeconds) &&
				(s.inRestedSeconds === null || isNumber(s.inRestedSeconds)),
		) &&
		isRecord(swapSummary) &&
		isNumber(swapSummary.count) &&
		isNumber(swapSummary.averageDelaySeconds) &&
		isNumber(swapSummary.maxDelaySeconds) &&
		isNumber(swapSummary.lateCount) &&
		isNumber(swapSummary.veryLateCount) &&
		Array.isArray(swapSummary.averageDelayByPeriod) &&
		swapSummary.averageDelayByPeriod.every((d) => d === null || isNumber(d)) &&
		isRecord(playtime) &&
		isNumber(playtime.averageSeconds) &&
		isNumber(playtime.spreadSeconds) &&
		Array.isArray(feedback) &&
		feedback.every((f) => isRecord(f) && typeof f.code === "string") &&
		isRecord(substitutions) &&
		parseSubstitutionRules(substitutions.rules) !== null &&
		isNumber(substitutions.substitutesIn) &&
		isNumber(substitutions.occasions) &&
		Array.isArray(substitutions.deviations) &&
		substitutions.deviations.every(
			(d) =>
				isRecord(d) &&
				typeof d.eventId === "string" &&
				isNumber(d.at) &&
				isNumber(d.period) &&
				typeof d.inId === "string" &&
				typeof d.outId === "string" &&
				Array.isArray(d.rules) &&
				d.rules.every((r) =>
					["substitutesIn", "occasions", "reEntry"].includes(String(r)),
				),
		)
	);
}

/**
 * Add a report to the kept ones, newest first. A report for a match that is
 * already kept replaces the old one, and only the newest `max` stay.
 */
export function withReport(
	kept: readonly StoredReport[],
	added: StoredReport,
	max: number,
): StoredReport[] {
	return [added, ...kept.filter((r) => r.matchId !== added.matchId)].slice(
		0,
		max,
	);
}
