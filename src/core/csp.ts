/**
 * The Content-Security-Policy every built page carries (#147). It is the
 * last line of defence for what the app handles: even if some script ever
 * ran on a page, it could not load more code from anywhere but the app and
 * Google, nor send the typed password, the match data or the access token
 * to any other host.
 *
 * - Scripts come only from the app itself and the two Google libraries it
 *   loads on demand (sign-in and the folder Picker). No inline script, no
 *   eval, no wildcard.
 * - Network calls go only to the app and to Google (Drive and sign-in).
 * - Frames only for Google sign-in and the Picker.
 * - Styles allow inline: the Picker fix and a few elements set styles at
 *   runtime. That cannot run code.
 * - Plugins, a changed base URL and forms posting elsewhere are blocked.
 *
 * Sign-in and the Picker are Google's, loaded from Google at runtime, and
 * the automated tests fake them. If Google starts to need another host,
 * the real sign-in or Picker will report a "Content Security Policy"
 * violation in the browser console: add exactly that host here, nowhere
 * wider. (`frame-ancestors` cannot be set from a meta tag; it needs an HTTP
 * header the static host does not offer.)
 */
export const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	"script-src 'self' https://accounts.google.com https://apis.google.com https://www.gstatic.com",
	"style-src 'self' 'unsafe-inline' https://accounts.google.com",
	"img-src 'self' data: https://*.gstatic.com https://*.googleusercontent.com",
	"font-src 'self' data:",
	"connect-src 'self' https://www.googleapis.com https://content.googleapis.com https://accounts.google.com",
	"frame-src https://accounts.google.com https://docs.google.com https://content.googleapis.com",
	"worker-src 'self'",
	"manifest-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
].join("; ");
