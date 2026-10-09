import type { PlayerHistory, SeasonHistory } from "../core/history.js";
import { LIMITS } from "../core/limits.js";
import { standing } from "../core/standing.js";
import {
	monthlyMinutes,
	recentStartFrequency,
} from "../core/visualizations.js";
import { byId, card, table } from "./domHelpers.js";
import { loadDraft } from "./draftStorage.js";
import { loadSeasonData } from "./historyData.js";
import { lineName } from "./reportText.js";
import { deviceTeamRecords } from "./teamRecords.js";
import { activeTeamId } from "./teamStorage.js";
import { TEXT } from "./text.js";

/** The lines in the order a coach reads them: goal, then back to attack. */
const LINE_ORDER = ["goal", "back", "dmid", "mid", "amid", "fwd"];

const SVG_NS = "http://www.w3.org/2000/svg";
const CHART_COLORS = ["#127a3e", "#f07a1a", "#1554d1", "#b81f35", "#7b3f98"];
const chartColor = (index: number): string =>
	CHART_COLORS[index % CHART_COLORS.length] ?? "#127a3e";

function svgNode(name: string): SVGElement {
	return document.createElementNS(SVG_NS, name);
}

function svgText(text: string, x: number, y: number): SVGTextElement {
	const node = svgNode("text") as SVGTextElement;
	node.setAttribute("x", String(x));
	node.setAttribute("y", String(y));
	node.textContent = text;
	return node;
}

function monthlyMinutesChart(history: SeasonHistory): SVGSVGElement {
	const model = monthlyMinutes(history);
	const width = 360;
	const left = 92;
	const top = 22;
	const rowHeight = 30;
	const chartWidth = width - left - 8;
	const monthWidth = chartWidth / Math.max(model.months.length, 1);
	const height = top + model.series.length * rowHeight + 28;
	const max = Math.max(1, ...model.series.flatMap((series) => series.minutes));
	const svg = svgNode("svg") as SVGSVGElement;
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	svg.setAttribute("role", "img");
	svg.setAttribute("aria-label", TEXT.history.visualizations.monthlyMinutes);
	svg.append(svgText(TEXT.history.visualizations.axisMinutes, left, 12));

	model.series.forEach((series, playerIndex) => {
		const y = top + playerIndex * rowHeight;
		svg.append(svgText(series.name, 4, y + 16));
		series.minutes.forEach((minutes, monthIndex) => {
			const bar = svgNode("rect");
			bar.setAttribute("x", String(left + monthIndex * monthWidth + 2));
			bar.setAttribute("y", String(y + 4));
			bar.setAttribute("width", String(Math.max(1, monthWidth - 5)));
			bar.setAttribute("height", String((minutes / max) * 18));
			bar.setAttribute(
				"transform",
				`translate(0 ${18 - (minutes / max) * 18})`,
			);
			bar.setAttribute("fill", chartColor(playerIndex));
			svg.append(bar);
		});
	});
	model.months.forEach((month, index) => {
		svg.append(
			svgText(month.slice(5), left + index * monthWidth + 4, height - 4),
		);
	});
	return svg;
}

function startFrequencyChart(history: SeasonHistory): SVGSVGElement {
	const model = recentStartFrequency(history);
	const width = 360;
	const left = 92;
	const top = 20;
	const rowHeight = 28;
	const barWidth = width - left - 34;
	const height = top + model.length * rowHeight;
	const svg = svgNode("svg") as SVGSVGElement;
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	svg.setAttribute("role", "img");
	svg.setAttribute(
		"aria-label",
		TEXT.history.visualizations.startFrequency(LIMITS.recentMatches),
	);
	svg.append(svgText(TEXT.history.visualizations.axisPercent, left, 12));

	model.forEach((player, index) => {
		const y = top + index * rowHeight;
		svg.append(svgText(player.name, 4, y + 16));
		const bar = svgNode("rect");
		bar.setAttribute("x", String(left));
		bar.setAttribute("y", String(y + 4));
		bar.setAttribute("width", String((player.percentage / 100) * barWidth));
		bar.setAttribute("height", "18");
		bar.setAttribute("fill", chartColor(index));
		svg.append(
			bar,
			svgText(`${player.percentage}%`, left + barWidth + 4, y + 17),
		);
	});
	return svg;
}

