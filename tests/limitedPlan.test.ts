import { describe, expect, it } from "vitest";
import { getFormat, outfieldCount } from "../src/core/formations.js";
import {
	type LimitedPlan,
	type LimitedRules,
	type LiveState,
	type PlanSetup,
	planMatch,
	replan,
} from "../src/core/limitedPlan.js";
import { POLICY } from "../src/core/policy.js";
import type { TimelineEvent } from "../src/core/timeline.js";

const ERSATTARE: LimitedRules = {
	kind: "limited",
	...POLICY.limitedSubstitutions,
};

const setup = (
	formatId: string,
	rules: Partial<LimitedRules> = {},
	periods = 2,
	periodMinutes = 40,
): PlanSetup => ({
	format: getFormat(formatId),
	periods,
	periodSeconds: periodMinutes * 60,
	rules: { ...ERSATTARE, ...rules },
});

const squad = (count: number) =>
	Array.from({ length: count }, (_, i) => `p${i + 1}`);

const onPitch = (plan: Pick<LimitedPlan, "zones">) =>
	Object.values(plan.zones).flat();

/** Every swap in order: who came on, who went off, when. */
const swapsOf = (plan: Pick<LimitedPlan, "occasions">) =>
	plan.occasions.flatMap((o) => o.swaps.map((s) => ({ ...s, at: o.at })));

/** The checks every plan must pass, whatever the squad and rules. */
function expectWithinRules(s: PlanSetup, plan: LimitedPlan): void {
	const swaps = swapsOf(plan);
	expect(swaps.length).toBeLessThanOrEqual(s.rules.substitutesIn);
	const inPlay = plan.occasions.filter((o) => !o.atBreak);
	if (s.rules.occasions !== null)
		expect(inPlay.length).toBeLessThanOrEqual(s.rules.occasions);
	// Nobody comes on twice, and nobody who has been on comes on again.
	const been = new Set([...onPitch(plan), plan.keeperId]);
	for (const swap of swaps) {
		expect(been.has(swap.inId)).toBe(false);
		been.add(swap.inId);
	}
	// A player only goes off while on the pitch, and keeps their line.
	const seats = new Map(
		Object.entries(plan.zones).flatMap(([zone, ids]) =>
			ids.map((id) => [id, zone] as const),
		),
	);
	for (const swap of swaps) {
		expect(seats.get(swap.outId)).toBe(swap.zoneId);
		seats.delete(swap.outId);
		seats.set(swap.inId, swap.zoneId);
	}
	const end = s.periods * s.periodSeconds;
	for (const o of plan.occasions) {
		expect(o.at % 60).toBe(0);
		expect(o.at).toBeGreaterThanOrEqual(0);
		expect(o.at).toBeLessThan(end);
		expect(o.atBreak).toBe(o.at % s.periodSeconds === 0 && o.at > 0);
	}
}

describe("planMatch: who plays and who starts", () => {
	it("starts the players furthest behind and lets the one furthest ahead sit out", () => {
		const s = setup("11v11:4-4-2");
		const players = ["keeper", ...squad(16)];
		const ahead = { p1: 1800, p2: -900, p16: 2040 };
		const plan = planMatch(s, { players, keeperId: "keeper", ahead });

		// 10 seats + 5 substitutes: 16 outfield players means one sits out.
		expect(plan.sittingOut).toEqual([{ playerId: "p16", aheadSeconds: 2040 }]);
		expect(onPitch(plan)).toContain("p2");
		expect(onPitch(plan)).not.toContain("p1");
		expect(plan.bench).toContain("p1");
		expect(plan.keeperId).toBe("keeper");
		expectWithinRules(s, plan);
	});

	it("sits out the players furthest ahead, furthest first", () => {
		const s = setup("7v7:2-3-1", { substitutesIn: 1 });
		const ahead = { p7: 100, p8: 300, p9: 200 };
		const plan = planMatch(s, { players: squad(9), keeperId: null, ahead });
		expect(plan.sittingOut.map((p) => p.playerId)).toEqual(["p8", "p9"]);
	});

	it("keeps the squad order between players who stand the same", () => {
		const s = setup("7v7:2-3-1");
		const plan = planMatch(s, { players: squad(8), keeperId: null, ahead: {} });
		expect(onPitch(plan)).toEqual(squad(6));
		expect(plan.bench).toEqual(["p7", "p8"]);
	});

	it("plays one short and says so when there are too few players", () => {
		const s = setup("7v7:2-3-1");
		const plan = planMatch(s, {
			players: ["k", ...squad(4)],
			keeperId: "k",
			ahead: {},
		});
		expect(onPitch(plan)).toHaveLength(4);
		expect(plan.occasions).toEqual([]);
		expect(plan.warnings).toEqual([{ code: "shortHanded", onPitch: 5 }]);
	});
});

