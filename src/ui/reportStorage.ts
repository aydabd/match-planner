import { LIMITS } from "../core/limits.js";
import {
	isStoredReport,
	type StoredReport,
	withReport,
} from "../core/report.js";
import { readItem, STORAGE_KEYS, writeItem } from "./appStorage.js";

/** The kept reports, newest first. Damaged entries are left out. */
export function loadReports(): StoredReport[] {
	const raw = readItem(STORAGE_KEYS.reports);
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
		STORAGE_KEYS.reports,
		JSON.stringify(withReport(loadReports(), report, LIMITS.storedReports)),
	);
}
