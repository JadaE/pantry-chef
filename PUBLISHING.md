# Pantry Chef: build, host, update (same pattern as Galaxy Gridiron / Swipe Clean)
SECRET links. Don't post them publicly.
## Config: ONE gitignored file
- `app/config.local.json` (gitignored, mode 600) holds every deploy-specific value: `slug`, `installPath`, `updateChannelPath`, `keystorePassword`, `neverPublishTo` (slugs of OTHER projects that publish.sh must refuse).
  `app/config.example.json` (committed) has the same keys with placeholders. To set up: `cp app/config.example.json app/config.local.json`, fill it in, `chmod 600`.
- App code reads it only through `app/src/config.ts` (falls back to the example file if the real one is missing, so a clean clone type-checks, tests and builds, but has no update channel). Scripts read it with `jq`. Publishing refuses placeholder values.
- Site: own here.now Site (permanent, owner key `$HERENOW_API_KEY`, never stored in the repo). Root is a blank "Nothing here" page + robots `Disallow: /`.
- Install page: `https://<slug>.here.now/<installPath>/`. **STABLE update channel** (compiled into the app via `app/src/config.ts`, never rename or remove): `https://<slug>.here.now/<updateChannelPath>/version.json`. Treat both as secret links.
- Package `com.pantrychef.app`. Keystore `keys/pantrychef.keystore` (gitignored; alias pantrychef; password = `keystorePassword` in the config).
  **KEEP IT**: updates must be signed with the same key or Android refuses to install over the old version.
  Keep an offline backup of `keys/` and `app/config.local.json` somewhere safe (not in git).

## New release
1. Bump `app/app.json` (expo.version + android.versionCode) and `app/src/version.ts` (VERSION_NAME + VERSION_CODE).
2. `bash build-apk.sh` (works from any folder). Local Gradle release build (no EAS). It checks that the versions agree, runs tsc + logic and receipt tests, signs with the keystore, and verifies with aapt2 badging. Output: `dist/PantryChef-v<ver>.apk`.
3. `NOTES="what's new" bash tools/make_site.sh`. Copies the APK + install page into `publish-site/<installPath>/` and re-points `publish-site/<updateChannelPath>/version.json`.
4. `SHOW_URL=1 bash publish.sh`. Uploads the WHOLE `publish-site/` folder as a new snapshot. Never delete older APKs or folders in publish-site/.

## How the in-app update check works
`app/src/update.ts`: on launch and when the app returns to the foreground (throttled to once per 6 h), plus on demand from About → Check for updates (forced),
the app GETs `version.json` from the stable channel. If `versionCode` > the installed VERSION_CODE, and `apkUrl` is on this site, it shows a banner
(Download / Later). Download opens the APK in the browser; the user installs it over the old app and keeps their data. "Later" hides that version's banner only.