describe("planMatch: the coach's changes to the proposal", () => {
	const s = setup("7v7:2-3-1", { substitutesIn: 2 });
	const players = squad(9);
	const ahead = { p1: -600, p9: 600 };

	it("starts, benches and sits out who the coach says, and fills in around them", () => {
		const plan = planMatch(s, {
			players,
			keeperId: null,
			ahead,
			choices: { p9: "start", p1: "sitOut", p2: "bench" },
		});
		expect(onPitch(plan)).toContain("p9");
		expect(onPitch(plan)).not.toContain("p2");
		expect(plan.bench).toContain("p2");
		expect(plan.sittingOut.map((p) => p.playerId)).toContain("p1");
		expect(onPitch(plan)).toHaveLength(6);
		expectWithinRules(s, plan);
	});

	it("moves a choice that does not fit to the next place down", () => {
		const everyoneStarts = Object.fromEntries(
			players.map((id) => [id, "start" as const]),
		);
		const plan = planMatch(s, {
			players,
			keeperId: null,
			ahead,
			choices: everyoneStarts,
		});
		expect(onPitch(plan)).toHaveLength(6);
		expect(plan.bench).toHaveLength(2);
		expect(plan.sittingOut).toHaveLength(1);
	});
});

describe("planMatch: when the swaps are made", () => {
	it("makes every swap in the half-time break when that is the even moment", () => {
		const s = setup("11v11:4-4-2");
		const plan = planMatch(s, {
			players: ["k", ...squad(15)],
			keeperId: "k",
			ahead: {},
		});
		expect(plan.occasions).toHaveLength(1);
		expect(plan.occasions[0]).toMatchObject({ at: 2400, atBreak: true });
		expect(swapsOf(plan)).toHaveLength(5);
		expectWithinRules(s, plan);
	});

	it("uses an occasion during play when no break is near the even moment", () => {
		const s = setup("9v9:3-3-2", {}, 3, 25);
		const plan = planMatch(s, {
			players: ["k", ...squad(10)],
			keeperId: "k",
			ahead: {},
		});
		// 75 minutes: the even moment is 37:30, between the breaks at 25 and
		// 50, so the swaps are made during play at 38:00.
		expect(plan.occasions.map((o) => [o.at, o.atBreak])).toEqual([
			[2280, false],
		]);
		expectWithinRules(s, plan);
	});

	it("takes off the starter who stands furthest ahead", () => {
		const s = setup("7v7:2-3-1", { substitutesIn: 1 });
		const plan = planMatch(s, {
			players: squad(7),
			keeperId: null,
			// p7 is furthest ahead and waits on the bench; of the starters p3 is.
			ahead: { p3: 600, p5: 300, p7: 900 },
		});
		expect(plan.bench).toEqual(["p7"]);
		expect(swapsOf(plan)).toEqual([
			expect.objectContaining({ outId: "p3", inId: "p7" }),
		]);
	});

	it("passes one seat on to several substitutes when there are more than seats", () => {
		const s = setup("5v5:1-2-1", { substitutesIn: 7, occasions: null }, 3, 15);
		const plan = planMatch(s, {
			players: squad(11),
			keeperId: null,
			ahead: {},
		});
		expect(swapsOf(plan)).toHaveLength(7);
		expectWithinRules(s, plan);
		// The seat that gets two substitutes passes from the first to the second.
		const chained = swapsOf(plan).filter((x) =>
			swapsOf(plan).some((y) => y.inId === x.outId),
		);
		expect(chained.length).toBeGreaterThan(0);
	});

	it.each([
		["one occasion", 1],
		["two occasions", 2],
		["three occasions", 3],
	])("never uses more than %s during play", (_, occasions) => {
		const s = setup("7v7:2-3-1", { substitutesIn: 5, occasions }, 3, 20);
		const plan = planMatch(s, {
			players: squad(11),
			keeperId: null,
			ahead: {},
		});
		expect(plan.occasions.filter((o) => !o.atBreak).length).toBeLessThanOrEqual(
			occasions,
		);
		expectWithinRules(s, plan);
	});

	it("passes the rule checks for every format and limit", () => {
		for (const formatId of [
			"5v5:1-2-1",
			"7v7:2-3-1",
			"9v9:3-3-2",
			"11v11:4-4-2",
		]) {
			const seats = outfieldCount(getFormat(formatId));
			for (const substitutesIn of [1, 3, 5, 7]) {
				for (const occasions of [1, 3, null]) {
					for (const periods of [1, 2, 3]) {
						const s = setup(
							formatId,
							{ substitutesIn, occasions },
							periods,
							20,
						);
						const plan = planMatch(s, {
							players: squad(seats + 8),
							keeperId: null,
							ahead: { p1: 500, p2: -500 },
						});
						expectWithinRules(s, plan);
					}
				}
			}
		}
	});
});

