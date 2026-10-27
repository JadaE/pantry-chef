// Cooking timers. A timer is just an end time stored in the DB, so it keeps counting while you are on another step
// or have left the app. A LOCAL notification (no server, no push) is scheduled for the moment it ends.
import { Platform, ToastAndroid } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { DB, CookTimer } from './types';
import { newId } from './logic';

const CHANNEL = 'cooking-timers';
let inited = false;
export async function initNotifications() {
  if (inited) return; inited = true;
  try {
    Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Cooking timers', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 400, 250, 400], sound: 'default' });
  } catch {}
}
async function allowed(): Promise<boolean> {
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted && p.canAskAgain) p = await Notifications.requestPermissionsAsync();
    return !!p.granted;
  } catch { return false; }
}
async function schedule(seconds: number, title: string, body: string): Promise<string | null> {
  try {
    if (!(await allowed())) return null;
    await initNotifications();
    return await Notifications.scheduleNotificationAsync({ content: { title, body, sound: 'default' }, trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.round(seconds)), channelId: CHANNEL } });
  } catch { return null; }
}
const unschedule = async (id?: string | null) => { if (id) { try { await Notifications.cancelScheduledNotificationAsync(id); } catch {} } };

type Upd = (f: (d: DB) => DB) => void;
export async function startTimer(update: Upd, p: { recipeId: string; recipeName: string; step: number; label: string; seconds: number }) {
  const endsAt = Date.now() + p.seconds * 1000;
  const notifId = await schedule(p.seconds, `⏱ ${p.label} timer is up`, `${p.recipeName} · step ${p.step + 1}`);
  const t: CookTimer = { id: newId(), recipeId: p.recipeId, recipeName: p.recipeName, step: p.step, label: p.label, seconds: p.seconds, endsAt, notifId };
  update(d => ({ ...d, timers: [...(d.timers || []), t] }));
  if (!notifId) { try { ToastAndroid.show('Timer started. Allow notifications in Android settings to be alerted when you are in another app.', ToastAndroid.LONG); } catch {} }
}
export async function cancelTimer(update: Upd, t: Pick<CookTimer, 'id' | 'notifId'>) {
  update(d => ({ ...d, timers: (d.timers || []).filter(x => x.id !== t.id) }));
  await unschedule(t.notifId);
}
/** drop timers that finished more than 6 hours ago (called at launch) */
export function pruneTimers(update: Upd) { update(d => (d.timers?.some(t => t.endsAt < Date.now() - 6 * 3600 * 1000) ? { ...d, timers: d.timers.filter(t => t.endsAt >= Date.now() - 6 * 3600 * 1000) } : d)); }
