import { describe, expect, it } from "vitest";
import { clearAppData, readItem, STORAGE_KEYS } from "../src/ui/appStorage.js";
import { deviceId } from "../src/ui/deviceStorage.js";
import { useMemoryStorage } from "./support/memoryStorage.js";

describe("deviceStorage", () => {
	useMemoryStorage();

	it("makes an id on first use and keeps returning the same one", () => {
		const id = deviceId();
		expect(id).not.toBe("");
		expect(deviceId()).toBe(id);
	});

	it("is the same for every team on the device, since it names the device", () => {
		expect(readItem(STORAGE_KEYS.deviceId)).toBeNull();
		const id = deviceId();
		expect(readItem(STORAGE_KEYS.deviceId)).toBe(id);
	});

	it("is removed with the rest of the app's data, and then a fresh one is made", () => {
		const id = deviceId();
		clearAppData([]);
		expect(readItem(STORAGE_KEYS.deviceId)).toBeNull();
		expect(deviceId()).not.toBe(id);
	});
});
