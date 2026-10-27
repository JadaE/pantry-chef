#!/usr/bin/env bash
# Stage the install page + APK for one version under its secret path, and point the stable update channel at it.
# Stages INTO the existing site folder named by publishSiteDir in app/config.local.json (the folder that already holds the older APKs,
# install page and update channel). Refuses if that key is missing/relative or the folder isn't the real site.
# Usage: NOTES="what's new" bash tools/make_site.sh   (reads version from app/app.json). Pattern from photo-cleanup/android.
#   DRY_RUN=1  stage into a temporary COPY of the site folder instead (the real folder is not touched); prints where.
#   STAGE_TO=<dir>  (used by publish.sh) stage into this pre-made copy.
set -euo pipefail
D=$(cd "$(dirname "$0")/.." && pwd)
. "$D/tools/site-common.sh"; load_site_config
SITE=$SITE_REAL
if [ -n "${STAGE_TO:-}" ]; then SITE=$STAGE_TO; validate_site_dir "$SITE" STAGE_TO
elif [ "${DRY_RUN:-}" = 1 ]; then SITE=$(mktemp -d /tmp/pc-site-dryrun.XXXXXX); cp -a "$SITE_REAL"/. "$SITE"/; echo "DRY_RUN: staging into a temp copy $SITE (real site folder untouched)"; fi
V=$(node -e "console.log(require('$D/app/app.json').expo.version)"); VC=$(node -e "console.log(require('$D/app/app.json').expo.android.versionCode)")
APK=PantryChef-v$V.apk; [ -f $D/dist/$APK ] || { echo "dist/$APK not found: run build-apk.sh first" >&2; exit 1; }
bash $D/tools/apk-leak-check.sh $D/dist/$APK "$CFG" || { echo "APK leaks private config; NOT staging" >&2; exit 1; }
mkdir -p $SITE/$INST $SITE/$UPD; cp $D/dist/$APK $SITE/$INST/
SHA=$(sha256sum $D/dist/$APK | cut -c1-16); SIZE=$(du -m $D/dist/$APK | cut -f1)
OLDER=""; for f in $(ls $SITE/$INST/PantryChef-v*.apk 2>/dev/null | sort -V); do n=$(basename $f); [ "$n" = "$APK" ] || OLDER+="<a href=\"$n\">$n</a> "; done
SHOTS=""; if ls $D/screens/site/*.png >/dev/null 2>&1; then mkdir -p $SITE/$INST/shots; cp $D/screens/site/*.png $SITE/$INST/shots/; for f in $SITE/$INST/shots/*.png; do n=$(basename $f); SHOTS+="<a href=\"shots/$n\"><img loading=lazy src=\"shots/$n\" alt=\"\"></a>"; done; fi
cat > $SITE/$INST/index.html <<H
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer"><meta property="og:title" content="Private page"><meta property="og:description" content="Nothing here">
<title>Pantry Chef v$V</title><link rel="icon" href="data:,">
<style>body{margin:0;background:#F7F4EE;color:#1F2A24;font:16px/1.5 system-ui,Roboto,sans-serif}main{max-width:640px;margin:auto;padding:24px 18px}
h1{font-size:28px;margin:4px 0}.btn{display:block;text-align:center;background:#2F7D57;color:#fff;font-weight:800;font-size:18px;padding:16px;border-radius:14px;text-decoration:none;margin:18px 0}
.card{background:#fff;border:1px solid #E6E1D8;border-radius:16px;padding:14px 16px;margin:12px 0}li{margin:4px 0}.small{font-size:12px;color:#9AA39D}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}.grid img{width:100%;border-radius:12px;border:1px solid #E6E1D8}</style></head><body><main>
<h1>🥕 Pantry Chef <span style="color:#2F7D57">v$V</span></h1>
<p>Keep track of the food in your fridge and pantry: what you have, how much is left, and what expires soon. Add a whole grocery trip by scanning the receipt or product barcodes. Get recipe ideas ranked by what you already have, and a shopping list for what's missing.</p>
<a class="btn" href="$APK" download>⬇ Download for Android ($SIZE MB)</a>
${NOTES:+<div class="card"><b>New in v$V:</b> $NOTES</div>}
<div class="card"><b>Already have an older version?</b> Download this one and tap <b>Update</b>. It installs over the old one (same signing key) and keeps your pantry. Don't uninstall first; uninstalling deletes your items.</div>
<div class="card"><b>New install (about 1 minute)</b><ol>
<li>Open this page in <b>Chrome</b> on your phone and tap <b>Download</b>.</li>
<li>Tap the downloaded file (from the notification, or Files → Downloads).</li>
<li>If Android says Chrome <b>isn't allowed to install unknown apps</b>, tap <b>Settings</b>, turn on <b>Allow from this source</b>, then go back.</li>
<li>Tap <b>Install</b>. If <b>Play Protect</b> warns about an unknown app, tap <b>More details → Install anyway</b>. That warning appears because the app isn't from the Play Store.</li>
<li>Open <b>Pantry Chef</b> and tap <b>🧾 Scan receipt</b>, <b>▦ Scan barcodes</b> or <b>＋ Add item</b>.</li></ol></div>
<div class="card"><b>Privacy:</b> your items, photos and notes stay on the phone. No account. Receipts are read on the phone (offline text recognition). The app only goes online to fetch recipe ideas from TheMealDB (only ingredient names are sent), to look up scanned barcodes on Open Food Facts (only the barcode number is sent) and to check this site for updates.</div>
${SHOTS:+<div class="card"><b>Screens</b><div class="grid" style="margin-top:8px">$SHOTS</div></div>}
${OLDER:+<p class="small">Older versions: $OLDER</p>}
<p class="small">Android 7+ · package com.pantrychef.app · v$V (build $VC) · SHA-256 starts $SHA · built $(TZ=America/Chicago date '+%a %b %-d, %-I:%M %p CT')</p>
</main></body></html>
H
jq -n --argjson vc "$VC" --arg v "$V" --arg url "https://$SLUG.here.now/$INST/$APK" --arg notes "${NOTES:-}" '{versionCode:$vc,versionName:$v,apkUrl:$url,notes:$notes}' > $SITE/$UPD/version.json
jq "del(.apkUrl)" $SITE/$UPD/version.json; echo "staged $V into $SITE"
