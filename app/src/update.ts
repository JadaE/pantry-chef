// "Update available" check: GET the public GitHub "latest release" of the app's public repo (see config.ts). Nothing about the
// user is sent (plain unauthenticated GET). Offline, rate-limited (403/429) or malformed answers fail quietly unless the user
// tapped "Check for updates". Downloading opens the release's .apk asset in the browser.
import { Linking } from 'react-native';
import { VERSION_CODE } from './version';
import { UPDATE_URL, DOWNLOAD_RE } from './config';
import { loadSetting, saveSetting } from './store';
import { parseRelease, validCached, UpdateInfo } from './updateParse';
export type { UpdateInfo } from './updateParse';
const HOUR = 3600000;
/** Returns {info: newer release or null, latest}. Throttled to once per 6h unless force. Throws only when force. */
export async function checkForUpdate(force = false): Promise<{ info: UpdateInfo | null; latest: UpdateInfo | null; checkedAt: number }> {
  const last = Number((await loadSetting('upd:lastCheck')) || 0);
  if (!force && Date.now() - last < 6 * HOUR) {
    let c: UpdateInfo | null = null;
    try { c = validCached(JSON.parse((await loadSetting('upd:latest')) || 'null'), DOWNLOAD_RE); } catch {}
    return { info: c && c.versionCode > VERSION_CODE ? c : null, latest: c, checkedAt: last };
  }
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    let r: Response;
    try { r = await fetch(UPDATE_URL, { method: 'GET', headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PantryChef' }, signal: ctl.signal }); }
    finally { clearTimeout(t); }
    if (r.status === 404) { // no published release yet: treat as up to date
      const now = Date.now(); await saveSetting('upd:lastCheck', String(now)); return { info: null, latest: null, checkedAt: now };
    }
    if (!r.ok) throw new Error('HTTP ' + r.status); // 403/429 = rate limited
    const j = parseRelease(await r.json(), DOWNLOAD_RE);
    if (!j) throw new Error('Bad release');
    const now = Date.now();
    await saveSetting('upd:lastCheck', String(now)); await saveSetting('upd:latest', JSON.stringify(j));
    return { info: j.versionCode > VERSION_CODE ? j : null, latest: j, checkedAt: now };
  } catch (e) {
    if (force) throw e;
    return { info: null, latest: null, checkedAt: last };
  }
}
export const openDownload = (u: UpdateInfo) => Linking.openURL(u.apkUrl);
export async function dismissed() { return Number((await loadSetting('upd:dismissed')) || 0); }
export async function dismiss(code: number) { await saveSetting('upd:dismissed', String(code)); }
