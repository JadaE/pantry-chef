#!/usr/bin/env bash
# Local signed release build of Pantry Chef (no EAS). Pattern copied from fantasy-football + photo-cleanup/android build-apk.sh, own keystore.
# Usage: bash build-apk.sh   (from anywhere; finds its own folder). Deploy values come from app/config.local.json (gitignored);
# without it the build uses app/config.example.json (placeholders: it builds, but has no update channel and can't publish).
set -euo pipefail
export JAVA_HOME=$HOME/jdk17 ANDROID_HOME=$HOME/android-sdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH
ROOT=$(cd "$(dirname "$0")" && pwd); APP=$ROOT/app
CFG=$APP/config.local.json; [ -f "$CFG" ] || { CFG=$APP/config.example.json; echo "NOTE: app/config.local.json missing, building with config.example.json" >&2; }
cd $APP
AJ=$(node -e "const a=require('./app.json').expo;console.log(a.version+':'+a.android.versionCode)")
VT=$(node -e "const s=require('fs').readFileSync('src/version.ts','utf8');console.log(s.match(/VERSION_NAME = '([^']+)'/)[1]+':'+s.match(/VERSION_CODE = (\\d+)/)[1])")
[ "$AJ" = "$VT" ] || { echo "Version mismatch: app.json $AJ vs src/version.ts $VT" >&2; exit 1; }
V=${AJ%%:*}
npx tsc --noEmit -p . && npx tsx tests/logic.test.ts | tail -1 && npx tsx tests/receipt.test.ts | tail -1 && npx tsx tests/config.test.ts | tail -1
[ -d android ] || npx expo prebuild -p android --no-install
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
G=android/app/build.gradle
# keep the native project's version in step with app.json (prebuild only runs when android/ is missing)
sed -i -E "s/^( *)versionCode [0-9]+/\1versionCode ${AJ##*:}/; s/^( *)versionName \"[^\"]*\"/\1versionName \"${AJ%%:*}\"/" $G
grep -q "versionCode ${AJ##*:}$" $G || { echo "could not set versionCode in $G" >&2; exit 1; }
if ! grep -q "PC_RELEASE_SIGNING" $G; then
python3 - "$G" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace("""    signingConfigs {
        debug {""","""    signingConfigs {
        release { // PC_RELEASE_SIGNING
            storeFile file(System.getenv('PC_KEYSTORE'))
            storePassword System.getenv('PC_KEYPASS')
            keyAlias 'pantrychef'
            keyPassword System.getenv('PC_KEYPASS')
        }
        debug {""",1)
i=s.index("        release {\n            // Caution!")
j=s.index("signingConfig signingConfigs.debug",i)
s=s[:j]+"signingConfig signingConfigs.release"+s[j+len("signingConfig signingConfigs.debug"):]
open(p,'w').write(s)
PY
fi
export PC_KEYSTORE=$ROOT/keys/pantrychef.keystore
export PC_KEYPASS=$(jq -r .keystorePassword "$CFG")
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 -Dorg.gradle.jvmargs="-Xmx3g -XX:MaxMetaspaceSize=768m" -Pkotlin.daemon.jvmargs=-Xmx1536m --max-workers=2 --no-daemon
OUT=app/build/outputs/apk/release/app-release.apk
BADGE=$($(ls -d $ANDROID_HOME/build-tools/* | tail -1)/aapt2 dump badging $OUT | awk "NR==1")
echo "$BADGE" | grep -q "versionCode='${AJ##*:}' versionName='${AJ%%:*}'" || { echo "APK version mismatch: $BADGE" >&2; exit 1; }
mkdir -p $ROOT/dist && cp $OUT $ROOT/dist/PantryChef-v$V.apk
$ANDROID_HOME/build-tools/35.0.0/apksigner verify --print-certs $ROOT/dist/PantryChef-v$V.apk | grep -E "Signer #1 certificate (DN|SHA-256)"
ls -la $ROOT/dist
echo BUILD_OK
