import { formatTime } from "../core/match.js";
import type { StoredReport } from "../core/report.js";
import { loadReports } from "./reportStorage.js";
import { reportAsText, reportDetails, zoneBreakdown } from "./reportText.js";
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
	/** Rebuild the list of kept reports on the setup screen. */
	refreshList: () => void;
}

/**
 * The match report screen and the list of kept reports on the setup screen.
 * Every number comes from the report; nothing is calculated here.
 */
export function createReportView(callbacks: {
	onOpen: (stored: StoredReport) => void;
}): ReportView {
	let shown: StoredReport | null = null;
	const status = byId("reportShareStatus");

	function show(stored: StoredReport): void {
		shown = stored;
		status.textContent = "";
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
			],
			report.players.map((p) => [
				[p.name, TEXT.report.status(p.status)].filter(Boolean).join(" · "),
				formatTime(p.totalSeconds),
				...Array.from({ length: report.periods }, (_, i) =>
					formatTime(p.periodSeconds[i] ?? 0),
				),
				zoneBreakdown(p.zoneSeconds),
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
			["Byte", "Period", "Planerat", "Gjort", "Avvikelse", ""],
			report.swaps.map((s) => [
				TEXT.match.substitution(s.inName, s.outName),
				String(s.period),
				formatTime(s.plannedAt),
				formatTime(s.at),
				TEXT.report.delay(s.delaySeconds),
				TEXT.report.lateFlag(s.delaySeconds),
			]),
			(i) =>
				TEXT.report.lateFlag(report.swaps[i]?.delaySeconds ?? 0)
					? "is-late"
					: "",
		);
	}

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

	byId("reportCopyBtn").addEventListener("click", async () => {
		if (!shown) return;
		try {
			await navigator.clipboard.writeText(reportAsText(shown));
			status.textContent = TEXT.report.copied;
		} catch {
			status.textContent = TEXT.report.copyFailed;
		}
	});

	byId("reportSaveBtn").addEventListener("click", () => {
		if (!shown) return;
		const blob = new Blob([JSON.stringify(shown, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `matchrapport-${shown.match.date.slice(0, 10) || shown.savedAt.slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	});

	return { show, refreshList };
}
