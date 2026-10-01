import { readItem, STORAGE_KEYS, writeItem } from "./appStorage.js";

/** A new id for this device, only used to tell devices' Drive files apart. */
function newDeviceId(): string {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
	);
}

/**
 * The id of this device, made on first use and kept (#135). It names the
 * notes and squad files this device writes to Drive, so each device only
 * ever overwrites its own.
 */
export function deviceId(): string {
	const saved = readItem(STORAGE_KEYS.deviceId);
	if (saved) return saved;
	const id = newDeviceId();
	writeItem(STORAGE_KEYS.deviceId, id);
	return id;
}
