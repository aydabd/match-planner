import type { SeasonHistory } from "../core/history.js";
import { LIMITS } from "../core/limits.js";
import type { DevelopmentArea } from "../core/playerNotes.js";
import { buildSeasonReport, type SeasonReport } from "../core/seasonReport.js";
import { encryptJson, securePackageToJson } from "../core/securePackage.js";
import { byId, card, downloadJson, field } from "./domHelpers.js";
import { loadSeasonData } from "./historyData.js";
import { loadPlayerNotes } from "./playerNotesStorage.js";
import { TEXT } from "./text.js";

function buildSeasonReportCard(
	history: SeasonHistory,
	levelCounts: Record<DevelopmentArea, number>,
): HTMLElement {
	const t = TEXT.history.seasonReport;
	const section = card(t.title);
	section.classList.add("season-report-card");
	const description = document.createElement("p");
	description.className = "hint";
	description.textContent = t.description;
	section.append(description);

	const report = buildSeasonReport(
		history,
		loadPlayerNotes(),
		new Date().toISOString(),
		levelCounts,
	);
	const summaryInputs = new Map<
		string,
		Map<DevelopmentArea, HTMLTextAreaElement>
	>();
	for (const player of report.players) {
		const playerSection = document.createElement("section");
		playerSection.className = "season-report-player";
		const heading = document.createElement("h3");
		heading.textContent = player.name;
		playerSection.append(heading);
		const stats = document.createElement("p");
		stats.className = "hint";
		stats.textContent = t.stats(
			player.matches.squad,
			player.matches.played,
			player.matches.started,
			Math.round(player.playtimeSeconds.total / 60),
			player.availability.present,
			player.availability.absent,
		);
		playerSection.append(stats);

		const levelByArea = new Map(
			player.developmentLevels.map((entry) => [entry.area, entry]),
		);
		const inputs = new Map<DevelopmentArea, HTMLTextAreaElement>();
		for (const summary of player.developmentSummary) {
			const textarea = document.createElement("textarea");
			textarea.rows = 2;
			const level = levelByArea.get(summary.area);
			textarea.value =
				(level ? t.developmentLevelPrefix(level.level, level.of) : "") +
				summary.summary;
			textarea.maxLength = LIMITS.playerNoteLength;
			playerSection.append(
				field(
					TEXT.history.playerNotes.area[summary.area],
					textarea,
					`season-${player.key}-${summary.area}`,
				),
			);
			inputs.set(summary.area, textarea);
		}
		summaryInputs.set(player.key, inputs);
		section.append(playerSection);
	}

	const passwordInput = document.createElement("input");
	passwordInput.type = "password";
	passwordInput.autocomplete = "off";
	section.append(field(t.passwordLabel, passwordInput, "seasonReportPassword"));

	const status = document.createElement("p");
	status.className = "hint";
	status.setAttribute("role", "status");
	section.append(status);

	const actions = document.createElement("div");
	actions.className = "row-buttons";
	const exportButton = document.createElement("button");
	exportButton.type = "button";
	exportButton.className = "btn btn-secondary";
	exportButton.textContent = t.exportButton;
	exportButton.addEventListener("click", async () => {
		if (passwordInput.value === "") {
			status.textContent = t.needPassword;
			return;
		}
		const reviewed: SeasonReport = {
			...report,
			players: report.players.map((player) => ({
				...player,
				developmentSummary: player.developmentSummary.map((summary) => ({
					...summary,
					summary:
						summaryInputs.get(player.key)?.get(summary.area)?.value.trim() ??
						summary.summary,
				})),
			})),
		};
		const pkg = await encryptJson(passwordInput.value, reviewed);
		downloadJson(
			`sasongsrapport-${report.generatedAt.slice(0, 10)}.json`,
			securePackageToJson(pkg),
		);
		status.textContent = "";
	});
	actions.append(exportButton);

	const printButton = document.createElement("button");
	printButton.type = "button";
	printButton.className = "btn btn-secondary";
	printButton.textContent = t.printButton;
	printButton.addEventListener("click", () => {
		document.body.classList.add("printing-season-report");
		window.print();
		window.setTimeout(
			() => document.body.classList.remove("printing-season-report"),
			0,
		);
	});
	actions.append(printButton);
	section.append(actions);
	return section;
}

/**
 * The season report page (#119): the Säsongsrapport card on its own URL, so
 * building the end-of-season report is not buried under the raw tables.
 */
export function createSeasonReportView(): { refresh: () => void } {
	async function refresh(): Promise<void> {
		const { history, levelCounts } = await loadSeasonData();
		byId("historyCount").textContent =
			history.matches === 0 ? TEXT.history.empty : "";
		const results = byId("historyResults");
		results.replaceChildren();
		if (history.matches === 0) return;
		results.append(buildSeasonReportCard(history, levelCounts));
	}
	return { refresh };
}
