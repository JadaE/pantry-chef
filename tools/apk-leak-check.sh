#!/usr/bin/env bash
# Fail if an APK contains any private deploy value from app/config.local.json (keystorePassword, installPath, every neverPublishTo slug),
# or ships config.local.json itself. Searches every file inside the APK, including assets/index.android.bundle (the Hermes JS bundle).
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
n=$(find "$TMP/apk" -name 'config.local.json*' | wc -l); [ "$n" = 0 ] || { echo "LEAK: config.local.json is inside the APK"; HITS=$((HITS+1)); }
if [ "$HITS" -gt 0 ]; then echo "APK LEAK CHECK FAILED ($HITS hit(s))" >&2; exit 1; fi
echo "APK leak check OK: $CHECKED private value(s) searched in $(find "$TMP/apk" -type f | wc -l) files (incl. assets/index.android.bundle), 0 hits"
