import type { StoredReport } from "../../core/report.js";
import "../style.css";
import { initPage } from "../page.js";
import { createReportView } from "../report.js";
import { loadReports } from "../reportStorage.js";

initPage("report");

// A shown report's back link goes to the match if that's where the coach
// came from (the match's own report saves before it links here), otherwise
// to start. The empty state always goes to start (issue #93): there is no
// report to return to on the match screen either way.
const back = document.getElementById("reportBackBtn");
if (
	back instanceof HTMLAnchorElement &&
	new URLSearchParams(location.search).get("from") === "match"
) {
	back.href = `${import.meta.env.BASE_URL}match/`;
}

/**
 * The report to show: the one named by ?matchId= (set when Start's "kept
 * reports" list links here), falling back to the most recent one - also
 * when ?matchId doesn't match anything kept on this device - so the page
 * is a useful destination on its own. Null only when nothing is saved at
 * all.
 */
function pickReport(): StoredReport | null {
	const reports = loadReports();
	if (reports.length === 0) return null;
	const matchId = new URLSearchParams(location.search).get("matchId");
	return reports.find((r) => r.matchId === matchId) ?? reports[0] ?? null;
}

const stored = pickReport();
const emptyState = document.getElementById("reportEmptyState");
const reportSection = document.getElementById("reportView");

if (stored) {
	if (emptyState) emptyState.hidden = true;
	if (reportSection) reportSection.hidden = false;
	createReportView().show(stored);
	reportSection?.querySelector("h1")?.focus();
} else {
	if (reportSection) reportSection.hidden = true;
	if (emptyState) {
		emptyState.hidden = false;
		emptyState.querySelector("h1")?.focus();
	}
}
