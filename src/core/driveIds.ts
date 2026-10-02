/**
 * Google Drive ids (#147). Drive hands out ids made of letters, digits,
 * "-" and "_". They come from the Picker, from storage and from Drive's own
 * answers, and end up inside a Drive query (`'<id>' in parents`) and inside
 * URL paths, so anything else - a quote, a slash, a "?" - could change what
 * a request means. Nothing is sent to Drive with an id that fails this.
 */
const DRIVE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function isDriveId(value: unknown): value is string {
	return typeof value === "string" && DRIVE_ID.test(value);
}
