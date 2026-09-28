import type { FormationProblem } from "../core/formations.js";
import { LIMITS } from "../core/limits.js";
import type { MatchFileProblem } from "../core/matchFile.js";
import { POLICY, type RuleId } from "../core/policy.js";
import type { Feedback, PlayerStatus } from "../core/report.js";
import type { SchedulingProblem } from "../core/scheduler.js";
import type { SquadFileProblem } from "../core/storage.js";

/** Zone names by zone id (see ZoneConfig.id); built once, read on every render. */
const ZONE_NAMES: Readonly<Record<string, string>> = {
	back: "Back",
	dmid: "Defensivt mittfält",
	mid: "Mittfält",
	amid: "Offensivt mittfält",
	fwd: "Anfall",
};

/**
 * Every text the app writes from code, in Swedish. Core modules return
 * problem codes and data; this is the only place that turns them into
 * sentences. Static labels stay in index.html, which is the page template.
 */
/** Seconds in plain words: "45 sekunder", "4 minuter", "4 min 20 s". */
function words(seconds: number): string {
	const total = Math.round(Math.abs(seconds));
	if (total < 60) return `${total} ${total === 1 ? "sekund" : "sekunder"}`;
	const minutes = Math.floor(total / 60);
	const rest = total % 60;
	if (rest === 0) return `${minutes} ${minutes === 1 ? "minut" : "minuter"}`;
	return `${minutes} min ${rest} s`;
}

/** "45 sekunder sen", "10 sekunder tidig", "i tid". */
function delay(seconds: number): string {
	if (Math.round(seconds) === 0) return "i tid";
	return `${words(seconds)} ${seconds > 0 ? "sen" : "tidig"}`;
}

