/**
 * MatchPlanner's own Google Cloud OAuth client (#56). An OAuth client id
 * for a web app is a public identifier, not a secret - Google restricts it
 * by the authorized JavaScript origins configured for it in the Cloud
 * Console, not by keeping the id itself hidden. A self-hosted fork sets its
 * own id here (and its own authorized origins in its own Cloud Console
 * project) rather than reusing this one, since origins are checked against
 * the page's actual origin.
 */
export const DRIVE_CLIENT_ID: string =
	"283349306270-gus1frrip9p04sp5042gkp24qb94smcu.apps.googleusercontent.com";

/**
 * Drive access limited to files this app itself creates or opens - never
 * the coach's whole Drive. Chosen over the full "drive" scope so backup
 * never asks for more than it needs, and so Google's sensitive-scope
 * verification review does not apply.
 */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/**
 * The same Cloud project's number, needed as the Picker API's `appId`
 * (#70). Also a public identifier, same reasoning as DRIVE_CLIENT_ID.
 */
export const DRIVE_APP_ID = "283349306270";

/**
 * Optional: an API key restricted to the Picker API and this site's origin
 * (Cloud Console: APIs & Services → Credentials → Create credentials → API
 * key, then "Restrict key" to the Google Picker API and the site's HTTP
 * referrer). The picker (drivePicker.ts) authenticates with the coach's
 * own Drive OAuth token, so it works without this key too - set one to
 * raise the picker's own request quota. Also needs the Picker API itself
 * enabled for the project if set - the same "enable this API" step #56's
 * Drive API needed; see driveClient.ts's `driveFetch` for what that
 * failure looks like when a step like this is missed.
 */
export const DRIVE_PICKER_API_KEY = "";
