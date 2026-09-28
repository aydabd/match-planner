import { buildHistory, type PlayerHistory } from "../core/history.js";
import {
	type MatchFile,
	MatchFileError,
	parseMatchFile,
} from "../core/matchFile.js";
import { createDriveAuth } from "./driveAuth.js";
import { createDriveBackup } from "./driveBackup.js";
import { DRIVE_CLIENT_ID, DRIVE_SCOPE } from "./driveConfig.js";
import { keepMatchFiles, loadMatchFiles } from "./matchFileStorage.js";
import { lineName } from "./reportText.js";
import { TEXT } from "./text.js";

function byId(id: string): HTMLElement {
	const node = document.getElementById(id);
	if (!node) throw new Error(`Missing element #${id}`);
	return node;
}

/** The lines in the order a coach reads them: goal, then back to attack. */
const LINE_ORDER = ["goal", "back", "dmid", "mid", "amid", "fwd"];

function card(title: string): HTMLElement {
	const section = document.createElement("section");
	section.className = "card";
	const heading = document.createElement("h2");
	heading.textContent = title;
	section.append(heading);
	return section;
}

function table(
	headers: readonly string[],
	rows: readonly (readonly string[])[],
): HTMLTableElement {
	const el = document.createElement("table");
	el.className = "report-table";
	const head = el.appendChild(document.createElement("thead"));
	const headRow = head.appendChild(document.createElement("tr"));
	for (const header of headers) {
		const th = document.createElement("th");
		th.scope = "col";
		th.textContent = header;
		headRow.append(th);
	}
	const body = el.appendChild(document.createElement("tbody"));
	for (const values of rows) {
		const row = body.appendChild(document.createElement("tr"));
		values.forEach((text, i) => {
			const cell = document.createElement(i === 0 ? "th" : "td");
			if (cell instanceof HTMLTableCellElement && i === 0) cell.scope = "row";
			cell.textContent = text;
			row.append(cell);
		});
	}
	return el;
}

/**
 * The season history screen: import match files, then per player starts,
 * minutes, minutes per position and month by month. Every number comes from
 * core/history.ts, which computes it from the match files' timelines.
 */
/** Wires the "backup to Google Drive" card; hidden when no client id is set. */
function setUpDriveBackup(refresh: () => void): void {
	const card = byId("historyBackupCard");
	if (DRIVE_CLIENT_ID === "") return;
	card.hidden = false;

	const connectBtn = byId("driveConnectBtn") as HTMLButtonElement;
	const backupBtn = byId("driveBackupBtn") as HTMLButtonElement;
	const restoreBtn = byId("driveRestoreBtn") as HTMLButtonElement;
	const status = byId("driveStatus");
	const t = TEXT.history.drive;

	const auth = createDriveAuth(DRIVE_CLIENT_ID, DRIVE_SCOPE);
	const backup = createDriveBackup(auth);

	connectBtn.addEventListener("click", async () => {
		status.textContent = t.connecting;
		try {
			await auth.accessToken();
			connectBtn.hidden = true;
			backupBtn.hidden = false;
			restoreBtn.hidden = false;
			status.textContent = t.signedIn;
		} catch {
			status.textContent = t.signInFailed;
		}
	});

	backupBtn.addEventListener("click", async () => {
		status.textContent = t.backingUp;
		backupBtn.disabled = true;
		try {
			const { uploaded } = await backup.backup();
			status.textContent = t.backedUp(uploaded);
		} catch {
			status.textContent = t.failed;
		} finally {
			backupBtn.disabled = false;
		}
	});

	restoreBtn.addEventListener("click", async () => {
		status.textContent = t.restoring;
		restoreBtn.disabled = true;
		try {
			const { downloaded } = await backup.restore();
			status.textContent = t.restored(downloaded);
			refresh();
		} catch {
			status.textContent = t.failed;
		} finally {
			restoreBtn.disabled = false;
		}
	});
}

export function createHistoryView(): { refresh: () => void } {
	const messages = byId("historyMessages");
	const input = byId("historyImportInput") as HTMLInputElement;

	function refresh(): void {
		const history = buildHistory(loadMatchFiles());
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
	}

	input.addEventListener("change", async () => {
		const files = [...(input.files ?? [])];
		input.value = "";
		messages.replaceChildren();
		const parsed: MatchFile[] = [];
		for (const file of files) {
			const li = document.createElement("li");
			try {
				parsed.push(parseMatchFile(JSON.parse(await file.text())));
				continue;
			} catch (err) {
				li.textContent = TEXT.history.refused(
					file.name,
					err instanceof MatchFileError
						? TEXT.history.problem(err.problem)
						: TEXT.history.unreadable,
				);
				li.classList.add("error");
			}
			messages.append(li);
		}
		if (parsed.length > 0) {
			const { newMatches, alreadyKnown } = keepMatchFiles(parsed);
			const li = document.createElement("li");
			li.textContent = TEXT.history.importResult(newMatches, alreadyKnown);
			messages.prepend(li);
		}
		refresh();
	});

	setUpDriveBackup(refresh);

	return { refresh };
}
