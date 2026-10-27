// Keep in sync with app.json (expo.version / android.versionCode). build-apk.sh checks this.
export const VERSION_NAME = '0.0.2';
export const VERSION_CODE = 2;
export const SITE = 'https://YOUR-SITE-SLUG.here.now/';
/** STABLE update channel (never rename): a tiny JSON {versionCode, versionName, apkUrl, notes} */
export const UPDATE_URL = SITE + 'YOUR_SECRET_PATH/version.json';
