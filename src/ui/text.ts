import type { DevelopmentArea } from "../core/developmentCheckpoints.js";
import type { FormationProblem, TeamSizeId } from "../core/formations.js";
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
	/** Labels for the shared cross-page nav (src/ui/page.ts). */
	nav: {
		start: "Start",
		match: "Match",
		report: "Matchrapport",
		statistics: "Statistik",
		data: "Data",
		about: "Om",
	},
	/** The Data page (#154), reached from Start and Statistik and the main menu. */
	data: {
		open: "Hämta in, spara och synka data",
	},
	/** The choice a team with data gets for another team's files or Drive folder (#154). */
	placement: {
		intro: (source: "files" | "drive", name: string) =>
			`${source === "files" ? "Filerna" : "Drive-mappen"} hör till ett annat lag${name === "" ? "" : ` ("${name}")`}, och det här laget har redan data. Inget har ändrats än.`,
		numbers: (
			source: "files" | "drive",
			c: { local: number; incoming: number; merged: number },
		) => {
			const matches = (n: number) => `${n} ${n === 1 ? "match" : "matcher"}`;
			return `Du har ${matches(c.local)}, ${source === "files" ? "filerna" : "Drive"} har ${c.incoming}, efter hopslagning ${c.merged}.`;
		},
		newTeam: "Läs in som nytt lag",
		newTeamHint:
			"Ett nytt lag skapas på den här enheten och datan hamnar där. Det här laget lämnas som det är.",
		merge: "Slå ihop med det här laget",
		mergeHint:
			"Datan slås ihop med det här laget, som får samma lagid så att senare säkerhetskopior hamnar i samma Drive-mapp.",
		confirmNote:
			"Den gamla lagmappen i Drive, om det fanns en, lämnas där den är.",
		confirm: "Slå ihop",
		cancel: "Avbryt",
	},
	/** The "Hämta in" card on the Data page (#154). */
	dataImport: {
		hint: "Välj filer eller en hel mapp. Appen ser på innehållet vad varje fil är, inte på namnet. Inget lämnar den här enheten.",
		folderHint:
			"Att välja en hel mapp fungerar i datorns webbläsare. På en telefon: välj flera filer.",
		chooseFiles: "Välj filer",
		chooseFolder: "Välj mapp",
		describe: (c: {
			matches: number;
			squads: number;
			notePlayers: number;
		}): string => {
			const parts = [
				...(c.matches > 0
					? [`${c.matches} ${c.matches === 1 ? "match" : "matcher"}`]
					: []),
				...(c.squads > 0
					? [`${c.squads} ${c.squads === 1 ? "truppfil" : "truppfiler"}`]
					: []),
				...(c.notePlayers > 0
					? [`anteckningar för ${c.notePlayers} spelare`]
					: []),
			];
			return parts.length === 0 ? "inget att läsa in" : parts.join(", ");
		},
		looseLine: (described: string) => `Filer utan lag: ${described}`,
		teamLine: (name: string, shortId: string, described: string) =>
			`Lag ${name === "" ? "utan namn" : `"${name}"`} (${shortId}): ${described}`,
		needPassword: (files: number) =>
			`${files} ${files === 1 ? "krypterad fil behöver" : "krypterade filer behöver"} lösenord.`,
		lockedTeam: (shortId: string, files: number) =>
			`Låst lag ${shortId} (${files} ${files === 1 ? "fil" : "filer"}): öppnas med ett annat lösenord.`,
		skipped: {
			tooLarge: (path: string, megabytes: number) =>
				`${path}: för stor (högst ${megabytes} MB).`,
			tooMany: (path: string) => `${path}: för många filer.`,
			notJson: (path: string) => `${path}: ingen JSON-fil.`,
			unrecognised: (path: string) =>
				`${path}: känns inte igen som en fil från MatchPlanner.`,
		},
		damaged: {
			invalidPayload: (path: string) =>
				`${path}: Filen gick att öppna men är ingen exportfil eller lagfil från appen (en säsongsrapport kan till exempel inte läsas in).`,
			wrongName: (path: string) =>
				`${path}: Filen har bytt namn eller är en kopia och hoppas över.`,
		},
		moreSkipped: (count: number) => `… och ${count} till hoppades över.`,
		passwordLabel: "Lösenord för de krypterade filerna",
		unlock: "Lås upp",
		needPasswordFirst: "Ange ett lösenord först.",
		unlocking: (done: number, total: number) =>
			`Låser upp fil ${done} av ${total} …`,
		wrongPassword:
			"Lösenordet öppnar ingen av de krypterade filerna. Kontrollera lösenordet och försök igen. Inget har ändrats.",
		teamChoiceLabel: "Lag att läsa in",
		teamChoiceHint:
			"Filerna innehåller flera lag. Välj vilket som ska läsas in nu; ett till kan läsas in i ett nytt lag efteråt.",
		unnamedTeam: (shortId: string) => `Lag utan namn (${shortId})`,
		apply: "Läs in",
		applying: "Läser in …",
		unreadable: (path: string) => `${path}: Filen gick inte att läsa.`,
		nothingNew: "Inget nytt att läsa in.",
		result: (r: {
			added: number;
			known: number;
			notesChanged: boolean;
			squadTaken: boolean;
		}): string => {
			const parts = [
				...(r.added > 0
					? [
							`${r.added} ${r.added === 1 ? "ny match" : "nya matcher"} lästes in${r.known > 0 ? `, ${r.known} fanns redan` : ""}.`,
						]
					: []),
				...(r.notesChanged ? ["Anteckningarna uppdaterades."] : []),
				...(r.squadTaken ? ["Truppen lästes in."] : []),
			];
			return parts.length === 0 ? "Inget nytt att läsa in." : parts.join(" ");
		},
		refusedBelongsToOtherLocalTeam:
			"Filerna tillhör ett annat lag på den här enheten. Byt till det laget först.",
		driveHint:
			"Det här finns nu på enheten. Koppla Google Drive nedan och tryck Säkerhetskopiera för att spara det i Drive.",
	},
	/** The secondary nav on the three statistics pages (src/ui/page.ts, #119). */
	statisticsNav: {
		overview: "Spelstatistik",
		seasonReport: "Säsongsrapport",
		notes: "Anteckningar",
	},
	/** The team switcher in the shared header (src/ui/page.ts, #118). */
	teamSwitcher: {
		label: "Lag",
		switchTeam: "Byt",
		newTeam: "Nytt lag",
		newTeamNameLabel: "Namn på det nya laget",
		create: "Skapa",
		cancel: "Avbryt",
	},
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
		policyOverride:
			"Avviker från distriktets rekommenderade policy (perioder eller minuter per period).",
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
		tooLarge: "Filen är för stor för att vara en truppfil.",
		noSquad:
			"Filen innehåller ingen trupp. Välj en truppfil eller en krypterad exportfil.",
		needPassword: "Filen är krypterad. Ange lösenordet för att hämta truppen.",
		needPasswordFirst: "Ange ett lösenord först.",
		wrongPassword:
			"Fel lösenord, eller filen har ändrats. Kontrollera lösenordet och försök igen.",
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
				case "region":
					return "Filen anger ett distrikt som appen inte känner igen.";
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
			restTime: {
				title: "Hur länge en spelare vilar",
				text: "Appen räknar hur länge varje spelare har vilat, från att hen går av tills hen går på igen, och visar det på bänken och i matchrapporten. Tränaren bestämmer själv när spelare byter; appen sätter ingen gräns för hur länge en vila ska vara.",
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
		/** How long a player rested in all, and over how many rests. */
		restSummary: (count: number, total: string) =>
			count === 1 ? total : `${total} (${count} vilor)`,
		noRest: "Ingen vila",
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
		visualizations: {
			title: "Översikt",
			monthlyMinutes: "Speltid månad för månad",
			startFrequency: (matches: number) =>
				`Startfrekvens i de senaste ${matches} ${matches === 1 ? "matchen" : "matcherna"}`,
			axisMinutes: "Minuter",
			axisPercent: "Andel starter (%)",
			chartDescription: "Samma uppgifter finns i tabellerna nedan.",
		},
		seasonReport: {
			title: "Säsongsrapport",
			description:
				"Granska sammanfattningarna innan du sparar rapporten. Den här rapporten är avsedd att delas med spelaren, familjen eller klubben - filen krypteras med ett lösenord du väljer.",
			stats: (
				squad: number,
				played: number,
				started: number,
				minutes: number,
				present: number,
				absent: number,
			) =>
				`${squad} truppmatcher · ${played} spelade · ${started} starter · ${minutes} minuter · närvaro ${present}/${present + absent}`,
			developmentLevelPrefix: (level: number, of: number) =>
				level === 0 ? "" : `Nivå ${level} av ${of} uppnådd. `,
			passwordLabel: "Lösenord för filen",
			needPassword: "Ange ett lösenord för filen först.",
			passwordTooShort: (min: number) =>
				`Lösenordet måste vara minst ${min} tecken.`,
			exportButton: "Spara säsongsrapport (krypterad)",
			printButton: "Skriv ut / spara som PDF",
		},
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
		drive: {
			signedIn: "Kopplad till Google Drive.",
			connecting: "Kopplar till Google Drive …",
			choosingFolder: "Öppnar mappväljaren …",
			chooseFolder: "Välj mapp",
			changeFolder: "Byt mapp",
			folderLabel: (name: string) => `Mapp: ${name}`,
			noFolderChosen: "Ingen mapp vald än.",
			backingUp: "Säkerhetskopierar …",
			restoring: "Läser in från Google Drive …",
			backedUp: (matches: number, stateSaved: boolean) => {
				const parts = [
					...(matches > 0
						? [
								`${matches} ${matches === 1 ? "match" : "matcher"} säkerhetskopierades.`,
							]
						: []),
					...(stateSaved ? ["Trupp och anteckningar sparades."] : []),
				];
				return parts.length === 0
					? "Allt var redan säkerhetskopierat."
					: parts.join(" ");
			},
			restored: (r: {
				downloaded: number;
				notesChanged: boolean;
				squadRestored: boolean;
				ignored: number;
			}) => {
				const news = [
					...(r.downloaded > 0
						? [
								`${r.downloaded} ${r.downloaded === 1 ? "match" : "matcher"} lästes in.`,
							]
						: []),
					...(r.notesChanged ? ["Anteckningarna uppdaterades."] : []),
					...(r.squadRestored ? ["Truppen lästes in."] : []),
				];
				const skipped =
					r.ignored > 0
						? [
								`${r.ignored} ${r.ignored === 1 ? "fil" : "filer"} i mappen hör inte till det här laget eller gick inte att läsa och hoppades över.`,
							]
						: [];
				return [
					...(news.length === 0 ? ["Inget nytt att läsa in."] : news),
					...skipped,
				].join(" ");
			},
			chooseTeam: "Mappen innehåller flera lag. Välj vilket som ska läsas in.",
			unnamedTeam: (number: number) => `Lag ${number}`,
			folderRefused: {
				belongsToOtherLocalTeam:
					"Mappen tillhör ett annat lag på den här enheten. Byt till det laget först.",
			},
			needPassword: "Ange ett lösenord för säkerhetskopian först.",
			passwordTooShort: (min: number) =>
				`Lösenordet för en ny säkerhetskopia måste vara minst ${min} tecken.`,
			markerInvalid:
				"Lagets fil i mappen är skadad eller hör inte till laget. Välj en annan mapp.",
			wrongPassword:
				"Fel lösenord, eller filen har ändrats. Kontrollera lösenordet och försök igen.",
			failed: "Det gick inte att nå Google Drive just nu. Försök igen senare.",
			signInFailed: "Inloggningen misslyckades eller avbröts.",
			folderPickerFailed: "Det gick inte att öppna mappväljaren.",
		},
		secureExport: {
			needPassword: "Ange ett lösenord först.",
			passwordTooShort: (min: number) =>
				`Lösenordet måste vara minst ${min} tecken.`,
			exported: "Allt exporterades till en krypterad fil.",
		},
		playerNotes: {
			title: "Anteckningar per spelare",
			choosePlayer: "Välj spelare",
			availabilityTitle: "Närvaro per match",
			chooseMatch: "Välj match",
			noMatchesYet: "Inga matcher med den här spelaren i truppen än.",
			matchLabel: (opponent: string, date: string) =>
				`${opponent || "Match"} (${date})`,
			statusAvailable: "Var med",
			statusAbsent: "Frånvarande",
			reason: {
				injury: "Skada",
				illness: "Sjukdom",
				other: "Annat",
			},
			notePlaceholder: "Anteckning (valfritt)",
			saveAvailability: "Spara närvaro",
			currentAvailability(
				status: "available" | "absent",
				reason: "injury" | "illness" | "other" | undefined,
			): string {
				if (status === "available") return "Sparat: var med.";
				const reasons = {
					injury: "skada",
					illness: "sjukdom",
					other: "annat",
				} as const;
				return `Sparat: frånvarande${reason ? ` (${reasons[reason]})` : ", ingen anledning angiven"}.`;
			},
			developmentTitle: "Utvecklingsanteckningar",
			area: {
				physical: "Fysiskt",
				mental: "Mentalt",
				technical: "Tekniskt",
				tactical: "Taktiskt",
			},
			developmentNotePlaceholder: "Vad har du sett?",
			addDevelopmentNote: "Lägg till anteckning",
			noNotesYet: "Inga anteckningar än.",
			developmentNote: (date: string, area: string, note: string) =>
				`${date} · ${area}: ${note}`,
			feedbackTitle: "Värt att titta på",
			unexplainedAbsences: (name: string, count: number) =>
				`${name}: ${count} ${count === 1 ? "frånvaro" : "frånvaron"} utan angiven anledning.`,
			noDevelopmentNotes: (name: string, matches: number) =>
				`${name}: ingen utvecklingsanteckning trots ${matches} matcher i truppen.`,
			checkpointTitle: "Nivåer",
			nextLevel: "Nästa nivå uppnådd",
			levelReached: (date: string) => `Uppnått ${date}`,
			maxLevelReached: "Högsta nivån uppnådd",
			undoLevel: "Ångra nivå",
			confirmUndoLevel: "Säker? Tryck igen för att ångra",
			/**
			 * The 16 age-banded checkpoint ladders (#109): one per team size and
			 * development area, each describing increasing context complexity
			 * (unopposed, then light pressure, then small-group/match-like, then
			 * full match) rather than an absolute skill bar, so a player of any
			 * age climbs it at their own pace, never compared to any other
			 * player. A MatchPlanner "decision" in policy.ts's sense: RF/SvFF's
			 * general guidance on play-first development at younger ages and
			 * match-application at older ages is background reading, never
			 * quoted as their rule - see issue #109 for the full reasoning and
			 * sources.
			 */
			checkpointLadders: {
				"5v5": {
					technical: [
						"Vågar prova grundtekniken i lekfulla övningar",
						"Klarar grundtekniken (passa, ta emot, dribbla) obehindrat",
						"Provar tekniken i lekfulla smågruppsspel",
						"Använder tekniken med glädje i matchlika lekar",
					],
					tactical: [
						"Förstår var boll och mål är på planen",
						"Provar att vara nära bollen och delta i spelet",
						"Börjar förstå enkla roller (anfalla och försvara)",
						"Provar enkla samarbeten med en kompis i smågrupp",
					],
					physical: [
						"Rör sig lekfullt med balans och koordination",
						"Orkar vara aktiv genom hela passet med lek och variation",
						"Klarar att springa, hoppa och vända i olika lekar",
						"Håller igång genom en hel match med pauser",
					],
					mental: [
						"Vågar vara med och prova utan rädsla för att göra fel",
						"Visar glädje i träning och match",
						"Provar igen efter ett misstag utan att tappa sugen",
						"Stöttar och hejar på sina lagkompisar",
					],
				},
				"7v7": {
					technical: [
						"Behärskar grundteknik (passning, mottagning, dribbling) obehindrat",
						"Använder tekniken med lätt motstånd eller tidspress",
						"Väljer rätt teknik i enkla spelsituationer",
						"Använder tekniken säkert i matchlika övningar",
					],
					tactical: [
						"Förstår sin egen roll i laget (försvar och anfall)",
						"Läser enkla spelsituationer och anpassar sig till medspelare",
						"Tar egna initiativ i smågruppsspel",
						"Bidrar till enkla lagmönster (bredd och djup)",
					],
					physical: [
						"Orkar delta aktivt genom hela träningspasset",
						"Håller jämn intensitet större delen av matchen",
						"Klarar snabba riktningsförändringar och spurter upprepade gånger",
						"Återhämtar sig mellan insatser under en match",
					],
					mental: [
						"Håller fokus genom en övning eller ett delmoment",
						"Hanterar ett misslyckande och fortsätter spela sitt spel",
						"Visar vilja att kämpa i tuffa situationer",
						"Peppar lagkompisar även när det går tungt",
					],
				},
				"9v9": {
					technical: [
						"Använder tekniken säkert med motstånd och tidspress",
						"Väljer och genomför rätt teknik i matchlika situationer",
						"Behärskar tekniken i högt tempo och pressade lägen",
						"Använder tekniken pålitligt i match, båda fötterna och olika situationer",
					],
					tactical: [
						"Läser av och anpassar sig till medspelare i grupp",
						"Fattar egna beslut i matchsituationer under tidspress",
						"Förstår och använder lagets grundprinciper (press, omställning)",
						"Hjälper till att organisera sin del av laget proaktivt",
					],
					physical: [
						"Håller samma intensitet genom hela matchen",
						"Klarar upprepade högintensiva insatser med kort återhämtning",
						"Visar god löpteknik och styrka i dueller",
						"Återhämtar sig snabbt mellan matcher och träningar",
					],
					mental: [
						"Hanterar motgång (mål emot, misslyckad aktion) och fortsätter spela sitt spel",
						"Tar ansvar i pressade matchsituationer",
						"Visar självständighet och eget ansvarstagande i träning",
						"Stöttar och peppar lagkamrater i pressade stunder",
					],
				},
				"11v11": {
					technical: [
						"Använder tekniken säkert i match, även i pressade lägen",
						"Anpassar tekniken efter matchsituation och motståndare",
						"Behärskar tekniken i sin position på hög nivå för åldern",
						"Är en pålitlig teknisk resurs för laget i alla lägen",
					],
					tactical: [
						"Tar egna initiativ och fattar snabba beslut i match",
						"Hjälper till att organisera laget och positionera sig proaktivt",
						"Anpassar sig till olika taktiska upplägg",
						"Tar ledarskap i taktiska beslut på planen",
					],
					physical: [
						"Håller hög intensitet konsekvent genom hela matchen",
						"Återhämtar sig snabbt mellan insatser och matcher",
						"Klarar en hel säsongs belastning utan att tappa i kvalitet",
						"Visar fysisk mognad anpassad efter egen förutsättning",
					],
					mental: [
						"Visar lugn och fattar bra beslut under press",
						"Tar ansvar och ledarskap i pressade stunder",
						"Stöttar och utvecklar yngre eller mindre erfarna lagkompisar",
						"Är en mental förebild för laget i med- och motgång",
					],
				},
			} satisfies Record<
				TeamSizeId,
				Record<DevelopmentArea, readonly string[]>
			>,
		},
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

	rest: {
		resting: (time: string) => `vilar ${time}`,
		title: "Vila",
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
