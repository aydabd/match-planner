import { describe, expect, it } from "vitest";
import {
	type MatchFile,
	MatchFileError,
	type MatchFileProblem,
	matchFileName,
	matchFileToJson,
	newMatchFile,
	parseMatchFile,
	startersOf,
	withDeviationNote,
} from "../src/core/matchFile.js";
import { makeMatchFile } from "./support/matchFiles.js";

function problemOf(data: unknown): MatchFileProblem | undefined {
	try {
		parseMatchFile(data);
	} catch (err) {
		if (err instanceof MatchFileError) return err.problem;
		throw err;
	}
	return undefined;
}

/** A match file as loose JSON, so a test can break it in one place. */
// biome-ignore lint/suspicious/noExplicitAny: tests edit arbitrary JSON
type Doc = Record<string, any>;

/** A copy of a valid file that the test breaks in one place. */
function broken(edit: (file: Doc) => void): unknown {
	const file = JSON.parse(matchFileToJson(makeMatchFile()));
	edit(file);
	return file;
}

describe("parseMatchFile", () => {
	it("reads a file it wrote itself, unchanged", () => {
		const file = makeMatchFile({ seed: 7 });
		expect(parseMatchFile(JSON.parse(matchFileToJson(file)))).toEqual(file);
	});

	it("holds audit, setup, squad and timeline", () => {
		const file = makeMatchFile();
		expect(file.audit).toMatchObject({
			matchId: expect.any(String),
			createdAt: expect.any(String),
			createdBy: "Tränare",
			appVersion: expect.any(String),
		});
		expect(file.match).toEqual({
			opponent: "IFK Test",
			venue: "Hemmaplan",
			date: "2026-09-05",
		});
		expect(file.setup.formatId).toBe("7v7:2-3-1");
		expect(startersOf(file.timeline)).toHaveLength(7);
	});

	it.each([
		[
			"another schema version",
			(f: Doc) => {
				f.schemaVersion = 2;
			},
			{ code: "schemaVersion" },
		],
		[
			"no match id",
			(f: Doc) => {
				f.audit.matchId = "";
			},
			{ code: "audit" },
		],
		[
			"a broken created-at time",
			(f: Doc) => {
				f.audit.createdAt = "yesterday";
			},
			{ code: "audit" },
		],
		[
			"a too long opponent",
			(f: Doc) => {
				f.match.opponent = "x".repeat(200);
			},
			{ code: "matchDetails" },
		],
		[
			"an unknown format",
			(f: Doc) => {
				f.setup.formatId = "6v6:2-2-2";
			},
			{ code: "setup" },
		],
		[
			"periods out of range",
			(f: Doc) => {
				f.setup.periods = 9;
			},
			{ code: "setup" },
		],
		[
			"an empty squad",
			(f: Doc) => {
				f.squad.players = [];
			},
			{ code: "squad" },
		],
		[
			"a timeline that is not a list",
			(f: Doc) => {
				f.timeline = {};
			},
			{ code: "timelineNotList" },
		],
		[
			"an end time outside the match",
			(f: Doc) => {
				f.endedAt = 99999;
			},
			{ code: "endedAt" },
		],
		[
			"starters that are not the first lineup",
			(f: Doc) => {
				f.squad.startingIds = f.squad.startingIds.slice(1);
			},
			{ code: "startingIds" },
		],
		[
			"the same starter twice in place of another",
			(f: Doc) => {
				f.squad.startingIds[1] = f.squad.startingIds[0];
			},
			{ code: "startingIds" },
		],
		[
			"no lineup at all",
			(f: Doc) => {
				f.timeline = f.timeline.filter((e: Doc) => e.type !== "lineup");
			},
			{ code: "noKickoff" },
		],
	])("refuses a file with %s", (_why, edit, problem) => {
		expect(problemOf(broken(edit))).toEqual(problem);
	});

	it("refuses something that is not an object", () => {
		expect(problemOf("text")).toEqual({ code: "notObject" });
		expect(problemOf([])).toEqual({ code: "notObject" });
	});

	describe("timeline order", () => {
		const at = (index: number) => (f: Doc) => f.timeline[index];

		it("refuses times that go backwards", () => {
			const data = broken((f) => {
				at(3)(f).at = 5;
				at(2)(f).at = 400;
			});
			expect(problemOf(data)).toMatchObject({ code: "event", reason: "order" });
		});

		it("refuses a period that starts out of order", () => {
			const data = broken((f) => {
				at(0)(f).period = 2;
			});
			expect(problemOf(data)).toMatchObject({
				code: "event",
				position: 1,
				reason: "period",
			});
		});

		it("refuses a period that runs longer than it is", () => {
			const data = broken((f) => {
				const end = f.timeline.findIndex((e: Doc) => e.type === "periodEnd");
				f.timeline[end].at = 601;
			});
			expect(problemOf(data)).toMatchObject({ reason: "period" });
		});

		it("refuses a lineup with a player who is not in the squad", () => {
			const data = broken((f) => {
				at(1)(f).zones.back[0] = "nobody";
			});
			expect(problemOf(data)).toMatchObject({ position: 2, reason: "player" });
		});

		it("refuses a player in two places at once", () => {
			const data = broken((f) => {
				const line = at(1)(f).zones;
				line.back[1] = line.back[0];
			});
			expect(problemOf(data)).toMatchObject({ position: 2, reason: "lineup" });
		});

		it("refuses a line the formation does not have", () => {
			const data = broken((f) => {
				at(1)(f).zones.wing = ["x"];
			});
			expect(problemOf(data)).toMatchObject({ reason: "lineup" });
		});

		it("refuses a kickoff lineup that comes before any period started", () => {
			const data = broken((f) => {
				const [start, lineup] = [f.timeline[0], f.timeline[1]];
				f.timeline[0] = lineup;
				f.timeline[1] = start;
			});
			expect(problemOf(data)).toMatchObject({
				code: "event",
				position: 1,
				reason: "period",
			});
		});

		it("refuses an unknown event", () => {
			const data = broken((f) => {
				f.timeline.push({ type: "goal", at: 1200 });
			});
			expect(problemOf(data)).toMatchObject({ reason: "unknown" });
		});
	});
});

