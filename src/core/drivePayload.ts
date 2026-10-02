import { driveFileName, teamMarkerName } from "./driveNames.js";
import { LIMITS } from "./limits.js";
import { type MatchFile, parseMatchFile } from "./matchFile.js";
import { type PlayerNotesFile, parsePlayerNotesFile } from "./playerNotes.js";
import { parseRosterFile, type RosterFile } from "./storage.js";

/**
 * What is inside each encrypted file in a Drive folder (#135). Every
 * payload names the team it belongs to, so a file that ended up in the
 * wrong folder is recognised by its contents and not trusted by its name
 * alone; the name must also be the one these contents would be given
 * (payloadFileName), so a renamed or copied file is caught too.
 */
export type DrivePayload =
	| { schemaVersion: 1; kind: "match"; teamId: string; match: MatchFile }
	| {
			schemaVersion: 1;
			kind: "notes";
			teamId: string;
			deviceId: string;
			playerNotes: PlayerNotesFile;
	  }
	| {
			schemaVersion: 1;
			kind: "squad";
			teamId: string;
			deviceId: string;
			roster: RosterFile;
	  }
	| {
			schemaVersion: 1;
			kind: "team";
			teamId: string;
			/** Shown when a restore offers several teams (#142). */
			teamName?: string;
	  };

export type DrivePayloadProblem =
	| { code: "notObject" }
	| { code: "schemaVersion" }
	| { code: "kind" }
	| { code: "teamId" }
	| { code: "content" };

export class DrivePayloadError extends Error {
	constructor(
		message: string,
		readonly problem: DrivePayloadProblem,
	) {
		super(message);
		this.name = "DrivePayloadError";
	}
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Strictly parse a decrypted Drive payload; each part by its own parser. */
export function parseDrivePayload(raw: unknown): DrivePayload {
	if (!isRecord(raw)) {
		throw new DrivePayloadError("Payload is not an object", {
			code: "notObject",
		});
	}
	if (raw.schemaVersion !== 1) {
		throw new DrivePayloadError("Unknown payload version", {
			code: "schemaVersion",
		});
	}
	if (typeof raw.teamId !== "string" || !UUID.test(raw.teamId)) {
		throw new DrivePayloadError("Payload has no valid team id", {
			code: "teamId",
		});
	}
	const teamId = raw.teamId;
	const content = (): never => {
		throw new DrivePayloadError("Payload content is not valid", {
			code: "content",
		});
	};
	const deviceId = (): string =>
		typeof raw.deviceId === "string" && raw.deviceId !== ""
			? raw.deviceId
			: content();
	try {
		switch (raw.kind) {
			case "team": {
				if (raw.teamName === undefined) {
					return { schemaVersion: 1, kind: "team", teamId };
				}
				if (typeof raw.teamName !== "string") return content();
				return {
					schemaVersion: 1,
					kind: "team",
					teamId,
					teamName: raw.teamName.trim().slice(0, LIMITS.teamNameLength),
				};
			}
			case "match":
				return {
					schemaVersion: 1,
					kind: "match",
					teamId,
					match: parseMatchFile(raw.match),
				};
			case "notes":
				return {
					schemaVersion: 1,
					kind: "notes",
					teamId,
					deviceId: deviceId(),
					playerNotes: parsePlayerNotesFile(raw.playerNotes),
				};
			case "squad":
				return {
					schemaVersion: 1,
					kind: "squad",
					teamId,
					deviceId: deviceId(),
					roster: parseRosterFile(raw.roster),
				};
		}
	} catch (err) {
		if (err instanceof DrivePayloadError) throw err;
		return content();
	}
	throw new DrivePayloadError("Unknown payload kind", { code: "kind" });
}

/** The Drive file name these contents must be stored under. */
export function payloadFileName(payload: DrivePayload): Promise<string> {
	switch (payload.kind) {
		case "team":
			return Promise.resolve(teamMarkerName(payload.teamId));
		case "match":
			return driveFileName(
				"match",
				payload.teamId,
				payload.match.audit.matchId,
			);
		case "notes":
			return driveFileName("notes", payload.teamId, payload.deviceId);
		case "squad":
			return driveFileName("squad", payload.teamId, payload.deviceId);
	}
}
