import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FormationProblem } from "../src/core/formations.js";
import type { SchedulingProblem } from "../src/core/scheduler.js";
import type { SquadFileProblem } from "../src/core/storage.js";
import { TEXT } from "../src/ui/text.js";

describe("formation problems in Swedish", () => {
	it.each<[FormationProblem, string]>([
		[
			{ code: "notNumbers" },
			"Skriv formationen som siffror med bindestreck, till exempel 2-3-1.",
		],
		[{ code: "lineCount", min: 2, max: 5 }, "En formation har 2 till 5 led."],
		[{ code: "emptyLine" }, "Varje led behöver minst en spelare."],
		[
			{ code: "playerCount", size: "7v7", got: 7, need: 6 },
			"Formationen har 7 utespelare, men 7v7 behöver 6.",
		],
	])("%o", (problem, text) => {
		expect(TEXT.formation.problem(problem)).toBe(text);
	});
});

describe("squad file problems in Swedish", () => {
	it.each<[SquadFileProblem, string]>([
		[
			{ code: "unknownFormat" },
			"Filen har en lagstorlek eller formation som appen inte känner igen.",
		],
		[{ code: "emptySquad" }, "Filen innehåller inga spelare."],
		[{ code: "tooManyPlayers", max: 30 }, "Filen har fler än 30 spelare."],
		[
			{ code: "invalidPlayer", position: 3 },
			"Spelare 3 i filen saknar namn eller id.",
		],
		[{ code: "duplicateId" }, "Filen har samma spelare två gånger."],
		[
			{ code: "rotation" },
			"Filen har ett ogiltigt antal minuter mellan byten.",
		],
		[
			{ code: "periods" },
			"Filen har ett ogiltigt antal perioder eller en ogiltig periodlängd.",
		],
		[
			{ code: "matchDetails" },
			"Filen har ogiltiga matchuppgifter (motståndare, plats, datum eller avsparkstid).",
		],
		[
			{ code: "startingKeeper" },
			"Filen anger en startande målvakt som inte är markerad som målvakt i truppen.",
		],
		[
			{ code: "audit" },
			"Filen har ogiltiga uppgifter om vem som sparade den och när.",
		],
		[{ code: "notObject" }, TEXT.squadFile.unreadable],
		[{ code: "schemaVersion" }, TEXT.squadFile.unreadable],
		[{ code: "playersNotList" }, TEXT.squadFile.unreadable],
	])("%o", (problem, text) => {
		expect(TEXT.squadFile.problem(problem)).toBe(text);
	});
});

describe("scheduling problems in Swedish", () => {
	it.each<[SchedulingProblem, string]>([
		[
			{ code: "tooFewPlayers", available: 5, need: 6 },
			"För få tillgängliga spelare (5). Laget behöver minst 6.",
		],
		[
			{ code: "cannotFillLineup" },
			"Kan inte ställa upp laget rättvist just nu - för få spelare kan spela de platser som är kvar utan att byta mellan icke-angränsande zoner. Justera truppen eller gör ett manuellt byte.",
		],
		[{ code: "unknownPlayer" }, TEXT.match.cannotPlanNextSwap],
		[{ code: "unknownZone" }, TEXT.match.cannotPlanNextSwap],
	])("%o", (problem, text) => {
		expect(TEXT.match.schedulingProblem(problem)).toBe(text);
	});
});

describe("zone names in Swedish", () => {
	it.each([
		["back", "Back"],
		["dmid", "Defensivt mittfält"],
		["mid", "Mittfält"],
		["amid", "Offensivt mittfält"],
		["fwd", "Anfall"],
	])("%s is %s", (id, name) => {
		expect(TEXT.match.zoneName(id)).toBe(name);
	});
});

describe("text lives in the UI", () => {
	it("core modules contain no Swedish user-facing text", () => {
		const offenders = readdirSync(join("src", "core"))
			.filter((file) => file.endsWith(".ts"))
			.flatMap((file) =>
				readFileSync(join("src", "core", file), "utf8")
					.split("\n")
					.filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
					.filter((line) => /["'`][^"'`]*[åäöÅÄÖ][^"'`]*["'`]/.test(line))
					.map((line) => `${file}: ${line.trim()}`),
			);
		expect(offenders).toEqual([]);
	});
});
