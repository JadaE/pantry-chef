// Local "Use soon" reminder scheduling. No server, no push, no Firebase.
//
// Exact or boot-surviving alarms were stripped by plugins/withLocalNotificationsOnly.js
// (no SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM, and BOOT_COMPLETED is removed from the
// notifications receiver). Android may deliver the daily trigger late, and a phone
// restart drops the schedule until this app is opened again. syncUseSoonReminder() is
// the fallback: call it when the app opens (including returning to the foreground)
// and whenever pantry items or reminder settings change, so the next notification
// can be set again with up-to-date item names.
import { Platform, ToastAndroid } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { DB } from './types';
import { reminderContent, REMINDER_DEFAULT_HOUR, REMINDER_DEFAULT_MINUTE } from './reminders';

export const USE_SOON_CHANNEL = 'use-soon-reminders';
export const USE_SOON_ID = 'use-soon-reminder';
export const USE_SOON_TYPE = 'use-soon';

let channelReady = false;
async function ensureChannel() {
  if (channelReady) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(USE_SOON_CHANNEL, {
        name: 'Use soon reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250],
        sound: 'default',
      });
    }
    channelReady = true;
  } catch {}
}

/** Ask for notification permission. Call only when the user turns the reminder setting on. */
export async function requestReminderPermission(): Promise<boolean> {
  try {
    await ensureChannel();
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted && p.canAskAgain) p = await Notifications.requestPermissionsAsync();
    return !!p.granted;
  } catch { return false; }
}

async function hasPermission(): Promise<boolean> {
  try {
    const p = await Notifications.getPermissionsAsync();
    return !!p.granted;
  } catch { return false; }
}

export async function cancelUseSoonReminder() {
  try { await Notifications.cancelScheduledNotificationAsync(USE_SOON_ID); } catch {}
}

/** Schedule or cancel the daily local reminder to match the current pantry + settings. Does not ask for permission. */
export async function syncUseSoonReminder(db: DB) {
  const enabled = db.settings.remindersEnabled === true;
  if (!enabled) { await cancelUseSoonReminder(); return; }
  if (!(await hasPermission())) { await cancelUseSoonReminder(); return; }
  const body = reminderContent(db.items, db.settings.soonDays);
  if (!body) { await cancelUseSoonReminder(); return; }
  const hour = Number.isInteger(db.settings.reminderHour) ? db.settings.reminderHour! : REMINDER_DEFAULT_HOUR;
  const minute = Number.isInteger(db.settings.reminderMinute) ? db.settings.reminderMinute! : REMINDER_DEFAULT_MINUTE;
  try {
    await ensureChannel();
    await cancelUseSoonReminder();
    await Notifications.scheduleNotificationAsync({
      identifier: USE_SOON_ID,
      content: { title: body.title, body: body.body, sound: 'default', data: { type: USE_SOON_TYPE } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: USE_SOON_CHANNEL },
    });
  } catch {
    try { ToastAndroid.show('Could not schedule the Use soon reminder.', ToastAndroid.SHORT); } catch {}
  }
}

export function isUseSoonNotification(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { type?: unknown }).type === USE_SOON_TYPE;
}