describe("every kind of event in a match file", () => {
	/** A valid file with one of each event, ids taken from the squad. */
	function busy(): Doc {
		const file = JSON.parse(matchFileToJson(makeMatchFile({ seed: 4 }))) as Doc;
		const [keeper, a, b] = file.squad.players.map((p: Doc) => p.id);
		const firstEnd = file.timeline.findIndex(
			(e: Doc) => e.type === "periodEnd",
		);
		file.timeline.splice(
			firstEnd,
			0,
			{ type: "lateArrival", at: 590, period: 1, playerId: b },
			{
				type: "substitution",
				id: "swap-1",
				at: 592,
				plannedAt: 580,
				period: 1,
				inId: a,
				zoneId: "back",
				moves: [{ playerId: b, from: "mid", to: "back" }],
				outId: b,
			},
			{ type: "keeperChange", at: 594, period: 1, fromId: keeper, toId: a },
			{ type: "outForMatch", at: 596, period: 1, playerId: a },
		);
		return file;
	}

	it("accepts substitutions, keeper changes, late arrivals and injuries", () => {
		const file = busy();
		expect(parseMatchFile(file).timeline).toEqual(file.timeline);
	});

	it.each([
		[
			"a substitution with no planned time",
			(f: Doc) => delete f.timeline[firstOf(f, "substitution")].plannedAt,
		],
		[
			"a substitution move to a line the formation lacks",
			(f: Doc) => {
				f.timeline[firstOf(f, "substitution")].moves[0].to = "wing";
			},
		],
		[
			"a substitution move without a player",
			(f: Doc) => {
				f.timeline[firstOf(f, "substitution")].moves = [{}];
			},
		],
		[
			"a substitution for someone outside the squad",
			(f: Doc) => {
				f.timeline[firstOf(f, "substitution")].outId = "nobody";
			},
		],
		[
			"a keeper change to someone outside the squad",
			(f: Doc) => {
				f.timeline[firstOf(f, "keeperChange")].toId = "nobody";
			},
		],
		[
			"a keeper change from someone outside the squad",
			(f: Doc) => {
				f.timeline[firstOf(f, "keeperChange")].fromId = "nobody";
			},
		],
		[
			"an injury in a period the match does not have",
			(f: Doc) => {
				f.timeline[firstOf(f, "outForMatch")].period = 9;
			},
		],
		[
			"a late arrival outside the squad",
			(f: Doc) => {
				f.timeline[firstOf(f, "lateArrival")].playerId = "nobody";
			},
		],
		[
			"a keeper who is also on the pitch",
			(f: Doc) => {
				const lineup = f.timeline[1];
				lineup.keeperId = lineup.zones.back[0];
			},
		],
		[
			"a keeper outside the squad",
			(f: Doc) => {
				f.timeline[1].keeperId = "nobody";
			},
		],
		[
			"a lineup that is not an object",
			(f: Doc) => {
				f.timeline[1].zones = [];
			},
		],
		[
			"a line with too many players",
			(f: Doc) => {
				const line = f.timeline[1].zones;
				line.fwd = [...line.fwd, ...line.back];
			},
		],
		[
			"a substitution without an id",
			(f: Doc) => {
				delete f.timeline[firstOf(f, "substitution")].id;
			},
		],
		[
			"a substitution whose id is too long",
			(f: Doc) => {
				f.timeline[firstOf(f, "substitution")].id = "x".repeat(101);
			},
		],
		[
			"two substitutions with the same id",
			(f: Doc) => {
				const swap = f.timeline[firstOf(f, "substitution")];
				f.timeline.splice(firstOf(f, "substitution") + 1, 0, { ...swap });
			},
		],
		[
			"an event without a time",
			(f: Doc) => {
				delete f.timeline[0].at;
			},
		],
	])("refuses %s", (_why, edit) => {
		const file = busy();
		edit(file);
		expect(problemOf(file)).toMatchObject({ code: "event" });
	});

	it("refuses a timeline with too many events", () => {
		const file = busy();
		file.timeline = Array.from({ length: 5001 }, () => file.timeline[0]);
		expect(problemOf(file)).toEqual({ code: "tooManyEvents", max: 5000 });
	});

	it("refuses a squad that a player list cannot be read from", () => {
		expect(
			problemOf(
				broken((f) => {
					f.squad.players = [{ id: "" }];
				}),
			),
		).toEqual({ code: "squad" });
	});

	it("refuses match details that are not text", () => {
		expect(
			problemOf(
				broken((f) => {
					f.match = 3;
				}),
			),
		).toEqual({ code: "matchDetails" });
	});

	it("refuses a period that starts before the last one ended", () => {
		const data = broken((f) => {
			f.timeline[
				f.timeline.findIndex(
					(e: Doc) => e.type === "periodStart" && e.period === 2,
				)
			].at = 500;
		});
		expect(problemOf(data)).toMatchObject({ code: "event" });
	});
});

