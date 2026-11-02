// The ONE place app code reads where updates come from.
// Since v0.0.7 (public "store version") the app has NO deploy-specific or secret values compiled in: the update check reads the
// PUBLIC GitHub Releases API of the app's public source repo. Nothing from config.local.json (keystore password, site slug, install
// or update-channel paths) is bundled; build-apk.sh no longer generates src/generated/appconfig.json and tools/apk-leak-check.sh
// fails the build if any old private-site value shows up in the APK.
// The repo is addressed by its numeric GitHub id (stable across renames/transfers, and keeps account names out of the app).
// Look it up with: gh api repos/<owner>/<repo> --jq .id
export const UPDATE_REPO_ID = 1435278186;
/** Public, unauthenticated endpoint: newest non-draft, non-prerelease release. */
export const UPDATE_URL = `https://api.github.com/repositories/${UPDATE_REPO_ID}/releases/latest`;
/** A download link must be a release asset of a repo named pantry-chef on github.com (it comes from the API answer above). */
export const DOWNLOAD_RE = /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/pantry-chef\/releases\/download\/[^?#\s]+\.apk$/i;
