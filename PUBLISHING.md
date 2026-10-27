# Pantry Chef: build, host, update (same pattern as Galaxy Gridiron / Swipe Clean)
SECRET links. Don't post them publicly.
- Site: **YOUR-SITE-SLUG** (own here.now Site, permanent, owner key `$HERENOW_API_KEY`). Root is a blank "Nothing here" page + robots `Disallow: /`.
- Install page (secret path, `keys/site-config.json` → install_path): https://YOUR-SITE-SLUG.here.now/YOUR_SECRET_PATH/
- **STABLE update channel** (compiled into `app/src/version.ts`, never rename or remove): https://YOUR-SITE-SLUG.here.now/YOUR_SECRET_PATH/version.json
- Package `com.pantrychef.app`. Keystore `keys/pantrychef.keystore` (alias pantrychef, password `keys/keystore-password.txt`, 0600).
  **KEEP IT**: updates must be signed with the same key or Android refuses to install over the old version.
  Keep an offline backup of `keys/` somewhere safe (not in git).

## New release
1. Bump `app/app.json` (expo.version + android.versionCode) and `app/src/version.ts` (VERSION_NAME + VERSION_CODE).
2. `bash build-apk.sh`. Local Gradle release build (no EAS). It checks that the versions agree, runs tsc + logic and receipt tests, signs with the keystore, and verifies with aapt2 badging. Output: `dist/PantryChef-v<ver>.apk`.
3. `NOTES="what's new" bash tools/make_site.sh`. Copies the APK + install page into `publish-site/<install_path>/` and re-points `publish-site/<update_channel>/version.json`.
4. `SHOW_URL=1 bash publish.sh`. Uploads the WHOLE `publish-site/` folder as a new snapshot. Never delete older APKs or folders in publish-site/.

## How the in-app update check works
`app/src/update.ts`: on launch and when the app returns to the foreground (throttled to once per 6 h), plus on demand from About → Check for updates (forced),
the app GETs `version.json` from the stable channel. If `versionCode` > the installed VERSION_CODE, and `apkUrl` is on this site, it shows a banner
(Download / Later). Download opens the APK in the browser; the user installs it over the old app and keeps their data. "Later" hides that version's banner only.
