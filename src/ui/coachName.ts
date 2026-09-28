import { LIMITS } from "../core/limits.js";
import { readItem, STORAGE_KEYS, writeItem } from "./appStorage.js";

/**
 * The coach's own name, typed once on this device and recorded as createdBy
 * in the files they save. There are no accounts; it is only a label.
 */
export function loadCoachName(): string {
	return (readItem(STORAGE_KEYS.coachName) ?? "").slice(
		0,
		LIMITS.coachNameLength,
	);
}

export function saveCoachName(name: string): void {
	writeItem(
		STORAGE_KEYS.coachName,
		name.trim().slice(0, LIMITS.coachNameLength),
	);
}
