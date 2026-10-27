// The ONE place that reads deploy-specific values (site slug, secret paths). They live in app/config.local.json (gitignored).
// A fresh clone has no such file, so it falls back to config.example.json (placeholders): it builds and tests, but can't update or publish.
// Metro treats a require() inside try/catch as optional, so a missing config.local.json doesn't break the bundle.
type Cfg = { slug: string; installPath: string; updateChannelPath: string };
let local: Cfg | null = null;
try { local = require('../config.local.json'); } catch { local = null; }
const example: Cfg = require('../config.example.json');
const cfg: Cfg = local ?? example;

/** false when running on the example placeholders (no real update channel) */
export const CONFIGURED = local != null && !/^YOUR/.test(cfg.slug);
/** Base URL of this app's own download site, with trailing slash. */
export const SITE = `https://${cfg.slug}.here.now/`;
/** STABLE update channel (never rename): a tiny JSON {versionCode, versionName, apkUrl, notes}. */
export const UPDATE_URL = `${SITE}${cfg.updateChannelPath}/version.json`;
