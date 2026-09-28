import { describe, expect, it } from "vitest";
import {
	buildFormat,
	DEFAULT_FORMAT,
	DEFAULT_TEAM_SIZE,
	FORMATS,
	FormatError,
	formatChoice,
	getFormat,
	outfieldCount,
	parseFormation,
	TEAM_SIZES,
	type TeamSizeId,
	teamSizeOf,
} from "../src/core/formations.js";

describe("team sizes", () => {
	it.each([
		["5v5", 4],
		["7v7", 6],
		["9v9", 8],
		["11v11", 10],
	] as const)(
		"%s has %i outfield players plus a goalkeeper",
		(size, outfield) => {
			expect(TEAM_SIZES[size].outfield).toBe(outfield);
		},
	);

	it("offers quick-pick formations that fit each team size", () => {
		for (const [size, config] of Object.entries(TEAM_SIZES)) {
			expect(config.presets.length).toBeGreaterThan(0);
			for (const formation of config.presets) {
				expect(
					parseFormation(formation, size as TeamSizeId),
					`${size} ${formation}`,
				).toMatchObject({ ok: true });
			}
		}
	});
});

describe("parseFormation", () => {
	it("reads lines from defence to attack", () => {
		expect(parseFormation("4-2-1-2-1", "11v11")).toEqual({
			ok: true,
			formation: "4-2-1-2-1",
			lines: [4, 2, 1, 2, 1],
		});
	});

	it("accepts spaces and other dash characters, and normalises them", () => {
		expect(parseFormation(" 4 - 3 – 3 ", "11v11")).toEqual({
			ok: true,
			formation: "4-3-3",
			lines: [4, 3, 3],
		});
	});

	it.each([
		["", { code: "notNumbers" }],
		["abc", { code: "notNumbers" }],
		["2--3-1", { code: "notNumbers" }],
		["6", { code: "lineCount", min: 2, max: 5 }],
		["1-1-1-1-1-1", { code: "lineCount", min: 2, max: 5 }],
		["2-0-4", { code: "emptyLine" }],
		["2-3-2", { code: "playerCount", size: "7v7", got: 7, need: 6 }],
		["2-2-1", { code: "playerCount", size: "7v7", got: 5, need: 6 }],
	] as const)("rejects %j and says why", (text, problem) => {
		expect(parseFormation(text, "7v7")).toEqual({ ok: false, problem });
	});
});

describe("buildFormat", () => {
	it("turns each line into a pitch zone, back to front", () => {
		const format = buildFormat("9v9", "3-3-2");
		expect(format.id).toBe("9v9:3-3-2");
		expect(format.label).toBe("9v9 (3-3-2)");
		expect(format.zones.map((z) => [z.id, z.count])).toEqual([
			["back", 3],
			["mid", 3],
			["fwd", 2],
		]);
	});

	it.each([
		["5v5", "2-2", ["back", "fwd"]],
		["5v5", "1-2-1", ["back", "mid", "fwd"]],
		["11v11", "4-2-3-1", ["back", "dmid", "amid", "fwd"]],
		["11v11", "4-2-1-2-1", ["back", "dmid", "mid", "amid", "fwd"]],
	] as const)("names the zones of a %s %s by line", (size, formation, ids) => {
		expect(buildFormat(size, formation).zones.map((z) => z.id)).toEqual(ids);
	});

	it("makes only neighbouring lines adjacent", () => {
		const format = buildFormat("11v11", "4-2-1-2-1");
		expect(
			Object.fromEntries(format.zones.map((z) => [z.id, z.adjacent])),
		).toEqual({
			back: ["dmid"],
			dmid: ["back", "mid"],
			mid: ["dmid", "amid"],
			amid: ["mid", "fwd"],
			fwd: ["amid"],
		});
	});

	it("has as many seats as the team size has outfield players", () => {
		expect(outfieldCount(buildFormat("11v11", "4-2-1-2-1"))).toBe(10);
	});

	it("refuses an invalid formation", () => {
		expect(() => buildFormat("7v7", "2-3-2")).toThrow(FormatError);
	});
});

describe("getFormat", () => {
	it("builds any valid size and formation from its id", () => {
		expect(getFormat("11v11:4-2-1-2-1")).toEqual(
			buildFormat("11v11", "4-2-1-2-1"),
		);
	});

	it("still accepts the original 7v7 id as 7v7 (2-3-1)", () => {
		expect(getFormat("7v7")).toEqual(buildFormat("7v7", "2-3-1"));
	});

	it.each([
		"13v13",
		"13v13:2-3-1",
		"7v7:2-3-2",
		"7v7:",
		"nonsense",
		"7v7:2-3-1:evil",
		"7v7:2 - 3 - 1",
		"7v7:2–3–1",
	])("throws a helpful error for %j", (id) => {
		expect(() => getFormat(id)).toThrow(FormatError);
	});
});

describe("default format", () => {
	it("is the default team size's first quick pick", () => {
		expect(DEFAULT_FORMAT).toEqual(
			buildFormat(DEFAULT_TEAM_SIZE, TEAM_SIZES[DEFAULT_TEAM_SIZE].presets[0]),
		);
	});
});

describe("formatChoice", () => {
	it("splits a quick pick into team size and formation", () => {
		expect(formatChoice("9v9:3-3-2")).toEqual({
			size: "9v9",
			formation: "3-3-2",
			custom: false,
		});
	});

	it("marks a formation that is not a quick pick as custom", () => {
		expect(formatChoice("11v11:4-2-1-2-1")).toEqual({
			size: "11v11",
			formation: "4-2-1-2-1",
			custom: true,
		});
	});

	it("reads the original 7v7 id as the 2-3-1 quick pick", () => {
		expect(formatChoice("7v7")).toEqual({
			size: "7v7",
			formation: "2-3-1",
			custom: false,
		});
	});
});

describe("quick-pick formats", () => {
	it("lists every preset for every team size, smallest first", () => {
		expect(Object.keys(FORMATS)).toEqual(
			Object.entries(TEAM_SIZES).flatMap(([size, config]) =>
				config.presets.map((formation) => `${size}:${formation}`),
			),
		);
		expect(Object.keys(FORMATS)[0]).toMatch(/^5v5:/);
	});

	it("keeps adjacency symmetric in every preset", () => {
		for (const format of Object.values(FORMATS)) {
			const byId = new Map(format.zones.map((z) => [z.id, z]));
			for (const zone of format.zones) {
				for (const adj of zone.adjacent) {
					expect(
						byId.get(adj)?.adjacent,
						`${format.id}: "${zone.id}"->"${adj}"`,
					).toContain(zone.id);
				}
			}
		}
	});
});

describe("teamSizeOf", () => {
	it.each([
		["9v9:3-3-2", "9v9"],
		["11v11:4-2-1-2-1", "11v11"],
		["7v7", "7v7"],
	])("%s is a %s team", (id, size) => {
		expect(teamSizeOf(id)).toBe(size);
	});
});