export const TEXT = {
	setup: {
		emptySquad: "Inga spelare än. Lägg till dem som är med idag.",
		playerNameLabel: (position: number) => `Namn, spelare ${position}`,
		removePlayer: (name: string) => `Ta bort ${name}`,
		squadCount: (players: number, need: number) =>
			`${players} av minst ${need}`,
		squadFull: (max: number) => `Truppen är full (högst ${max} spelare).`,
		startNeedsFormation: "Välj en giltig formation för att starta",
		startNeedsPlayers: (missing: number) =>
			`Lägg till ${missing} spelare till för att starta`,
		start: (players: number) => `Starta match med ${players} spelare`,
		keeperToggle: "Målvakt",
		keeperToggleLabel: (name: string) => `Målvakt: ${name}`,
		confirmStartOver: "Tryck igen för att tömma truppen",
		confirmClearAll: "Tryck igen för att rensa allt",
	},

	formation: {
		custom: "Egen",
		prompt: (outfield: number) =>
			`Skriv hur ${outfield} utespelare står, från back till anfall.`,
		valid: (formation: string, lines: number) => `${formation}: ${lines} led.`,
		problem(problem: FormationProblem): string {
			switch (problem.code) {
				case "notNumbers":
					return "Skriv formationen som siffror med bindestreck, till exempel 2-3-1.";
				case "lineCount":
					return `En formation har ${problem.min} till ${problem.max} led.`;
				case "emptyLine":
					return "Varje led behöver minst en spelare.";
				case "playerCount":
					return `Formationen har ${problem.got} utespelare, men ${problem.size} behöver ${problem.need}.`;
			}
		},
	},

	squadFile: {
		unreadable:
			"Filen kunde inte läsas. Välj en fil som sparats från MatchPlanner.",
		problem(problem: SquadFileProblem): string {
			switch (problem.code) {
				case "unknownFormat":
					return "Filen har en lagstorlek eller formation som appen inte känner igen.";
				case "emptySquad":
					return "Filen innehåller inga spelare.";
				case "tooManyPlayers":
					return `Filen har fler än ${problem.max} spelare.`;
				case "invalidPlayer":
					return `Spelare ${problem.position} i filen saknar namn eller id.`;
				case "duplicateId":
					return "Filen har samma spelare två gånger.";
				case "rotation":
					return "Filen har ett ogiltigt antal minuter mellan byten.";
				case "periods":
					return "Filen har ett ogiltigt antal perioder eller en ogiltig periodlängd.";
				case "matchDetails":
					return "Filen har ogiltiga matchuppgifter (motståndare, plats, datum eller avsparkstid).";
				case "startingKeeper":
					return "Filen anger en startande målvakt som inte är markerad som målvakt i truppen.";
				case "audit":
					return "Filen har ogiltiga uppgifter om vem som sparade den och när.";
				case "notObject":
				case "schemaVersion":
				case "playersNotList":
					return TEXT.squadFile.unreadable;
			}
		},
	},

	policy: {
		fromPolicy: "Från riktlinjer",
		ownDecision: "MatchPlanners eget val",
		quote: "Citat ur dokumentet",
		checked: (date: string, version: string) =>
			`Kontrollerat ${date} mot: ${version}.`,
		sources: "Läs mer",
		sourcesTitle: "Dokument och länkar",
		offline: "Sidan fungerar utan nät. Länkarna öppnas när du är uppkopplad.",
		rules: {
			participation: {
				title: "Alla ska vara med",
				text: "Alla barn ska få ett allsidigt och lekfullt idrottande. Därför får alla i truppen spela, och appen strävar efter så lika speltid som möjligt.",
			},
			versatility: {
				title: "Allsidighet och variation",
				text: "Riktlinjerna vill ha allsidighet och variation. Därför byter spelare plats i laget istället för att fastna på en position.",
			},
			matchFormats: {
				title: "Spelform efter ålder",
				text: `5 mot 5 för ${POLICY.formats["5v5"].ages.join("–")} år, 7 mot 7 för ${POLICY.formats["7v7"].ages.join("–")} år, 9 mot 9 för ${POLICY.formats["9v9"].ages.join("–")} år och 11 mot 11 från ${POLICY.formats["11v11"].ages[0]} år. Lagstorlekarna i appen följer detta. Skånebollen skriver att de nationella spelformerna gäller i Skåne från säsongen 2026.`,
			},
			matchLengths: {
				title: "Matchtid i seriespel",
				text: `SvFF anger ${POLICY.formats["5v5"].periods} x ${POLICY.formats["5v5"].periodMinutes} minuter i 5 mot 5, ${POLICY.formats["7v7"].periods} x ${POLICY.formats["7v7"].periodMinutes} i 7 mot 7, ${POLICY.formats["9v9"].periods} x ${POLICY.formats["9v9"].periodMinutes} i 9 mot 9 och ${POLICY.formats["11v11"].periods} x ${POLICY.formats["11v11"].periodMinutes} minuter för 15-åringar i 11 mot 11 (2 x 45 från 16 år). Vid sammandrag är tiden kortare i 5 mot 5 och 7 mot 7. Appen börjar med tiden för en enskild match i serien. Cuper har ofta egna regler, till exempel två gånger 12 minuter: ändra då Perioder och Minuter per period själv.`,
			},
			freeSubstitutions: {
				title: "Fria byten",
				text: "Alla spelformer i barn- och ungdomsfotboll har fria byten. Därför kan du byta en spelare i taget, när det passar, och appen visar bara vem som ska in och ut.",
			},
			equalPlaytime: {
				title: "Så lika speltid som möjligt",
				text: "Vem som vilar väljs utifrån hur mycket varje spelare har spelat hittills. Det är ett eget val som bygger på tanken att alla ska få vara med, inte ett krav i något dokument.",
			},
			twoLines: {
				title: `Högst ${POLICY.maxZonesPerPlayer} led per spelare`,
				text: `En spelare står i högst ${POLICY.maxZonesPerPlayer} olika led under en match, så att det blir variation utan att någon flyttas runt hela tiden. Det här är ett eget val; inget dokument anger antalet.`,
			},
			neighbouringLines: {
				title: "Bara angränsande led",
				text: "En spelare flyttas aldrig direkt mellan försvar och anfall. Det är ett eget val för att laget ska kännas tryggt för barnen.",
			},
			swapTiming: {
				title: "Byten och tid",
				text: `Tiden mellan byten väljer du själv. Appen varnar ${LIMITS.headsUpSeconds} sekunder före ett byte, och markerar byten som blir ${POLICY.lateSwapSeconds} respektive ${POLICY.veryLateSwapSeconds} sekunder sena i matchrapporten. Det är MatchPlanners egna gränser.`,
			},
		} satisfies Record<RuleId, { title: string; text: string }>,
	},

	report: {
		subtitle: (parts: readonly string[]) => parts.join(" · "),
		unnamedMatch: "Match",
		listItem: (when: string, opponent: string) => `${when} · ${opponent}`,
		periodColumn: (period: number) => `Period ${period}`,
		status(status: PlayerStatus): string {
			switch (status) {
				case "played":
					return "";
				case "outForMatch":
					return "Ute resten av matchen";
				case "lateArrival":
					return "Kom sent";
			}
		},
		playtimeSummary: (average: string, spread: string) =>
			`Snitt ${average}, skillnad mellan mest och minst ${spread}. Räknat på de som kunde spela hela matchen.`,
		noSwaps: "Inga byten gjordes.",
		swapSummary: (
			count: number,
			average: number,
			max: number,
			late: number,
			veryLate: number,
		) =>
			`${count} byten. I snitt ${delay(average)}, längst ${delay(max)}. ${late} över ${POLICY.lateSwapSeconds} s och ${veryLate} över ${POLICY.veryLateSwapSeconds} s sena.`,
		delay,
		lateFlag(delaySeconds: number): string {
			if (delaySeconds > POLICY.veryLateSwapSeconds) return "Mycket sen";
			if (delaySeconds > POLICY.lateSwapSeconds) return "Sen";
			return "";
		},
		feedback(item: Feedback, nameOf: (id: string) => string): string {
			switch (item.code) {
				case "noSwaps":
					return "Inga byten gjordes under matchen.";
				case "swapsOnTime":
					return "Byten gjordes i tid.";
				case "swapsLate":
					return item.period === null
						? `Byten var i snitt ${words(item.averageSeconds)} sena.`
						: `Byten var i snitt ${words(item.averageSeconds)} sena i period ${item.period}.`;
				case "evenPlaytime":
					return `Speltiden var jämn: skillnaden mellan mest och minst var ${words(item.spreadSeconds)}.`;
				case "playerBelowAverage":
					return `${nameOf(item.playerId)} spelade ${words(item.belowSeconds)} mindre än lagets snitt.`;
			}
		},
		copy: "Kopiera som text",
		copied: "Rapporten är kopierad.",
		copyFailed: "Det gick inte att kopiera. Spara som fil istället.",
		textReport(lines: {
			title: string;
			details: readonly string[];
			feedback: readonly string[];
			players: readonly string[];
			swaps: readonly string[];
		}): string {
			return [
				lines.title,
				...lines.details,
				"",
				"Sammanfattning",
				...lines.feedback.map((line) => `- ${line}`),
				"",
				"Speltid",
				...lines.players,
				"",
				"Byten",
				...(lines.swaps.length === 0 ? [TEXT.report.noSwaps] : lines.swaps),
			].join("\n");
		},
	},

	history: {
		empty: "Inga matcher än. Spela en match eller läs in matchfiler.",
		importResult: (fresh: number, known: number) =>
			`${fresh} ${fresh === 1 ? "ny match" : "nya matcher"} lästes in${known > 0 ? `, ${known} fanns redan` : ""}.`,
		refused: (fileName: string, reason: string) => `${fileName}: ${reason}`,
		unreadable: "Filen kunde inte läsas. Välj en matchfil från MatchPlanner.",
		matchesCount: (matches: number, months: number) =>
			`${matches} ${matches === 1 ? "match" : "matcher"} över ${months} ${months === 1 ? "månad" : "månader"}.`,
		recent: (started: number, of: number) => `${started} av ${of}`,
		minutes: (seconds: number) => `${Math.round(seconds / 60)} min`,
		startedHint: (name: string, started: number, of: number) =>
			`${name} har startat ${started} av de senaste ${of} matcherna.`,
		month(month: string): string {
			const [year = "", number = "1"] = month.split("-");
			const names = [
				"januari",
				"februari",
				"mars",
				"april",
				"maj",
				"juni",
				"juli",
				"augusti",
				"september",
				"oktober",
				"november",
				"december",
			];
			return `${names[Number(number) - 1] ?? month} ${year}`;
		},
		saveMatchFile: "Spara matchfil",
		problem(problem: MatchFileProblem): string {
			switch (problem.code) {
				case "notObject":
				case "schemaVersion":
					return TEXT.history.unreadable;
				case "audit":
					return "Filen saknar giltigt match-id eller uppgifter om vem som sparade den och när.";
				case "matchDetails":
					return "Filen har ogiltiga matchuppgifter (motståndare, plats eller datum).";
				case "setup":
					return "Filen har ogiltiga matchinställningar (format, perioder eller tider).";
				case "squad":
					return "Filen har en ogiltig trupp.";
				case "startingIds":
					return "Filens startande spelare stämmer inte med första laguppställningen.";
				case "noKickoff":
					return "Matchen i filen har ingen startuppställning.";
				case "endedAt":
					return "Filens sluttid ligger utanför matchen.";
				case "timelineNotList":
					return "Filens tidslinje är ogiltig.";
				case "tooManyEvents":
					return `Filens tidslinje har fler än ${problem.max} händelser.`;
				case "event": {
					const reasons = {
						unknown: "okänd händelse",
						time: "ogiltig tid",
						order: "tiden går bakåt",
						period: "perioden stämmer inte",
						player: "spelaren finns inte i truppen",
						lineup: "laguppställningen stämmer inte",
					} as const;
					return `Händelse ${problem.position} i tidslinjen är ogiltig: ${reasons[problem.reason]}.`;
				}
			}
		},
	},

	match: {
		caughtUp: (time: string) =>
			`Klockan fortsatte medan sidan var borta och har räknat in ${time}.`,
		confirmEnd: "Tryck igen för att avsluta",
		formatLabel: (format: string, minutes: number) =>
			`${format}, byte var ${minutes} min`,
		fairness: (spread: string) => `Skillnad i speltid ${spread}`,
		swapDue: (late: string, isLate: boolean) =>
			isLate ? `Dags att byta! ${late} sen` : "Dags att byta!",
		periodOf: (period: number, periods: number) =>
			`Period ${period} av ${periods}`,
		periodLeft: (time: string) => `${time} kvar av perioden`,
		periodOver: (period: number) => `Period ${period} är slut.`,
		matchOver: "Matchen är slut.",
		startPeriod: (period: number) => `Starta period ${period}`,
		kickoff: "Starta matchen",
		timeLeft: (time: string) => `${time} kvar till nästa byte`,
		continueClock: "Fortsätt",
		cannotPlanNextSwap: "Kunde inte beräkna nästa byte.",
		schedulingProblem(problem: SchedulingProblem): string {
			switch (problem.code) {
				case "tooFewPlayers":
					return `För få tillgängliga spelare (${problem.available}). Laget behöver minst ${problem.need}.`;
				case "cannotFillLineup":
					return "Kan inte ställa upp laget rättvist just nu - för få spelare kan spela de platser som är kvar utan att byta mellan icke-angränsande zoner. Justera truppen eller gör ett manuellt byte.";
				case "unknownPlayer":
				case "unknownZone":
					return TEXT.match.cannotPlanNextSwap;
			}
		},

		// Swap warning and one-by-one substitutions
		swapIn: (time: string) => `Byte om ${time}`,
		swapNow: "Dags att byta, en i taget eller alla på en gång",
		substitution: (inName: string, outName: string) =>
			`${inName} in för ${outName}`,
		moves: (name: string, zone: string) => `${name} flyttar till ${zone}`,
		done: "Klart",
		doneLabel: (inName: string, outName: string) =>
			`Klart: ${inName} in för ${outName}`,
		sameTeam: "Samma lag fortsätter.",
		swapAnnouncement: (substitutions: readonly string[]) =>
			substitutions.length === 0
				? "Byte snart. Samma lag fortsätter."
				: `Byte snart: ${substitutions.join(", ")}.`,

		// Next swap
		comingIn: "In på planen",
		noneComingIn: "Ingen ny",
		goingOut: "Ut till bänken",
		noneGoingOut: "Ingen går ut",
		showFullLineup: "Visa hela nya laget",
		benchLine: "Bänk",
		comingInHint: " (kommer in)",
		comingInLegend: "Gula namn kommer in från bänken.",

		// Goalkeeper
		keeperLine: "Målvakt",
		inGoal: "i mål",
		keeperInGoal: (name: string) => `${name} står i mål. Vem ska ta över?`,
		goalkeeperOption: (name: string) => `${name} (målvakt)`,
		keeperChangeBlocked: (name: string) =>
			`${name} kan inte gå i mål just nu: ingen på bänken får ta hens plats på planen. Välj någon annan eller vänta till nästa byte.`,

		// Pitch, bench and playtime
		zoneName(zoneId: string): string {
			return ZONE_NAMES[zoneId] ?? zoneId;
		},
		emptyBench: "Ingen på bänken just nu.",
		onPitch: "på planen",
		backIn: (time: string) => `tillbaka om ${time}`,

		// Swap panel
		selected: " är vald. Tryck på en bänkspelare som ska in, eller:",
		goesInFor: " går in för ",
		howLong: ". Hur länge?",
		outForMatch: "Ute resten av matchen",
		untilNextSwap: "Till nästa byte",
		minutes: (minutes: number) => `${minutes} min`,
		cancel: "Avbryt",

		// Out of the match
		notPlayingToday: (name: string) => `${name} spelar inte mer idag`,
		backInSquad: "Tillbaka i truppen",

		// Menu
		lateArrivalHelp: "Spelaren hamnar på bänken och kommer med i nästa byte.",
		lateArrivalLabel: "Namn på spelaren som kom sent",
		lateArrivalPlaceholder: "Namn på spelaren som just kom",
		add: "Lägg till",
		confirmReset: "Tryck igen för att nollställa",
	},
} as const;