function firstOf(file: Doc, type: string): number {
	return file.timeline.findIndex((e: Doc) => e.type === type);
}

describe("the rules and the coach's deviation notes in a match file", () => {
	/** A valid file with one substitution, "swap-1", to write notes about. */
	function withSwap(): MatchFile {
		const file = makeMatchFile({ seed: 4 });
		const lineup = file.timeline[1];
		if (lineup?.type !== "lineup") throw new Error("no kickoff lineup");
		const [outId] = lineup.zones.back ?? [];
		const inId = file.squad.players.find(
			(p) => !file.squad.startingIds.includes(p.id),
		)?.id;
		if (!outId || !inId) throw new Error("no swap possible");
		file.timeline.splice(2, 0, {
			type: "substitution",
			id: "swap-1",
			at: 10,
			plannedAt: 10,
			period: 1,
			inId,
			zoneId: "back",
			moves: [],
			outId,
		});
		return file;
	}

	const note = (file: MatchFile, fields: Doc = {}) => ({
		matchId: file.audit.matchId,
		eventId: "swap-1",
		note: "Skadad, fick bytas trots att bytena var slut.",
		writtenAt: "2026-09-05T13:00:00.000Z",
		...fields,
	});

	it("keeps the rules that applied and a note on a swap", () => {
		const file = withSwap();
		file.setup.substitutions = {
			kind: "limited",
			substitutesIn: 5,
			occasions: 3,
			reEntry: false,
		};
		file.deviationNotes = [note(file)];
		expect(parseMatchFile(JSON.parse(matchFileToJson(file)))).toEqual(file);
	});

	it.each([
		["no rules", (f: Doc) => delete f.setup.substitutions],
		[
			"rules with too many substitutes",
			(f: Doc) => {
				f.setup.substitutions = {
					kind: "limited",
					substitutesIn: 8,
					occasions: 3,
					reEntry: false,
				};
			},
		],
	])("refuses a setup with %s", (_, edit) => {
		const file = JSON.parse(matchFileToJson(withSwap())) as Doc;
		edit(file);
		expect(problemOf(file)).toEqual({ code: "setup" });
	});

	it.each([
		["no list of notes", (f: Doc) => delete f.deviationNotes],
		["a note on another match", () => [{ matchId: "other" }]],
		["a note on an event that is not a swap", () => [{ eventId: "nope" }]],
		["an empty note", () => [{ note: "   " }]],
		["a note that is too long", () => [{ note: "x".repeat(501) }]],
		["a note without a time", () => [{ writtenAt: "later" }]],
		["two notes on one swap", () => [{}, {}]],
	])("refuses %s", (_, change) => {
		const file = withSwap();
		const doc = JSON.parse(matchFileToJson(file)) as Doc;
		const notes = change(doc);
		if (Array.isArray(notes))
			doc.deviationNotes = notes.map((fields: Doc) => note(file, fields));
		expect(problemOf(doc)).toEqual({ code: "deviationNotes" });
	});

	it("adds, replaces and removes a note without touching the timeline", () => {
		const file = withSwap();
		const first = withDeviationNote(
			file,
			"swap-1",
			"  Skada  ",
			"2026-09-05T13:00:00Z",
		);
		expect(first.deviationNotes).toEqual([
			{
				matchId: file.audit.matchId,
				eventId: "swap-1",
				note: "Skada",
				writtenAt: "2026-09-05T13:00:00Z",
			},
		]);
		const second = withDeviationNote(
			first,
			"swap-1",
			"Ny",
			"2026-09-05T14:00:00Z",
		);
		expect(second.deviationNotes.map((n) => n.note)).toEqual(["Ny"]);
		expect(
			withDeviationNote(second, "swap-1", " ", "x").deviationNotes,
		).toEqual([]);
		expect(second.timeline).toEqual(file.timeline);
		expect(file.deviationNotes).toEqual([]);
	});
});

