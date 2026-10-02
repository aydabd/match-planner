import { describe, expect, it } from "vitest";
import { placeTeam, previewMerge } from "../src/core/importTeam.js";
import type { TeamData } from "../src/core/teamData.js";
import { makeMatchFile } from "./support/matchFiles.js";

const LOCAL = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const INCOMING = "33333333-3333-4333-8333-333333333333";

const place = (
	input: Partial<Parameters<typeof placeTeam>[0]> = {},
): ReturnType<typeof placeTeam> =>
	placeTeam({
		localTeamId: LOCAL,
		localIsEmpty: false,
		otherLocalTeamIds: [OTHER],
		incomingTeamId: INCOMING,
		...input,
	});

describe("placeTeam", () => {
	it("merges into the active team when the files name no team", () => {
		expect(place({ incomingTeamId: null })).toEqual({ action: "active" });
	});

	it("uses the team when the files are its own", () => {
		expect(place({ incomingTeamId: LOCAL })).toEqual({ action: "use" });
	});

	it("refuses another local team's id, even for an empty team", () => {
		const refuse = { action: "refuse", reason: "belongsToOtherLocalTeam" };
		expect(place({ incomingTeamId: OTHER })).toEqual(refuse);
		expect(place({ incomingTeamId: OTHER, localIsEmpty: true })).toEqual(
			refuse,
		);
	});

	it("lets an empty team take on the files' id", () => {
		expect(place({ localIsEmpty: true })).toEqual({
			action: "adopt",
			teamId: INCOMING,
		});
	});

	it("asks when a team with data is given another team's files", () => {
		expect(place()).toEqual({ action: "ask", teamId: INCOMING });
	});
});

describe("previewMerge", () => {
	const data = (...ids: string[]): TeamData => ({
		matches: ids.map((matchId, i) => makeMatchFile({ matchId, seed: i + 1 })),
		notes: [],
		squads: [],
	});

	it("counts matches before and after, de-duplicated by match id", () => {
		expect(previewMerge(data("a"), data("b", "c"))).toEqual({
			local: 1,
			incoming: 2,
			merged: 3,
		});
	});

	it("does not count a shared match twice", () => {
		expect(previewMerge(data("a", "b"), data("b", "c"))).toEqual({
			local: 2,
			incoming: 2,
			merged: 3,
		});
	});

	it("handles empty sides", () => {
		expect(previewMerge(data(), data())).toEqual({
			local: 0,
			incoming: 0,
			merged: 0,
		});
	});
});
