// On-device storage: one JSON document in AsyncStorage (plus small caches). No accounts, no backend.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DB } from './types';
import { migrate } from './logic';

const KEY = 'pantrychef:db';
export async function loadDB(): Promise<DB> {
  try { const s = await AsyncStorage.getItem(KEY); return migrate(s ? JSON.parse(s) : null); } catch { return migrate(null); }
}
let timer: any = null; let pending: DB | null = null;
export function saveDB(db: DB) {
  pending = db;
  if (timer) return;
  timer = setTimeout(async () => { timer = null; const d = pending; pending = null; if (d) { try { await AsyncStorage.setItem(KEY, JSON.stringify(d)); } catch {} } }, 250);
}
export async function flushDB() { if (timer) { clearTimeout(timer); timer = null; } if (pending) { const d = pending; pending = null; await AsyncStorage.setItem(KEY, JSON.stringify(d)); } }

// small key/value + JSON cache with max age
export const loadSetting = (k: string) => AsyncStorage.getItem('pantrychef:set:' + k);
export const saveSetting = (k: string, v: string) => AsyncStorage.setItem('pantrychef:set:' + k, v);
export async function cacheGet<T>(k: string, maxAgeMs: number): Promise<T | undefined> {
  try { const s = await AsyncStorage.getItem('pantrychef:cache:' + k); if (!s) return undefined; const o = JSON.parse(s); if (Date.now() - o.t > maxAgeMs) return undefined; return o.v as T; } catch { return undefined; }
}
export async function cacheSet(k: string, v: any) { try { await AsyncStorage.setItem('pantrychef:cache:' + k, JSON.stringify({ t: Date.now(), v })); } catch {} }
export async function clearCaches() { const ks = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith('pantrychef:cache:')); await AsyncStorage.multiRemove(ks); return ks.length; }
