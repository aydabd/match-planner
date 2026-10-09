import { LIMITS } from "../core/limits.js";
import { formatTime } from "../core/match.js";
import { matchFileName, matchFileToJson } from "../core/matchFile.js";
import type { StoredReport } from "../core/report.js";
import { loadMatchFiles } from "./matchFileStorage.js";
import { loadReports } from "./reportStorage.js";
import {
	reportAsText,
	reportDetails,
	restSummary,
	zoneBreakdown,
} from "./reportText.js";
import { deviceTeamRecords } from "./teamRecords.js";
import { activeTeamId } from "./teamStorage.js";
import { TEXT } from "./text.js";

function byId(id: string): HTMLElement {
	const node = document.getElementById(id);
	if (!node) throw new Error(`Missing element #${id}`);
	return node;
}

function cell(tag: "th" | "td", text: string, scope?: "col" | "row") {
	const node = document.createElement(tag);
	node.textContent = text;
	if (scope) node.scope = scope;
	return node;
}

function table(
	target: HTMLElement,
	headers: readonly string[],
	rows: readonly (readonly string[])[],
	rowClass?: (index: number) => string,
): void {
	target.replaceChildren();
	const head = target.appendChild(document.createElement("thead"));
	const headRow = head.appendChild(document.createElement("tr"));
	for (const header of headers) headRow.append(cell("th", header, "col"));
	const body = target.appendChild(document.createElement("tbody"));
	rows.forEach((values, index) => {
		const row = body.appendChild(document.createElement("tr"));
		const cls = rowClass?.(index);
		if (cls) row.className = cls;
		values.forEach((text, i) => {
			row.append(i === 0 ? cell("th", text, "row") : cell("td", text));
		});
	});
}

export interface ReportView {
	/** Fill the report screen from a report (the caller shows the screen). */
	show: (stored: StoredReport) => void;
}

export interface ReportList {
	/** Rebuild the list of kept reports on the setup screen. */
	refreshList: () => void;
}

/**
 * The list of kept reports on the setup screen: its own factory, so Start
 * can offer it without pulling in the full report display (and the DOM it
 * requires) that only the standalone /report/ page needs.
 */
export function createReportList(callbacks: {
	onOpen: (stored: StoredReport) => void;
}): ReportList {
	function refreshList(): void {
		const reports = loadReports();
		const section = byId("reportsSection");
		section.hidden = reports.length === 0;
		const list = byId("reportList");
		list.replaceChildren();
		for (const stored of reports) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "btn btn-secondary";
			const when = (stored.match.date || stored.savedAt).slice(0, 10);
			button.textContent = TEXT.report.listItem(
				when,
				stored.match.opponent || TEXT.report.unnamedMatch,
			);
			button.addEventListener("click", () => callbacks.onOpen(stored));
			list.append(button);
		}
	}

	return { refreshList };
}

/**
 * The match report screen: shows one report and lets the coach copy or
 * save it. Every number comes from the report; nothing is calculated here.
 */
