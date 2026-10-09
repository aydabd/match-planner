import { describe, expect, it } from "vitest";
import { buildPlayerIdMap, playerId } from "../src/core/playerIdentity.js";
import type { PlayerMatchSummary } from "../src/core/standing.js";
import { newRoster } from "../src/core/storage.js";
import {
	aheadOfSquad,
	proposalFor,
	rulesForMatch,
} from "../src/ui/matchProposal.js";
import type { TeamRecords } from "../src/ui/teamRecords.js";

const ERSATTARE = {
	kind: "limited",
	substitutesIn: 5,
	occasions: 3,
	reEntry: false,
} as const;

const draft = (names: readonly string[]) =>
	newRoster({
		formatId: "7v7:2-3-1",
		substitutions: ERSATTARE,
		players: names.map((name, i) => ({ id: `p${i + 1}`, name })),
	});

describe("the proposal for the next match", () => {
	it("uses the match's own rules, or the team's", () => {
		const team = draft(["A"]);
		expect(rulesForMatch(team, { rules: null, choices: {} })).toEqual(
			ERSATTARE,
		);
		expect(
			rulesForMatch(team, { rules: { kind: "free" }, choices: {} }),
		).toEqual({ kind: "free" });
	});

	it("has no proposal with free swaps", () => {
		expect(
			proposalFor(draft(["A"]), { rules: { kind: "free" }, choices: {} }, {}),
		).toBe(null);
	});

	it("finds each squad player's standing by name, and 0 for a new player", async () => {
		const names = ["Alva", "Bo", "Cleo"];
		const map = await buildPlayerIdMap(names);
		const row = (name: string, seconds: number): PlayerMatchSummary => ({
			teamId: "t",
			matchId: "m1",
			playerId: playerId(map, name),
			date: "2026-09-01",
			started: true,
			seconds,
		});
		const records: TeamRecords = {
			matchSummaries: async () => [row("alva", 3000), row("Bo", 1000)],
		};
		expect(await aheadOfSquad("t", draft(names), records)).toEqual({
			p1: 1000,
			p2: -1000,
			p3: 0,
		});
	});

	it("starts the player furthest behind and honours the coach's choices", () => {
		const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
		const plan = proposalFor(
			draft(names),
			{ rules: null, choices: { p1: "sitOut" } },
			{ p8: -900 },
		);
		expect(Object.values(plan?.zones ?? {}).flat()).toContain("p8");
		expect(plan?.sittingOut.map((p) => p.playerId)).toEqual(["p1"]);
	});
});
