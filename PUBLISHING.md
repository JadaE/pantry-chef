# Pantry Chef: build, host, update (same pattern as Galaxy Gridiron / Swipe Clean)
SECRET links. Don't post them publicly.
## Config: ONE gitignored file
- `app/config.local.json` (gitignored, mode 600) holds every deploy-specific value: `slug`, `installPath`, `updateChannelPath`, `keystorePassword`, `neverPublishTo` (slugs of OTHER projects that publish.sh must refuse), `publishSiteDir` (absolute path of the existing staged site folder: older APKs + install page + update channel).
  `app/config.example.json` (committed) has the same keys with placeholders. To set up: `cp app/config.example.json app/config.local.json`, fill it in, `chmod 600`.
- App code NEVER imports `config.local.json` (Metro would bundle every key, including the keystore password, into the APK). `build-apk.sh` writes `app/src/generated/appconfig.json` (gitignored) with ONLY `slug` and `updateChannelPath`; `app/src/config.ts` reads that, falling back to the example file, so a clean clone type-checks, tests and builds but has no update channel. Scripts read the real config with `jq`. Publishing refuses placeholder values.
- After every build `tools/apk-leak-check.sh` unzips the APK (including `assets/index.android.bundle`) and fails the build if the keystore password, install path or any `neverPublishTo` slug appears (it prints only which key leaked, never the value). Run it by hand on any APK: `bash tools/apk-leak-check.sh dist/PantryChef-v<ver>.apk`.
- Site: own here.now Site (permanent, owner key `$HERENOW_API_KEY`, never stored in the repo). Root is a blank "Nothing here" page + robots `Disallow: /`.
- Install page: `https://<slug>.here.now/<installPath>/`. **STABLE update channel** (compiled into the app via `app/src/config.ts`, never rename or remove): `https://<slug>.here.now/<updateChannelPath>/version.json`. Treat both as secret links.
- Package `com.pantrychef.app`. Keystore `keys/pantrychef.keystore` (gitignored; alias pantrychef; password = `keystorePassword` in the config).
  **KEEP IT**: updates must be signed with the same key or Android refuses to install over the old version.
  Keep an offline backup of `keys/` and `app/config.local.json` somewhere safe (not in git).

## New release
1. Bump `app/app.json` (expo.version + android.versionCode) and `app/src/version.ts` (VERSION_NAME + VERSION_CODE).
2. `bash build-apk.sh` (works from any folder). Local Gradle release build (no EAS). It checks that the versions agree, runs tsc + logic and receipt tests, signs with the keystore, and verifies with aapt2 badging. Output: `dist/PantryChef-v<ver>.apk`.
3. `NOTES="what's new" bash tools/make_site.sh`. Copies the APK + install page into `<publishSiteDir>/<installPath>/` and re-points `<publishSiteDir>/<updateChannelPath>/version.json`. (`publish.sh` runs this for you.) Refuses if `publishSiteDir` is missing/relative or the folder lacks the older APKs, install page or update channel, or if the APK fails the leak check.
4. `DRY_RUN=1 bash publish.sh` first: stages into a temp copy of the site folder and prints what it would upload, publishing nothing. Then `SHOW_URL=1 bash publish.sh` uploads the WHOLE site folder as a new snapshot (it also refuses a version older than the published one). Never delete older APKs or folders in the site folder.

## How the in-app update check works
`app/src/update.ts`: on launch and when the app returns to the foreground (throttled to once per 6 h), plus on demand from About → Check for updates (forced),
the app GETs `version.json` from the stable channel. If `versionCode` > the installed VERSION_CODE, and `apkUrl` is on this site, it shows a banner
(Download / Later). Download opens the APK in the browser; the user installs it over the old app and keeps their data. "Later" hides that version's banner only.
