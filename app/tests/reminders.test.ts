// Use soon reminder text + item selection. Run: npx tsx tests/reminders.test.ts
import assert from 'node:assert/strict';
import type { Item } from '../src/types';
import { migrate, newId } from '../src/logic';
import { selectReminderItems, reminderContent, listNames, formatTime12, cleanReminderSettings } from '../src/reminders';

let n = 0; const t = (name: string, f: () => void) => { f(); n++; };
const now = new Date(2026, 10, 19, 15, 0); // 19 Nov 2026
const mk = (p: Partial<Item>): Item => ({
  id: newId(), name: 'x', category: 'Other', quantity: 1, unit: 'pcs', percentLeft: 100,
  purchasedOn: null, expiresOn: null, photoUri: null, notes: '', createdAt: 0, updatedAt: 0, ...p,
});

t('selects items expiring today through soonDays, soonest first', () => {
  const items = [
    mk({ name: 'eggs', expiresOn: '2026-11-21' }),
    mk({ name: 'spinach', expiresOn: '2026-11-20' }),
    mk({ name: 'milk', expiresOn: '2026-11-19' }),
    mk({ name: 'rice', expiresOn: '2026-11-22' }), // 3 days, outside a 2-day window
    mk({ name: 'flour', expiresOn: null }),
  ];
  const { expiring, expired } = selectReminderItems(items, 2, now);
  assert.deepEqual(expiring.map(i => i.name), ['milk', 'spinach', 'eggs']);
  assert.deepEqual(expired, []);
});

t('expired items are separate; used-up and undated items are skipped', () => {
  const items = [
    mk({ name: 'yogurt', expiresOn: '2026-11-17' }),
    mk({ name: 'berries', expiresOn: '2026-11-18' }),
    mk({ name: 'old milk', expiresOn: '2026-11-10', percentLeft: 0 }),
    mk({ name: 'mystery', expiresOn: null }),
    mk({ name: 'bread', expiresOn: '2026-11-20' }),
  ];
  const { expiring, expired } = selectReminderItems(items, 2, now);
  assert.deepEqual(expiring.map(i => i.name), ['bread']);
  assert.deepEqual(expired.map(i => i.name), ['yogurt', 'berries']); // oldest first
});

t('same-day names sort alphabetically', () => {
  const items = [mk({ name: 'spinach', expiresOn: '2026-11-20' }), mk({ name: 'apples', expiresOn: '2026-11-20' })];
  assert.deepEqual(selectReminderItems(items, 2, now).expiring.map(i => i.name), ['apples', 'spinach']);
});

t('example wording: 3 items expire within 2 days', () => {
  const items = [
    mk({ name: 'milk', expiresOn: '2026-11-19' }),
    mk({ name: 'spinach', expiresOn: '2026-11-20' }),
    mk({ name: 'eggs', expiresOn: '2026-11-21' }),
  ];
  const c = reminderContent(items, 2, now);
  assert.deepEqual(c, { title: 'Use soon', body: '3 items expire within 2 days: milk, spinach, eggs' });
});

t('singular wording and soonDays in the sentence', () => {
  const c = reminderContent([mk({ name: 'milk', expiresOn: '2026-11-21' })], 5, now);
  assert.deepEqual(c, { title: 'Use soon', body: '1 item expires within 5 days: milk' });
});

t('expired items get a separate short line', () => {
  const items = [
    mk({ name: 'milk', expiresOn: '2026-11-20' }),
    mk({ name: 'yogurt', expiresOn: '2026-11-17' }),
    mk({ name: 'berries', expiresOn: '2026-11-18' }),
  ];
  const c = reminderContent(items, 2, now);
  assert.equal(c!.body, '1 item expires within 2 days: milk\n2 already expired: yogurt, berries');
});

t('expired-only reminder has just the short line', () => {
  const c = reminderContent([mk({ name: 'yogurt', expiresOn: '2026-11-17' })], 2, now);
  assert.deepEqual(c, { title: 'Use soon', body: '1 already expired: yogurt' });
});

t('no matching items → no notification', () => {
  assert.equal(reminderContent([mk({ name: 'rice', expiresOn: '2026-12-01' }), mk({ name: 'gone', expiresOn: '2026-11-01', percentLeft: 0 })], 2, now), null);
  assert.equal(reminderContent([], 2, now), null);
});

t('lists at most 5 names, then "and N more"', () => {
  assert.equal(listNames(['a', 'b', 'c']), 'a, b, c');
  assert.equal(listNames(['a', 'b', 'c', 'd', 'e']), 'a, b, c, d, e');
  assert.equal(listNames(['a', 'b', 'c', 'd', 'e', 'f', 'g']), 'a, b, c, d, e, and 2 more');
  const items = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((name, i) => mk({ name, expiresOn: `2026-11-${19 + (i < 3 ? 0 : 1)}` }));
  const c = reminderContent(items, 2, now);
  assert.equal(c!.body, '6 items expire within 2 days: m1, m2, m3, m4, m5, and 1 more');
});

t('formatTime12', () => {
  assert.equal(formatTime12(9, 0), '9:00 AM');
  assert.equal(formatTime12(0, 5), '12:05 AM');
  assert.equal(formatTime12(12, 30), '12:30 PM');
  assert.equal(formatTime12(13, 0), '1:00 PM');
  assert.equal(formatTime12(23, 59), '11:59 PM');
});

t('cleanReminderSettings + migrate defaults and clamps', () => {
  assert.deepEqual(cleanReminderSettings({}), { remindersEnabled: false, reminderHour: 9, reminderMinute: 0 });
  assert.deepEqual(cleanReminderSettings({ remindersEnabled: true, reminderHour: 18, reminderMinute: 45 }), { remindersEnabled: true, reminderHour: 18, reminderMinute: 45 });
  assert.deepEqual(cleanReminderSettings({ remindersEnabled: 'yes', reminderHour: 24, reminderMinute: -1 }), { remindersEnabled: false, reminderHour: 9, reminderMinute: 0 });
  const fresh = migrate(null);
  assert.equal(fresh.settings.remindersEnabled, false);
  assert.equal(fresh.settings.reminderHour, 9);
  assert.equal(fresh.settings.reminderMinute, 0);
  const old = migrate({ items: [], settings: { soonDays: 3 } });
  assert.equal(old.settings.remindersEnabled, false);
  assert.equal(old.settings.reminderHour, 9);
  assert.equal(old.schema, 7);
  const kept = migrate({ settings: { remindersEnabled: true, reminderHour: 7, reminderMinute: 15 } });
  assert.equal(kept.settings.remindersEnabled, true);
  assert.equal(kept.settings.reminderHour, 7);
  assert.equal(kept.settings.reminderMinute, 15);
});

console.log(`reminders tests: ${n} passed`);
