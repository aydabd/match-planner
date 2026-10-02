import { afterEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "../src/core/limits.js";
import { createDriveClient } from "../src/ui/driveClient.js";

const client = () => createDriveClient(async () => "token");

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
		handler(String(url), init),
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}
const json = (body: unknown, init: ResponseInit = {}) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
		...init,
	});

afterEach(() => vi.unstubAllGlobals());

const HOSTILE = [
	"abc' or 'x'='x",
	"abc/def",
	"../../etc",
	"abc?alt=media",
	"abc def",
	"",
];

describe("driveClient refuses ids that could change a request", () => {
	it.each(HOSTILE)("before any request is made: %j", async (id) => {
		const fetchMock = stubFetch(() => json({}));
		const c = client();
		await expect(c.listFiles(id)).rejects.toThrow();
		await expect(c.listFolders(id)).rejects.toThrow();
		await expect(c.createFolder(id, "x")).rejects.toThrow();
		await expect(c.createFile(id, "x.json", "{}")).rejects.toThrow();
		await expect(c.updateFile(id, "{}")).rejects.toThrow();
		await expect(c.downloadJson(id)).rejects.toThrow();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("puts a valid id into the query and the path unchanged", async () => {
		const urls: string[] = [];
		stubFetch((url) => {
			urls.push(url);
			return json({ files: [] });
		});
		const c = client();
		await c.listFiles("folder-1");
		await c.downloadJson("file_2");
		expect(new URL(urls[0] ?? "").searchParams.get("q")).toContain(
			"'folder-1' in parents",
		);
		expect(urls[1]).toContain("/files/file_2?alt=media");
	});

	it("leaves out an entry Drive lists with an id that is not a plausible id", async () => {
		stubFetch(() =>
			json({
				files: [
					{ id: "good-1", name: "a.json" },
					{ id: "bad/../id", name: "b.json" },
					{ id: "bad' id", name: "c.json" },
				],
			}),
		);
		expect(await client().listFiles("folder-1")).toEqual([
			{ name: "a.json", fileId: "good-1" },
		]);
		expect(await client().listFolders("folder-1")).toEqual([
			{ name: "a.json", folderId: "good-1" },
		]);
	});

	it("refuses a folder id Drive returns on create that is not a plausible id", async () => {
		stubFetch(() => json({ id: "bad/../id" }));
		await expect(client().createFolder("folder-1", "x")).rejects.toThrow();
	});
});

describe("driveClient will not read a file larger than the limit", () => {
	it("refuses by the declared length without reading the body", async () => {
		const big = String(LIMITS.driveFileBytes + 1);
		stubFetch(
			() =>
				new Response("{}", {
					status: 200,
					headers: { "Content-Length": big },
				}),
		);
		await expect(client().downloadJson("file-1")).rejects.toThrow(/för stor/);
	});

	it("refuses by the real length when none is declared", async () => {
		stubFetch(() => new Response(`"${"x".repeat(LIMITS.driveFileBytes)}"`));
		await expect(client().downloadJson("file-1")).rejects.toThrow(/för stor/);
	});

	it("reads a file within the limit", async () => {
		stubFetch(() => json({ ok: true }));
		expect(await client().downloadJson("file-1")).toEqual({ ok: true });
	});
});
