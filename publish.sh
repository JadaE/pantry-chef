#!/usr/bin/env bash
# Publish Pantry Chef (Android) to its OWN here.now Site:  bash publish.sh     (DRY_RUN=1 bash publish.sh  = stage + verify, upload nothing)
# Stages the new APK + install page + version.json INTO the existing site folder (config key publishSiteDir) and uploads that WHOLE folder.
# Site layout (never delete an older version):
#   index.html   blank root ("Nothing here", noindex)      robots.txt  Disallow: /
#   <installPath>/          install page + every PantryChef-v*.apk   (secret)
#   <updateChannelPath>/version.json                    (stable update channel compiled into the app)
# Reads everything from app/config.local.json (gitignored) with jq. Refuses: missing/relative publishSiteDir, a folder without the existing
# APKs / install page / update channel, example placeholders, every slug in neverPublishTo, an APK that contains private config,
# and a version older than the one already published. Never prints the API key.
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)
. "$D/tools/site-common.sh"; load_site_config
DRY=${DRY_RUN:-0}
V=$(node -e "console.log(require('$D/app/app.json').expo.version)"); VC=$(node -e "console.log(require('$D/app/app.json').expo.android.versionCode)")
[ -f "$D/dist/PantryChef-v$V.apk" ] || { echo "dist/PantryChef-v$V.apk not found: run build-apk.sh first" >&2; exit 1; }
CUR=$(jq -r '.versionCode // 0' "$SITE_REAL/$UPD/version.json")
[ "$VC" -ge "$CUR" ] || { echo "Refusing: published versionCode is $CUR, this build is $VC (older)" >&2; exit 1; }
PUB=$(ls -d /home/box/agent-data/plugins/cache/cursor-public/here_now/*/skills/here-now/scripts/publish.sh | head -1)
[ -n "${HERENOW_API_KEY:-}" ] || [ -f "$HOME/.herenow/credentials" ] || { echo "No here.now API key" >&2; exit 1; }
if [ "$DRY" = 1 ]; then SITE=$(mktemp -d /tmp/pc-publish-dryrun.XXXXXX); cp -a "$SITE_REAL"/. "$SITE"/; trap 'rm -rf "$SITE"' EXIT; else SITE=$SITE_REAL; fi
STAGE_TO=$SITE bash "$D/tools/make_site.sh"
cat > $SITE/index.html <<'H'
<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer"><meta property="og:title" content="Nothing here"><meta property="og:description" content="Private page"><title>Nothing here</title><link rel="icon" href="data:,"></head><body style="background:#fff"><p style="font:14px system-ui;color:#999;text-align:center;margin-top:40vh">Nothing here.</p></body></html>
H
printf 'User-agent: *\nDisallow: /\n' > $SITE/robots.txt
validate_site_dir "$SITE" "staged site"
[ "$(jq -r .versionCode "$SITE/$UPD/version.json")" = "$VC" ] || { echo "staged version.json does not point at v$V; NOT publishing" >&2; exit 1; }
[ -f "$SITE/$INST/PantryChef-v$V.apk" ] || { echo "staged APK missing; NOT publishing" >&2; exit 1; }
KEYVAL="${HERENOW_API_KEY:-$(cat "$HOME/.herenow/credentials" 2>/dev/null || true)}"
if [ -n "$KEYVAL" ] && grep -rqF -- "$KEYVAL" "$SITE"; then echo "API key in site files; NOT publishing" >&2; exit 1; fi
if grep -rqF -- "$(jq -r .keystorePassword $CFG)" "$SITE"; then echo "keystore password in site files; NOT publishing" >&2; exit 1; fi
find $SITE -name '*.keystore' | grep -q . && { echo "keystore in site; NOT publishing" >&2; exit 1; }
if [ "$DRY" = 1 ]; then
  echo "DRY RUN OK: would upload the whole site folder (staged copy of publishSiteDir) to the here.now site (slug hidden) :"
  (cd "$SITE" && find . -type f | sed 's#^\./##' | sort | while read -r f; do printf '  %10s  %s\n' "$(stat -c %s "$f")" "$(echo "$f" | sed "s#$INST#<installPath>#; s#$UPD#<updateChannelPath>#")"; done)
  echo "  version.json -> versionCode $VC, versionName $V (previously published: $CUR)"
  echo "NOT published (DRY_RUN=1)."; exit 0
fi
cd $D
ARGS=("$SITE" --client cursor); [ -n "$SLUG" ] && ARGS+=(--slug "$SLUG")
OUT=$(bash "$PUB" "${ARGS[@]}" 2>&1) || { echo "$OUT" | grep -viE 'bearer|api_key|claim' >&2; echo "PUBLISH FAILED" >&2; exit 1; }
echo "$OUT" | grep -iE 'publish_result\.(persistence|auth_mode)|warn|error' || true
NEW=$(echo "$OUT" | sed -n 's/^publish_result\.site_url=//p' | tail -1 | sed -E 's#^https://([^.]+)\.here\.now/?$#\1#')
[ -n "$NEW" ] || { echo "could not read slug" >&2; exit 1; }
if [ -z "$SLUG" ]; then jq --arg s "$NEW" '.slug=$s' $CFG > $CFG.tmp && chmod 600 $CFG.tmp && mv $CFG.tmp $CFG; SLUG=$NEW; echo "Created Site $SLUG"; fi
[ "$NEW" = "$SLUG" ] || { echo "published to $NEW, expected $SLUG" >&2; exit 1; }
echo "Published $SLUG"
[ "${SHOW_URL:-}" = 1 ] && { echo "Install: https://$SLUG.here.now/$INST/"; echo "Update channel: https://$SLUG.here.now/$UPD/version.json"; } || true