export function createReportView(): ReportView {
	let shown: StoredReport | null = null;
	const status = byId("reportShareStatus");

	function show(stored: StoredReport): void {
		shown = stored;
		status.textContent = "";
		(byId("matchFileSaveBtn") as HTMLButtonElement).disabled =
			!loadMatchFiles().some((f) => f.audit.matchId === stored.matchId);
		const { report } = stored;
		const nameOf = (id: string) =>
			report.players.find((p) => p.id === id)?.name ?? id;

		byId("reportSubtitle").textContent = TEXT.report.subtitle(
			reportDetails(stored),
		);

		const feedback = byId("reportFeedback");
		feedback.replaceChildren();
		for (const item of report.feedback) {
			const li = document.createElement("li");
			li.textContent = TEXT.report.feedback(item, nameOf);
			feedback.append(li);
		}

		byId("reportPlaytimeSummary").textContent = TEXT.report.playtimeSummary(
			formatTime(report.playtime.averageSeconds),
			formatTime(report.playtime.spreadSeconds),
		);
		table(
			byId("reportPlaytime"),
			[
				"Spelare",
				"Totalt",
				...Array.from({ length: report.periods }, (_, i) =>
					TEXT.report.periodColumn(i + 1),
				),
				"Fördelning",
				"Vila",
			],
			report.players.map((p) => [
				[p.name, TEXT.report.status(p.status)].filter(Boolean).join(" · "),
				formatTime(p.totalSeconds),
				...Array.from({ length: report.periods }, (_, i) =>
					formatTime(p.periodSeconds[i] ?? 0),
				),
				zoneBreakdown(p.zoneSeconds),
				restSummary(p.rests),
			]),
		);

		const { swapSummary } = report;
		byId("reportSwapSummary").textContent =
			swapSummary.count === 0
				? TEXT.report.noSwaps
				: TEXT.report.swapSummary(
						swapSummary.count,
						swapSummary.averageDelaySeconds,
						swapSummary.maxDelaySeconds,
						swapSummary.lateCount,
						swapSummary.veryLateCount,
					);
		table(
			byId("reportSwaps"),
			[
				"Byte",
				"Period",
				"Planerat",
				"Gjort",
				"Avvikelse",
				"Vilat före byte",
				"",
			],
			report.swaps.map((s) => [
				TEXT.match.substitution(s.inName, s.outName),
				String(s.period),
				formatTime(s.plannedAt),
				formatTime(s.at),
				TEXT.report.delay(s.delaySeconds),
				s.inRestedSeconds === null
					? "–"
					: `${s.inName}: ${formatTime(s.inRestedSeconds)}`,
				TEXT.report.lateFlag(s.delaySeconds),
			]),
			(i) =>
				TEXT.report.lateFlag(report.swaps[i]?.delaySeconds ?? 0)
					? "is-late"
					: "",
		);
		showDeviations(stored);
	}

	/**
	 * Swaps that went past the match's substitution rules (#171), each with
	 * a field for the coach's explanation. The explanation is kept with the
	 * match file, keyed by the swap's id, so it travels with exports and
	 * Drive backups; the report itself is not changed.
	 */
	function showDeviations(stored: StoredReport): void {
		const { deviations, rules } = stored.report.substitutions;
		const nameOf = (id: string) =>
			stored.report.players.find((p) => p.id === id)?.name ?? id;
		byId("reportDeviationsSection").hidden = deviations.length === 0;
		byId("reportDeviationsSummary").textContent = TEXT.report.deviationsSummary(
			rules,
			deviations.length,
		);
		const notes =
			loadMatchFiles().find((f) => f.audit.matchId === stored.matchId)
				?.deviationNotes ?? [];
		const list = byId("reportDeviations");
		list.replaceChildren(
			...deviations.map((d) => {
				const item = document.createElement("li");
				item.className = "report-deviation";
				const what = document.createElement("p");
				what.textContent = TEXT.report.deviation(
					d.at,
					d.period,
					nameOf(d.inId),
					nameOf(d.outId),
					d.rules,
				);
				const area = document.createElement("textarea");
				area.id = `deviationNote-${d.eventId}`;
				area.maxLength = LIMITS.deviationNoteLength;
				area.rows = 2;
				area.value = notes.find((n) => n.eventId === d.eventId)?.note ?? "";
				const label = document.createElement("label");
				label.className = "field-label";
				label.htmlFor = area.id;
				label.textContent = TEXT.report.deviationNoteLabel(
					nameOf(d.inId),
					nameOf(d.outId),
				);
				const save = document.createElement("button");
				save.type = "button";
				save.className = "btn btn-secondary";
				save.textContent = TEXT.report.saveDeviationNote;
				const message = document.createElement("p");
				message.className = "hint";
				message.setAttribute("role", "status");
				save.addEventListener("click", async () => {
					const note = area.value.trim();
					if (note === "") {
						message.textContent = TEXT.report.deviationNoteEmpty;
						return;
					}
					const saved = await deviceTeamRecords.saveDeviationNote(
						activeTeamId(),
						{
							matchId: stored.matchId,
							eventId: d.eventId,
							note,
							writtenAt: new Date().toISOString(),
						},
					);
					message.textContent = saved
						? TEXT.report.deviationNoteSaved
						: TEXT.report.deviationNoteNotKept;
				});
				const fieldEl = document.createElement("div");
				fieldEl.className = "field";
				fieldEl.append(label, area);
				item.append(what, fieldEl, save, message);
				return item;
			}),
		);
	}

	byId("reportCopyBtn").addEventListener("click", async () => {
		if (!shown) return;
		try {
			await navigator.clipboard.writeText(reportAsText(shown));
			status.textContent = TEXT.report.copied;
		} catch {
			status.textContent = TEXT.report.copyFailed;
		}
	});

	function download(fileName: string, json: string): void {
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = fileName;
		a.click();
		URL.revokeObjectURL(url);
	}

	byId("reportSaveBtn").addEventListener("click", () => {
		if (!shown) return;
		download(
			`matchrapport-${shown.match.date.slice(0, 10) || shown.savedAt.slice(0, 10)}.json`,
			JSON.stringify(shown, null, 2),
		);
	});

	// The match file for the shown report, if this device still keeps it.
	byId("matchFileSaveBtn").addEventListener("click", () => {
		const file = loadMatchFiles().find(
			(f) => f.audit.matchId === shown?.matchId,
		);
		if (file) download(matchFileName(file), matchFileToJson(file));
	});

	return { show };
}
