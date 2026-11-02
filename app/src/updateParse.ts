// Pure parsing for the update check (no React Native imports, so tests can run it with tsx).
// Source: GitHub "latest release" JSON. Convention (enforced by build-apk.sh): versionCode = major*10000 + minor*100 + patch,
// so a tag vX.Y.Z alone gives the versionCode. A "versionCode: N" line in the release body, if present, wins.
export type UpdateInfo = { versionCode: number; versionName: string; apkUrl: string; notes: string };

export function codeFromName(name: string): number | null {
  const m = /^v?(\d{1,3})\.(\d{1,2})\.(\d{1,2})$/.exec(String(name || '').trim());
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : null;
}

/** Turns a GitHub release object into UpdateInfo, or null if it isn't a usable release of this app. */
export function parseRelease(j: any, dl: RegExp): UpdateInfo | null {
  if (!j || typeof j !== 'object' || j.draft || j.prerelease) return null;
  const tag = typeof j.tag_name === 'string' ? j.tag_name.trim() : '';
  const fromTag = codeFromName(tag);
  const body = typeof j.body === 'string' ? j.body : '';
  const bm = /versionCode\s*[:=]\s*(\d{1,9})\b/i.exec(body);
  const versionCode = bm ? Number(bm[1]) : fromTag;
  if (versionCode == null || !Number.isInteger(versionCode) || versionCode <= 0) return null;
  const asset = (Array.isArray(j.assets) ? j.assets : []).find((a: any) => a && typeof a.name === 'string' && /\.apk$/i.test(a.name) && typeof a.browser_download_url === 'string');
  if (!asset || !dl.test(asset.browser_download_url)) return null; // only ever open this repo's own release downloads
  const notes = body.replace(/^.*versionCode\s*[:=]\s*\d+.*$/gim, '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 400);
  return { versionCode, versionName: (tag.replace(/^v/, '') || String(versionCode)).slice(0, 20), apkUrl: asset.browser_download_url, notes };
}

/** Re-validates a cached UpdateInfo (cache may hold a value saved by an older version that used the old private download site). */
export function validCached(j: any, dl: RegExp): UpdateInfo | null {
  if (!j || !Number.isInteger(j.versionCode) || typeof j.apkUrl !== 'string' || typeof j.versionName !== 'string') return null;
  if (!dl.test(j.apkUrl)) return null;
  return { versionCode: j.versionCode, versionName: j.versionName.slice(0, 20), apkUrl: j.apkUrl, notes: String(j.notes || '').slice(0, 400) };
}
