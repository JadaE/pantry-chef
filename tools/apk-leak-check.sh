#!/usr/bin/env bash
# Fail if an APK contains any private deploy value from app/config.local.json (keystorePassword, installPath, every neverPublishTo slug,
# and since v0.0.7 the here.now slug + updateChannelPath too: the public "store version" must carry no here.now link at all), any string
# value from ../pantry-chef/keys/*.json|*.txt (the original working folder) if present, the text "here.now" itself, or ships config.local.json. Searches every file inside the APK, including assets/index.android.bundle (the Hermes JS bundle).
# Usage: bash tools/apk-leak-check.sh <apk> [config.json]     Never prints the values: only which key leaked and in which file.
set -uo pipefail
APK=${1:?usage: apk-leak-check.sh <apk> [config.json]}
D=$(cd "$(dirname "$0")/.." && pwd); CFG=${2:-$D/app/config.local.json}
[ -f "$APK" ] || { echo "leak-check: no such APK" >&2; exit 2; }
[ -f "$CFG" ] || { echo "leak-check: no config to check against ($CFG)" >&2; exit 2; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT; chmod 700 "$TMP"
unzip -q -o "$APK" -d "$TMP/apk" || { echo "leak-check: cannot unzip APK" >&2; exit 2; }
HITS=0; CHECKED=0
check() { # label value
  local label=$1 val=$2
  [ -n "$val" ] && [ "${#val}" -ge 4 ] || return 0
  CHECKED=$((CHECKED+1))
  printf '%s' "$val" > "$TMP/pat"
  # UTF-8 and UTF-16LE (Hermes/dex may store strings either way)
  printf '%s' "$val" | iconv -f UTF-8 -t UTF-16LE > "$TMP/pat16" 2>/dev/null || true
  local f
  for f in "$TMP/pat" "$TMP/pat16"; do
    [ -s "$f" ] || continue
    while IFS= read -r hit; do echo "LEAK: $label found in ${hit#$TMP/apk/}"; HITS=$((HITS+1)); done < <(grep -rlaF -f "$f" "$TMP/apk" 2>/dev/null)
  done
}
check keystorePassword "$(jq -r '.keystorePassword // empty' "$CFG")"
check installPath "$(jq -r '.installPath // empty' "$CFG")"
while IFS= read -r v; do check neverPublishTo "$v"; done < <(jq -r '.neverPublishTo[]? // empty' "$CFG")
check slug "$(jq -r '.slug // empty' "$CFG" | grep -v '^YOUR' || true)"
check updateChannelPath "$(jq -r '.updateChannelPath // empty' "$CFG" | grep -v '^YOUR' || true)"
# values kept in the original working folder's keys/ (site config etc.), if this box has it. PC_KEYS_DIR overrides.
KD=${PC_KEYS_DIR:-$(cd "$D/.." && pwd)/pantry-chef/keys}
if [ -d "$KD" ]; then
  for f in "$KD"/*.json; do [ -f "$f" ] || continue; while IFS= read -r v; do case "$v" in *[[:space:]]*|/*) continue;; esac; check "keys/$(basename "$f")" "$v"; done < <(jq -r '[.. | strings] | .[]' "$f" 2>/dev/null); done
  for f in "$KD"/*.txt; do [ -f "$f" ] || continue; check "keys/$(basename "$f")" "$(tr -d '\r\n' < "$f")"; done
fi
check here.now-host "here.now"
n=$(find "$TMP/apk" -name 'config.local.json*' | wc -l); [ "$n" = 0 ] || { echo "LEAK: config.local.json is inside the APK"; HITS=$((HITS+1)); }
if [ "$HITS" -gt 0 ]; then echo "APK LEAK CHECK FAILED ($HITS hit(s))" >&2; exit 1; fi
echo "APK leak check OK: $CHECKED private value(s) searched in $(find "$TMP/apk" -type f | wc -l) files (incl. assets/index.android.bundle), 0 hits"
