import { describe, expect, it } from "vitest";
import { TEAM_SIZES } from "../src/core/formations.js";
import { LIMITS } from "../src/core/limits.js";
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
	tick,
} from "../src/core/matchClock.js";

/** 2 x 20 min with a swap every 10 min. */
const PLAN: MatchPlan = {
	periods: 2,
	periodSeconds: 1200,
	rotationSeconds: 600,
};

/** Tick one second at a time, as the app does. */
function play(clock: MatchClock, seconds: number, plan = PLAN) {
	let current = clock;
	const events: string[] = [];
	for (let i = 0; i < seconds; i++) {
		const result = tick(current, plan);
		current = result.clock;
		events.push(...result.events.map((e) => `${e.type}:${e.period}`));
	}
	return { clock: current, events };
}

describe("match clock", () => {
	it("does nothing before kickoff", () => {
		expect(tick(NEW_CLOCK, PLAN)).toEqual({ clock: NEW_CLOCK, events: [] });
	});

	it("counts period and rotation time once the match is on", () => {
		const { clock } = play(kickoff(NEW_CLOCK), 90);
		expect(clock).toEqual({
			phase: "playing",
			period: 1,
			periodElapsed: 90,
			rotationElapsed: 90,
		});
	});

	it("keeps running when a swap is due, counting how late it is", () => {
		const { clock } = play(kickoff(NEW_CLOCK), 625);
		expect(clock.phase).toBe("playing");
		expect(rotationStatus(clock, PLAN)).toEqual({
			due: true,
			progress: 1,
			remainingSeconds: 0,
			lateSeconds: 25,
		});
	});

	it("starts the swap timer again when a new lineup goes on", () => {
		const { clock } = play(kickoff(NEW_CLOCK), 620);
		const swapped = lineupChanged(clock);
		expect(swapped.rotationElapsed).toBe(0);
		expect(swapped.periodElapsed).toBe(620);
	});

	it("stops at the end of a period and waits for the next one", () => {
		const { clock, events } = play(kickoff(NEW_CLOCK), 1200);
		expect(events).toEqual(["periodEnded:1"]);
		expect(clock.phase).toBe("periodBreak");

		const idle = play(clock, 60);
		expect(idle.clock).toEqual(clock);
		expect(idle.events).toEqual([]);
	});

	it("starts the next period at 00:00 with a fresh swap timer", () => {
		const { clock } = play(kickoff(NEW_CLOCK), 1200);
		expect(startNextPeriod(clock, PLAN)).toEqual({
			phase: "playing",
			period: 2,
			periodElapsed: 0,
			rotationElapsed: 0,
		});
	});

	it("finishes after the last period", () => {
		const first = play(kickoff(NEW_CLOCK), 1200).clock;
		const { clock, events } = play(startNextPeriod(first, PLAN), 1200);
		expect(events).toEqual(["periodEnded:2", "matchEnded:2"]);
		expect(clock.phase).toBe("finished");
		expect(startNextPeriod(clock, PLAN)).toEqual(clock);
	});

	it("only starts a next period from a break", () => {
		const playing = play(kickoff(NEW_CLOCK), 30).clock;
		expect(startNextPeriod(playing, PLAN)).toEqual(playing);
		expect(startNextPeriod(NEW_CLOCK, PLAN)).toEqual(NEW_CLOCK);
	});

	it("kicks off only once", () => {
		const playing = play(kickoff(NEW_CLOCK), 30).clock;
		expect(kickoff(playing)).toEqual(playing);
	});
});

describe("status for the screen", () => {
	it("shows the period and the time left in it", () => {
		const { clock } = play(kickoff(NEW_CLOCK), 450);
		expect(periodStatus(clock, PLAN)).toEqual({
			period: 1,
			periods: 2,
			elapsedSeconds: 450,
			remainingSeconds: 750,
		});
	});

	it("tells how far through the swap timer the lineup is", () => {
		const { clock } = play(kickoff(NEW_CLOCK), 150);
		expect(rotationStatus(clock, PLAN)).toEqual({
			due: false,
			progress: 0.25,
			remainingSeconds: 450,
			lateSeconds: 0,
		});
	});

	it("treats a zero-length swap interval as due at once", () => {
		expect(
			rotationStatus(NEW_CLOCK, { ...PLAN, rotationSeconds: 0 }),
		).toMatchObject({ due: true, progress: 1 });
	});

	it("gives the time since kickoff across periods", () => {
		const first = play(kickoff(NEW_CLOCK), 1200).clock;
		const second = play(startNextPeriod(first, PLAN), 75).clock;
		expect(matchSecond(second, PLAN)).toBe(1275);
	});
});

describe("default match length per team size", () => {
	it("every team size has periods and minutes within the limits", () => {
		for (const size of Object.values(TEAM_SIZES)) {
			expect(size.periods).toBeGreaterThanOrEqual(LIMITS.periods.min);
			expect(size.periods).toBeLessThanOrEqual(LIMITS.periods.max);
			expect(size.periodMinutes).toBeGreaterThanOrEqual(
				LIMITS.periodMinutes.min,
			);
			expect(size.periodMinutes).toBeLessThanOrEqual(LIMITS.periodMinutes.max);
		}
	});

	it("11v11 plays 2 x 40 minutes, as SvFF sets for 15-year-olds", () => {
		expect(TEAM_SIZES["11v11"]).toMatchObject({
			periods: 2,
			periodMinutes: 40,
		});
	});
});

describe("swapDueAt", () => {
	it("is when the swap timer reaches the swap interval", () => {
		const { clock } = play(kickoff(NEW_CLOCK), 570);
		expect(swapDueAt(clock, PLAN)).toBe(600);
	});

	it("stays in the past for a swap that is already late", () => {
		const { clock } = play(kickoff(NEW_CLOCK), 640);
		expect(swapDueAt(clock, PLAN)).toBe(600);
	});

	it("counts from the current lineup, not from kickoff", () => {
		const { clock } = play(
			lineupChanged(play(kickoff(NEW_CLOCK), 630).clock),
			100,
		);
		expect(swapDueAt(clock, PLAN)).toBe(630 + 600);
	});
});
