import { describe, expect, it } from "vitest";
import {
	buildFormat,
	DEFAULT_FORMAT,
	DEFAULT_TEAM_SIZE,
	FORMATS,
	formatChoice,
	getFormat,
	outfieldCount,
	parseFormation,
	TEAM_SIZES,
	type TeamSizeId,
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
		["", "Skriv formationen som siffror med bindestreck, till exempel 2-3-1."],
		[
			"abc",
			"Skriv formationen som siffror med bindestreck, till exempel 2-3-1.",
		],
		[
			"2--3-1",
			"Skriv formationen som siffror med bindestreck, till exempel 2-3-1.",
		],
		["6", "En formation har 2 till 5 led."],
		["1-1-1-1-1-1", "En formation har 2 till 5 led."],
		["2-0-4", "Varje led behöver minst en spelare."],
		["2-3-2", "Formationen har 7 utespelare, men 7v7 behöver 6."],
		["2-2-1", "Formationen har 5 utespelare, men 7v7 behöver 6."],
	])("rejects %j with a clear message", (text, error) => {
		expect(parseFormation(text, "7v7")).toEqual({ ok: false, error });
	});
});

describe("buildFormat", () => {
	it("turns each line into a pitch zone, back to front", () => {
		const format = buildFormat("9v9", "3-3-2");
		expect(format.id).toBe("9v9:3-3-2");
		expect(format.label).toBe("9v9 (3-3-2)");
		expect(format.zones.map((z) => [z.id, z.label, z.count])).toEqual([
			["back", "Back", 3],
			["mid", "Mittfält", 3],
			["fwd", "Anfall", 2],
		]);
	});

	it.each([
		["2-2", ["Back", "Anfall"]],
		["1-2-1", ["Back", "Mittfält", "Anfall"]],
	] as const)("names the lines of a 5v5 %s", (formation, labels) => {
		expect(buildFormat("5v5", formation).zones.map((z) => z.label)).toEqual(
			labels,
		);
	});

	it.each([
		["4-2-3-1", ["Back", "Defensivt mittfält", "Offensivt mittfält", "Anfall"]],
		[
			"4-2-1-2-1",
			[
				"Back",
				"Defensivt mittfält",
				"Mittfält",
				"Offensivt mittfält",
				"Anfall",
			],
		],
	] as const)("names the lines of an 11v11 %s", (formation, labels) => {
		expect(buildFormat("11v11", formation).zones.map((z) => z.label)).toEqual(
			labels,
		);
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
		expect(() => buildFormat("7v7", "2-3-2")).toThrow(
			"Formationen har 7 utespelare, men 7v7 behöver 6.",
		);
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

	it.each(["13v13", "13v13:2-3-1", "7v7:2-3-2", "7v7:", "nonsense"])(
		"throws a helpful error for %j",
		(id) => {
			expect(() => getFormat(id)).toThrow(/Okänt format/);
		},
	);
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
