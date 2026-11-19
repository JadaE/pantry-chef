// Pure "Use soon" reminder text and item selection (no React Native), so it can be unit-tested with tsx.
// Scheduling (expo-notifications, local-only) lives in reminderSchedule.ts.
import type { Item } from './types';
import { expiryStatus, parseISO } from './logic';

const MAX_NAMES = 5;
export const REMINDER_DEFAULT_HOUR = 9;
export const REMINDER_DEFAULT_MINUTE = 0;

export type ReminderPick = { name: string; expiresOn: string };

function byExpiryThenName(a: ReminderPick, b: ReminderPick): number {
  const da = parseISO(a.expiresOn)?.getTime() ?? 0, db = parseISO(b.expiresOn)?.getTime() ?? 0;
  return da === db ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : da - db;
}

/** Items that belong in a Use soon reminder. Skips used-up (0% left) and undated items. */
export function selectReminderItems(
  items: Array<Pick<Item, 'name' | 'expiresOn' | 'percentLeft'>>,
  soonDays: number,
  now = new Date(),
): { expiring: ReminderPick[]; expired: ReminderPick[] } {
  const expiring: ReminderPick[] = [], expired: ReminderPick[] = [];
  for (const it of items) {
    if ((it.percentLeft ?? 100) <= 0 || !it.expiresOn) continue;
    const s = expiryStatus(it, soonDays, now);
    if (s === 'today' || s === 'soon') expiring.push({ name: it.name, expiresOn: it.expiresOn });
    else if (s === 'expired') expired.push({ name: it.name, expiresOn: it.expiresOn });
  }
  expiring.sort(byExpiryThenName);
  expired.sort(byExpiryThenName);
  return { expiring, expired };
}

export function listNames(names: string[]): string {
  if (names.length <= MAX_NAMES) return names.join(', ');
  return `${names.slice(0, MAX_NAMES).join(', ')}, and ${names.length - MAX_NAMES} more`;
}

/** 24-hour hour/minute → "9:00 AM". */
export function formatTime12(hour: number, minute: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const m = ((Math.floor(minute) % 60) + 60) % 60;
  const h12 = h % 12 || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h12}:${m < 10 ? '0' : ''}${m} ${ampm}`;
}

export type ReminderContent = { title: string; body: string };

/** One daily notification's title + body, or null when there is nothing to mention. */
export function reminderContent(
  items: Array<Pick<Item, 'name' | 'expiresOn' | 'percentLeft'>>,
  soonDays: number,
  now = new Date(),
): ReminderContent | null {
  const { expiring, expired } = selectReminderItems(items, soonDays, now);
  if (!expiring.length && !expired.length) return null;
  const lines: string[] = [];
  if (expiring.length) {
    const n = expiring.length;
    const verb = n === 1 ? 'item expires' : 'items expire';
    lines.push(`${n} ${verb} within ${soonDays} day${soonDays === 1 ? '' : 's'}: ${listNames(expiring.map(i => i.name))}`);
  }
  if (expired.length) lines.push(`${expired.length} already expired: ${listNames(expired.map(i => i.name))}`);
  return { title: 'Use soon', body: lines.join('\n') };
}

/** Clamp stored reminder settings; used by migrate(). */
export function cleanReminderSettings(s: { remindersEnabled?: unknown; reminderHour?: unknown; reminderMinute?: unknown }): {
  remindersEnabled: boolean; reminderHour: number; reminderMinute: number;
} {
  const h = Number(s.reminderHour), m = Number(s.reminderMinute);
  return {
    remindersEnabled: s.remindersEnabled === true,
    reminderHour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : REMINDER_DEFAULT_HOUR,
    reminderMinute: Number.isInteger(m) && m >= 0 && m <= 59 ? m : REMINDER_DEFAULT_MINUTE,
  };
}
