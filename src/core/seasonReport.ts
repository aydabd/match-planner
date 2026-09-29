import type { SeasonHistory } from "./history.js";
import type {
	AbsenceReason,
	DevelopmentArea,
	PlayerNotesFile,
} from "./playerNotes.js";

export const SEASON_REPORT_SCHEMA_VERSION = 1;

export interface DevelopmentSummary {
	area: DevelopmentArea;
	summary: string;
}

export interface PlayerSeasonReport {
	key: string;
	name: string;
	matches: { squad: number; played: number; started: number };
	playtimeSeconds: { total: number; average: number };
	availability: {
		present: number;
		absent: number;
		reasons: Partial<Record<AbsenceReason, number>>;
	};
	/** Coach-reviewed before export; initially derived from development notes. */
	developmentSummary: DevelopmentSummary[];
}

export interface SeasonReport {
	schemaVersion: 1;
	generatedAt: string;
	players: PlayerSeasonReport[];
}

const AREAS: readonly DevelopmentArea[] = [
	"physical",
	"mental",
	"technical",
	"tactical",
];

const REASONS: readonly AbsenceReason[] = ["injury", "illness", "other"];

export function buildSeasonReport(
	history: SeasonHistory,
	notes: PlayerNotesFile,
	generatedAt: string,
): SeasonReport {
	return {
		schemaVersion: SEASON_REPORT_SCHEMA_VERSION,
		generatedAt,
		players: history.players.map((player) => {
			const own = notes.players.find((entry) => entry.key === player.key);
			const availability = own?.availability ?? [];
			const reasons: Partial<Record<AbsenceReason, number>> = {};
			for (const reason of REASONS) {
				const count = availability.filter(
					(entry) => entry.reason === reason,
				).length;
				if (count > 0) reasons[reason] = count;
			}
			return {
				key: player.key,
				name: player.name,
				matches: {
					squad: player.squadMatches,
					played: player.playedMatches,
					started: player.started,
				},
				playtimeSeconds: {
					total: player.totalSeconds,
					average: player.averageSeconds,
				},
				availability: {
					present: availability.filter((entry) => entry.status === "available")
						.length,
					absent: availability.filter((entry) => entry.status === "absent")
						.length,
					reasons,
				},
				developmentSummary: AREAS.map((area) => ({
					area,
					summary:
						own?.development
							.filter((entry) => entry.area === area)
							.map((entry) => entry.note)
							.join(" · ") ?? "",
				})),
			};
		}),
	};
}

export function seasonReportToJson(report: SeasonReport): string {
	return JSON.stringify(report, null, 2);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && value >= 0;

export function isSeasonReport(value: unknown): value is SeasonReport {
	if (!isRecord(value)) return false;
	if (value.schemaVersion !== SEASON_REPORT_SCHEMA_VERSION) return false;
	if (
		typeof value.generatedAt !== "string" ||
		Number.isNaN(Date.parse(value.generatedAt)) ||
		!Array.isArray(value.players) ||
		value.players.length === 0
	)
		return false;
	return value.players.every((raw) => {
		if (!isRecord(raw)) return false;
		if (typeof raw.key !== "string" || raw.key === "") return false;
		if (typeof raw.name !== "string" || raw.name === "") return false;
		if (!isRecord(raw.matches) || !isRecord(raw.playtimeSeconds)) return false;
		if (
			!isNumber(raw.matches.squad) ||
			!isNumber(raw.matches.played) ||
			!isNumber(raw.matches.started) ||
			!isNumber(raw.playtimeSeconds.total) ||
			!isNumber(raw.playtimeSeconds.average)
		)
			return false;
		const availability = raw.availability;
		if (!isRecord(availability)) {
			return false;
		}
		const reasons = availability.reasons;
		if (!isRecord(reasons)) {
			return false;
		}
		if (
			!isNumber(availability.present) ||
			!isNumber(availability.absent) ||
			!REASONS.every((reason) => {
				const count = reasons[reason];
				return count === undefined || isNumber(count);
			})
		)
			return false;
		if (!Array.isArray(raw.developmentSummary)) return false;
		return raw.developmentSummary.every(
			(entry) =>
				isRecord(entry) &&
				AREAS.includes(entry.area as DevelopmentArea) &&
				typeof entry.summary === "string",
		);
	});
}