function buildVisualizationCard(history: SeasonHistory): HTMLElement {
	const t = TEXT.history.visualizations;
	const section = card(t.title);
	const description = document.createElement("p");
	description.className = "hint";
	description.textContent = t.chartDescription;
	section.append(description);

	const monthly = document.createElement("div");
	monthly.className = "history-chart";
	const monthlyHeading = document.createElement("h3");
	monthlyHeading.textContent = t.monthlyMinutes;
	monthly.append(monthlyHeading, monthlyMinutesChart(history));
	section.append(monthly);

	const starts = document.createElement("div");
	starts.className = "history-chart";
	const startsHeading = document.createElement("h3");
	startsHeading.textContent = t.startFrequency(LIMITS.recentMatches);
	starts.append(startsHeading, startFrequencyChart(history));
	section.append(starts);
	return section;
}

/**
 * The statistics page: per player starts, minutes,
 * minutes per position and month by month, the two comparative charts, and
 * Every number comes from core/history.ts,
 * which computes it from the match files' timelines. (The season report and
 * per-player notes have their own pages, #119.)
 */
export function createStatisticsView(): { refresh: () => void } {
	// refresh() is async and called again by every import, restore and the
	// first render; only the newest call may draw, or a slow earlier one
	// (started before an import) would overwrite the fresh result.
	let latestRender = 0;

	async function refresh(): Promise<void> {
		const thisRender = ++latestRender;
		const { history } = await loadSeasonData();
		if (thisRender !== latestRender) return;
		byId("historyCount").textContent =
			history.matches === 0
				? TEXT.history.empty
				: TEXT.history.matchesCount(history.matches, history.months.length);
		const results = byId("historyResults");
		results.replaceChildren();
		if (history.matches === 0) return;

		const players = card("Startat och speltid");
		players.append(
			table(
				[
					"Spelare",
					"Matcher",
					"Startat",
					"Bänkstart",
					"Minuter",
					"Snitt per match",
					"Startat, senaste matcherna",
				],
				history.players.map((p) => [
					p.name,
					String(p.squadMatches),
					String(p.started),
					String(p.startedOnBench),
					TEXT.history.minutes(p.totalSeconds),
					TEXT.history.minutes(p.averageSeconds),
					TEXT.history.recent(p.recent.started, p.recent.of),
				]),
			),
		);
		const hints = history.players.filter(
			(p: PlayerHistory) =>
				p.recent.of >= 3 && p.recent.started * 2 <= p.recent.of,
		);
		if (hints.length > 0) {
			const list = document.createElement("ul");
			list.className = "report-feedback";
			for (const p of hints) {
				const li = document.createElement("li");
				li.textContent = TEXT.history.startedHint(
					p.name,
					p.recent.started,
					p.recent.of,
				);
				list.append(li);
			}
			players.append(list);
		}
		results.append(players);

		const team = loadDraft();
		if (team.substitutions.kind === "limited") {
			const summaries = await deviceTeamRecords.matchSummaries(
				activeTeamId(),
				team.fairness,
			);
			if (thisRender !== latestRender) return;
			const names = new Map(history.players.map((p) => [p.key, p.name]));
			const over = card(TEXT.history.standingTitle(team.fairness));
			const help = document.createElement("p");
			help.className = "hint";
			help.textContent = TEXT.history.standingHelp;
			over.append(
				help,
				table(
					["Spelare", "Matcher", "Startat", "Minuter", "Mot snittet"],
					standing(summaries, team.fairness).map((p) => [
						names.get(p.playerId) ?? p.playerId,
						String(p.matches),
						String(p.started),
						TEXT.history.minutes(p.seconds),
						TEXT.history.aheadOfAverage(p.aheadSeconds),
					]),
				),
			);
			results.append(over);
		}

		const lines = LINE_ORDER.filter((id) =>
			history.players.some((p) => (p.zoneSeconds[id] ?? 0) > 0),
		);
		const positions = card("Minuter per position");
		positions.append(
			table(
				["Spelare", ...lines.map(lineName)],
				history.players.map((p) => [
					p.name,
					...lines.map((id) => TEXT.history.minutes(p.zoneSeconds[id] ?? 0)),
				]),
			),
		);
		results.append(positions);

		const months = card("Månad för månad");
		months.append(
			table(
				["Spelare", ...history.months.map(TEXT.history.month)],
				history.players.map((p) => [
					p.name,
					...history.months.map((month) =>
						TEXT.history.minutes(
							p.months.find((m) => m.month === month)?.seconds ?? 0,
						),
					),
				]),
			),
		);
		results.append(months);

		results.append(buildVisualizationCard(history));
	}

	return { refresh };
}
