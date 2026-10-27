// "Update available" check (same pattern as the other sideloaded apps): GET a small version.json from the app's
// stable, unguessable update channel on its own here.now site. Nothing is sent. Downloading opens the browser.
import { Linking } from 'react-native';
import { VERSION_CODE } from './version';
import { UPDATE_URL, SITE, CONFIGURED } from './config';
import { loadSetting, saveSetting } from './store';
const HOUR = 3600000;
export type UpdateInfo = { versionCode: number; versionName: string; apkUrl: string; notes: string };
function valid(j: any): UpdateInfo | null {
  if (!j || !Number.isInteger(j.versionCode) || typeof j.apkUrl !== 'string' || typeof j.versionName !== 'string') return null;
  if (!j.apkUrl.startsWith(SITE)) return null; // only ever open our own download site
  return { versionCode: j.versionCode, versionName: j.versionName.slice(0, 20), apkUrl: j.apkUrl, notes: String(j.notes || '').slice(0, 400) };
}
/** Returns {info: newer release or null, latest}. Throttled to once per 6h unless force. Throws only when force. */
export async function checkForUpdate(force = false): Promise<{ info: UpdateInfo | null; latest: UpdateInfo | null; checkedAt: number }> {
  const last = Number((await loadSetting('upd:lastCheck')) || 0);
  if (!CONFIGURED) { if (force) throw new Error('No update channel configured'); return { info: null, latest: null, checkedAt: last }; } // build made from config.example.json
  if (!force && Date.now() - last < 6 * HOUR) {
    let c: UpdateInfo | null = null;
    try { c = valid(JSON.parse((await loadSetting('upd:latest')) || 'null')); } catch {}
    return { info: c && c.versionCode > VERSION_CODE ? c : null, latest: c, checkedAt: last };
  }
  try {
    const r = await fetch(UPDATE_URL + '?t=' + Date.now(), { method: 'GET', headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = valid(await r.json());
    if (!j) throw new Error('Bad version file');
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