describe("replan: the rest of the match within what is left", () => {
	const s = setup("7v7:2-3-1", { substitutesIn: 2, occasions: 1 }, 2, 20);
	const zones = { back: ["a", "b"], mid: ["c", "d", "e"], fwd: ["f"] };

	const live = (fields: Partial<LiveState> = {}): LiveState => ({
		now: 600,
		atBreak: false,
		zones,
		keeperId: "k",
		bench: ["x", "y"],
		played: { a: 600, b: 600, c: 600, d: 600, e: 600, f: 600 },
		timeline: [
			{ type: "periodStart", at: 0, period: 1 },
			{ type: "lineup", at: 0, zones, keeperId: "k" },
		],
		ahead: {},
		...fields,
	});

	const swap = (
		id: string,
		at: number,
		inId: string,
		outId: string,
		plannedAt = at,
	): TimelineEvent => ({
		type: "substitution",
		id,
		at,
		plannedAt,
		period: at < 1200 ? 1 : 2,
		inId,
		zoneId: "back",
		moves: [],
		outId,
	});

	it("plans the remaining substitutes and occasions from now", () => {
		const { occasions, warnings } = replan(s, live());
		expect(warnings).toEqual([]);
		expect(occasions.flatMap((o) => o.swaps)).toHaveLength(2);
		expect(occasions.every((o) => o.at >= 600)).toBe(true);
	});

	it("only plans what is left after a swap made earlier than planned", () => {
		const timeline = [...live().timeline, swap("s1", 300, "x", "a")];
		const { occasions } = replan(
			s,
			live({
				timeline,
				zones: { ...zones, back: ["x", "b"] },
				bench: ["y"],
				played: { ...live().played, a: 300, x: 300 },
			}),
		);
		// One substitute and no occasion during play are left: the break remains.
		expect(occasions).toEqual([
			{
				at: 1200,
				atBreak: true,
				swaps: [expect.objectContaining({ inId: "y" })],
			},
		]);
	});

	it("never plans a replaced player back on without re-entry", () => {
		const timeline = [...live().timeline, swap("s1", 300, "x", "a")];
		const { occasions } = replan(
			s,
			live({
				timeline,
				zones: { ...zones, back: ["x", "b"] },
				bench: ["a", "y"],
			}),
		);
		expect(occasions.flatMap((o) => o.swaps.map((x) => x.inId))).not.toContain(
			"a",
		);
	});

	it("warns, and plans nothing, when the substitutes are used up", () => {
		const timeline = [
			...live().timeline,
			swap("s1", 300, "x", "a"),
			swap("s2", 300, "y", "b"),
		];
		expect(
			replan(
				s,
				live({
					timeline,
					zones: { ...zones, back: ["x", "y"] },
					bench: ["z"],
				}),
			),
		).toEqual({ occasions: [], warnings: [{ code: "noSubstitutesLeft" }] });
	});

	it("warns when the occasions are used up and no break is left", () => {
		const timeline = [...live().timeline, swap("s1", 1300, "x", "a")];
		expect(
			replan(
				s,
				live({
					now: 1500,
					timeline,
					zones: { ...zones, back: ["x", "b"] },
					bench: ["y"],
				}),
			),
		).toEqual({ occasions: [], warnings: [{ code: "noOccasionsLeft" }] });
	});

	it("says the team plays one short after an injury with no cover", () => {
		const { warnings } = replan(
			s,
			live({ zones: { ...zones, back: ["b"] }, bench: [] }),
		);
		expect(warnings).toEqual([{ code: "shortHanded", onPitch: 6 }]);
	});

	it("counts the break it is in as free", () => {
		const timeline = [
			...live().timeline,
			swap("s1", 300, "x", "a"),
			{ type: "periodEnd", at: 1200, period: 1 } as const,
		];
		const { occasions } = replan(
			s,
			live({
				now: 1200,
				atBreak: true,
				timeline,
				zones: { ...zones, back: ["x", "b"] },
				bench: ["y"],
			}),
		);
		expect(occasions[0]).toMatchObject({ at: 1200, atBreak: true });
	});

	it("plans nothing once the match is over", () => {
		expect(replan(s, live({ now: 2400 })).occasions).toEqual([]);
	});
});
