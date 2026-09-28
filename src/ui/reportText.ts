import { formatTime } from "../core/match.js";
import type { StoredReport } from "../core/report.js";
import { GOAL } from "../core/timeline.js";
import { TEXT } from "./text.js";

/** The line name in the report: the keeper's "goal", or a pitch line. */
export function lineName(id: string): string {
	return id === GOAL ? TEXT.match.keeperLine : TEXT.match.zoneName(id);
}

/** "Back 10:00, Mittfält 05:00": where a player spent the match. */
export function zoneBreakdown(zoneSeconds: Record<string, number>): string {
	return Object.entries(zoneSeconds)
		.filter(([, seconds]) => seconds > 0)
		.map(([id, seconds]) => `${lineName(id)} ${formatTime(seconds)}`)
		.join(", ");
}

/** "3 vilor, kortast 02:10, längst 09:40", or that the player never rested. */
export function restSummary(rests: readonly { seconds: number }[]): string {
	if (rests.length === 0) return TEXT.report.noRest;
	const seconds = rests.map((r) => r.seconds);
	return TEXT.report.restSummary(
		rests.length,
		formatTime(Math.min(...seconds)),
		formatTime(Math.max(...seconds)),
	);
}

/** The details line: opponent, place, date and format. */
export function reportDetails(stored: StoredReport): string[] {
	const { opponent, venue, date } = stored.match;
	return [
		opponent === "" ? TEXT.report.unnamedMatch : opponent,
		venue,
		date.replace("T", " "),
		stored.formatLabel,
	].filter((part) => part !== "");
}

/** The whole report as plain text, to paste into a message or a note. */
export function reportAsText(stored: StoredReport): string {
	const { report } = stored;
	const nameOf = (id: string) =>
		report.players.find((p) => p.id === id)?.name ?? id;
	return TEXT.report.textReport({
		title: TEXT.report.subtitle(reportDetails(stored)),
		details: [],
		feedback: report.feedback.map((f) => TEXT.report.feedback(f, nameOf)),
		players: report.players.map((p) => {
			const note = TEXT.report.status(p.status);
			const periods = p.periodSeconds
				.map((s, i) => `${TEXT.report.periodColumn(i + 1)} ${formatTime(s)}`)
				.join(", ");
			return `${p.name}: ${formatTime(p.totalSeconds)} (${periods})${note ? `, ${note}` : ""}. ${restSummary(p.rests)}`;
		}),
		swaps: report.swaps.map(
			(s) =>
				`${formatTime(s.at)} ${TEXT.match.substitution(s.inName, s.outName)}, planerat ${formatTime(s.plannedAt)}: ${TEXT.report.delay(s.delaySeconds)}${s.inRestedSeconds === null ? "" : `, ${s.inName} hade vilat ${formatTime(s.inRestedSeconds)}`}`,
		),
	});
}
