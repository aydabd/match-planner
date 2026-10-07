import { describe, expect, it } from "vitest";
import type { StoredReport } from "../src/core/report.js";
import { buildReport } from "../src/core/report.js";
import {
	reportAsText,
	restSummary,
	zoneBreakdown,
} from "../src/ui/reportText.js";
import { TEXT } from "../src/ui/text.js";

describe("report in Swedish", () => {
	it.each([
		[{ code: "noSwaps" }, "Inga byten gjordes under matchen."],
		[{ code: "swapsOnTime", averageSeconds: 3 }, "Byten gjordes i tid."],
		[
			{ code: "swapsLate", averageSeconds: 45, period: null },
			"Byten var i snitt 45 sekunder sena.",
		],
		[
			{ code: "swapsLate", averageSeconds: 45, period: 2 },
			"Byten var i snitt 45 sekunder sena i period 2.",
		],
		[
			{ code: "playerBelowAverage", playerId: "i", belowSeconds: 240 },
			"Ines spelade 4 minuter mindre än lagets snitt.",
		],
		[
			{ code: "evenPlaytime", spreadSeconds: 90 },
			"Speltiden var jämn: skillnaden mellan mest och minst var 1 min 30 s.",
		],
	] as const)("%o", (item, sentence) => {
		expect(TEXT.report.feedback(item, () => "Ines")).toBe(sentence);
	});

	it("summarises the time rested", () => {
		expect(restSummary([])).toBe("Ingen vila");
		expect(restSummary([{ seconds: 400 }])).toBe("06:40");
		expect(restSummary([{ seconds: 400 }, { seconds: 130 }])).toBe(
			"08:50 (2 vilor)",
		);
	});

	it("describes early, on time and late swaps", () => {
		expect(TEXT.report.delay(0)).toBe("i tid");
		expect(TEXT.report.delay(-10)).toBe("10 sekunder tidig");
		expect(TEXT.report.delay(90)).toBe("1 min 30 s sen");
	});

	it("flags swaps more than 30 s and 1 min late", () => {
		expect(TEXT.report.lateFlag(30)).toBe("");
		expect(TEXT.report.lateFlag(31)).toBe("Sen");
		expect(TEXT.report.lateFlag(61)).toBe("Mycket sen");
	});

	it("names the keeper's line and pitch lines", () => {
		expect(zoneBreakdown({ back: 600, goal: 300, mid: 0 })).toBe(
			"Back 10:00, Målvakt 05:00",
		);
	});

	it("writes the whole report as text to copy", () => {
		const stored: StoredReport = {
			schemaVersion: 1,
			matchId: "m1",
			savedAt: "2026-09-28T10:00:00.000Z",
			createdBy: "",
			appVersion: "0.6.0",
			formatLabel: "7v7 2-3-1",
			match: { opponent: "IFK", venue: "Hemma", date: "2026-09-28T10:00" },
			report: buildReport({
				timeline: [
					{ type: "periodStart", at: 0, period: 1 },
					{ type: "lineup", at: 0, zones: { back: ["a"] }, keeperId: null },
					{ type: "periodEnd", at: 600, period: 1 },
				],
				players: [{ id: "a", name: "Ada" }],
				endedAt: 600,
			}),
		};
		expect(reportAsText(stored)).toBe(
			[
				"IFK · Hemma · 2026-09-28 10:00 · 7v7 2-3-1",
				"",
				"Sammanfattning",
				"- Inga byten gjordes under matchen.",
				"- Speltiden var jämn: skillnaden mellan mest och minst var 0 sekunder.",
				"",
				"Speltid",
				"Ada: 10:00 (Period 1 10:00). Ingen vila",
				"",
				"Byten",
				"Inga byten gjordes.",
			].join("\n"),
		);
	});
});
