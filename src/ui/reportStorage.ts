import { LIMITS } from "../core/limits.js";
import {
	isStoredReport,
	type StoredReport,
	withReport,
} from "../core/report.js";
import { readItem, STORAGE_KEYS, teamScoped, writeItem } from "./appStorage.js";
import { activeTeamId } from "./teamStorage.js";

/** The kept reports, newest first. Damaged entries are left out. */
export function loadReports(): StoredReport[] {
	const raw = readItem(teamScoped(STORAGE_KEYS.reports, activeTeamId()));
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter(isStoredReport) : [];
	} catch {
		return [];
	}
}

/** Keep a report on this device (the last LIMITS.storedReports matches). */
export function saveReport(report: StoredReport): void {
	writeItem(
		teamScoped(STORAGE_KEYS.reports, activeTeamId()),
		JSON.stringify(withReport(loadReports(), report, LIMITS.storedReports)),
	);
}
