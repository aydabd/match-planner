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
