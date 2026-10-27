// The ONE place app code reads deploy-specific values (site slug, update channel path).
// build-apk.sh writes src/generated/appconfig.json (gitignored) holding ONLY { slug, updateChannelPath } from config.local.json.
// App code must NEVER import config.local.json: Metro would bake every key in it (keystore password, install path, ...) into the APK.
// A fresh clone has no generated file, so it falls back to config.example.json (placeholders): it builds and tests, but can't update or publish.
// Metro treats a require() inside try/catch as optional, so a missing generated file doesn't break the bundle.
type Cfg = { slug: string; updateChannelPath: string };
let generated: Cfg | null = null;
try { generated = require('./generated/appconfig.json'); } catch { generated = null; }
const example: Cfg = require('../config.example.json');
const cfg: Cfg = generated ?? example;

/** false when running on the example placeholders (no real update channel) */
export const CONFIGURED = generated != null && !/^YOUR/.test(cfg.slug);
/** Base URL of this app's own download site, with trailing slash. */
export const SITE = `https://${cfg.slug}.here.now/`;
/** STABLE update channel (never rename): a tiny JSON {versionCode, versionName, apkUrl, notes}. */
export const UPDATE_URL = `${SITE}${cfg.updateChannelPath}/version.json`;