describe("newMatchFile", () => {
	it("builds a file that passes the same checks as an imported one", () => {
		const made = makeMatchFile({ seed: 8 });
		const file = newMatchFile({
			audit: made.audit,
			match: made.match,
			setup: made.setup,
			players: made.squad.players,
			timeline: made.timeline,
			endedAt: made.endedAt,
		});
		expect(file).toEqual(made);
		expect(parseMatchFile(JSON.parse(matchFileToJson(file)))).toEqual(made);
	});

	it("keeps its own copy of the timeline, the players, the rules and the notes", () => {
		const made = makeMatchFile({ seed: 8 });
		const note = {
			matchId: made.audit.matchId,
			eventId: "swap-1",
			note: "Skada",
			writtenAt: "2026-09-05T13:00:00.000Z",
		};
		const file = newMatchFile({
			...made,
			players: made.squad.players,
			deviationNotes: [note],
		});
		made.timeline.length = 0;
		made.squad.players.length = 0;
		made.setup.substitutions = { kind: "limited" } as never;
		note.note = "Ändrad";
		expect(file.timeline.length).toBeGreaterThan(0);
		expect(file.squad.players.length).toBeGreaterThan(0);
		expect(file.setup.substitutions).toEqual({ kind: "free" });
		expect(file.deviationNotes[0]?.note).toBe("Skada");
	});
});

describe("matchFileName", () => {
	it("names the file after the date and the opponent", () => {
		const file: MatchFile = makeMatchFile({ opponent: "IFK Göteborg" });
		expect(matchFileName(file)).toBe("match-2026-09-05-ifk-göteborg.json");
	});

	it("falls back to the day the file was made", () => {
		const file = makeMatchFile({ date: "", opponent: "" });
		expect(matchFileName(file)).toBe("match-2026-09-05.json");
	});
});
