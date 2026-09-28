import type { FormationProblem } from "../core/formations.js";
import type { SchedulingProblem } from "../core/scheduler.js";
import type { SquadFileProblem } from "../core/storage.js";

/**
 * Every text the app writes from code, in Swedish. Core modules return
 * problem codes and data; this is the only place that turns them into
 * sentences. Static labels stay in index.html, which is the page template.
 */
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
				case "notObject":
				case "schemaVersion":
				case "playersNotList":
					return TEXT.squadFile.unreadable;
			}
		},
	},

	match: {
		formatLabel: (format: string, minutes: number) =>
			`${format}, byte var ${minutes} min`,
		fairness: (spread: string) => `Skillnad i speltid ${spread}`,
		swapDue: "Dags att byta!",
		timeLeft: (time: string) => `${time} kvar till nästa byte`,
		startClock: "Starta klockan",
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

		// Next swap
		comingIn: "In på planen",
		noneComingIn: "Ingen ny",
		goingOut: "Ut till bänken",
		noneGoingOut: "Ingen går ut",
		showFullLineup: "Visa hela nya laget",
		benchLine: "Bänk",
		comingInHint: " (kommer in)",
		comingInLegend: "Gula namn kommer in från bänken.",

		// Pitch, bench and playtime
		zoneName(zoneId: string): string {
			const names: Record<string, string> = {
				back: "Back",
				dmid: "Defensivt mittfält",
				mid: "Mittfält",
				amid: "Offensivt mittfält",
				fwd: "Anfall",
			};
			return names[zoneId] ?? zoneId;
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
		reset: "Nollställ matchen",
		confirmReset: "Tryck igen för att nollställa",
	},
} as const;
