# shared by publish.sh and tools/make_site.sh (sourced). Validates config + the staged site folder; never prints secrets.
# Sets: CFG SLUG INST UPD SITE_REAL
load_site_config() {
  CFG=$D/app/config.local.json
  [ -f "$CFG" ] || { echo "app/config.local.json missing: copy app/config.example.json and fill it in. Refusing to run on the example file." >&2; exit 1; }
  SLUG=$(jq -r '.slug//empty' "$CFG"); INST=$(jq -r '.installPath//empty' "$CFG"); UPD=$(jq -r '.updateChannelPath//empty' "$CFG"); SITE_REAL=$(jq -r '.publishSiteDir//empty' "$CFG")
  case "$SLUG$INST$UPD$SITE_REAL" in *YOUR-SITE-SLUG*|*YOUR_SECRET_PATH*|*YOUR_UPDATE_CHANNEL_PATH*|*ABSOLUTE/PATH*) echo "config still has placeholder values; refusing" >&2; exit 1;; esac
  [ -n "$SLUG" ] && [ -n "$INST" ] && [ -n "$UPD" ] || { echo "config is missing slug / installPath / updateChannelPath; refusing" >&2; exit 1; }
  jq -e --arg s "$SLUG" '(.neverPublishTo // []) | index($s) | not' "$CFG" >/dev/null || { echo "Refusing: $SLUG is listed in neverPublishTo (belongs to another project)" >&2; exit 1; }
  [ -n "$SITE_REAL" ] || { echo "config key publishSiteDir is missing; refusing (it must point at the existing staged site folder)" >&2; exit 1; }
  case "$SITE_REAL" in /*) ;; *) echo "publishSiteDir must be an absolute path; refusing" >&2; exit 1;; esac
  validate_site_dir "$SITE_REAL" "publishSiteDir"
}
# the folder must already be the real staged site: older APK(s), the install page and the update channel
validate_site_dir() { # dir label
  local d=$1 l=$2
  [ -d "$d" ] || { echo "$l: folder does not exist; refusing" >&2; exit 1; }
  ls "$d/$INST"/PantryChef-v*.apk >/dev/null 2>&1 || { echo "$l: no existing PantryChef-v*.apk under the install path; this is not the real site folder; refusing" >&2; exit 1; }
  [ -f "$d/$INST/index.html" ] || { echo "$l: install page missing; refusing" >&2; exit 1; }
  [ -f "$d/$UPD/version.json" ] || { echo "$l: update channel version.json missing; refusing" >&2; exit 1; }
}
