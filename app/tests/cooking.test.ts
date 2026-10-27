import assert from 'node:assert/strict';
import * as K from '../src/cooking';
import * as L from '../src/logic';
import type { Item } from '../src/types';
let n = 0; const t = (name: string, f: () => void) => { try { f(); n++; } catch (e) { console.error('FAIL:', name); throw e; } };
const secs = (s: string) => K.detectTimes(s).map(x => x.seconds);

t('detects common time phrases', () => {
  assert.deepEqual(secs('Simmer for 10 minutes, stirring now and then.'), [600]);
  assert.deepEqual(secs('Bake for 1 hr until golden.'), [3600]);
  assert.deepEqual(secs('Boil the pasta 8-10 mins, drain.'), [480]); // range -> lower end
  assert.deepEqual(secs('Rest the meat for 5 to 10 minutes.'), [300]);
  assert.deepEqual(secs('Cook 30 seconds more.'), [30]);
  assert.deepEqual(secs('Marinate for 2 hours.'), [7200]);
  assert.deepEqual(secs('Leave it for a minute, then add an hour of patience'), [60, 3600]);
  assert.deepEqual(secs('Simmer for ten minutes'), [600]);
  assert.deepEqual(secs('Bake about half an hour.'), [1800]);
  assert.deepEqual(secs('Cook for 1½ hours.'), [5400]);
  assert.deepEqual(secs('Cook for 1 1/2 hours.'), [5400]);
});
t('merges hour + minutes and ignores non-times', () => {
  assert.deepEqual(secs('Roast for 1 hour 30 minutes.'), [5400]);
  assert.deepEqual(secs('Roast for 1 hour and 15 minutes, then rest 10 minutes.'), [4500, 600]);
  assert.deepEqual(secs('Preheat the oven to 350F / 180C. Add 2 tbsp oil and 3 cloves of garlic.'), []);
  assert.deepEqual(secs('Add 200 g flour. Use a medium pan, 24 cm.'), []);
  assert.deepEqual(secs('Stir in the 2 minced onions and a minimal amount of salt'), []);
  assert.deepEqual(secs('Hourly checks are fine; 3 mints on top'), []);
});
t('labels and segments', () => {
  const m = K.detectTimes('Cook 10 minutes per side.');
  assert.equal(m[0].label, '10 min'); assert.equal(m[0].text, '10 minutes');
  const segs = K.stepSegments('Cook 10 minutes per side, then rest 2 min.');
  assert.equal(segs.map(s => s.text).join(''), 'Cook 10 minutes per side, then rest 2 min.');
  assert.equal(segs.filter(s => s.time).length, 2);
  assert.equal(K.stepSegments('Mix well.').length, 1);
  assert.equal(K.fmtDuration(5400), '1 hr 30 min'); assert.equal(K.fmtClock(65), '1:05'); assert.equal(K.fmtClock(3725), '1:02:05'); assert.equal(K.fmtClock(-4), '0:00');
});
t('timers', () => {
  const tm = { endsAt: 10_000 };
  assert.equal(K.timerRemaining(tm, 4_000), 6); assert.equal(K.timerRemaining(tm, 4_500), 6); assert.equal(K.timerRemaining(tm, 20_000), 0);
  assert.equal(K.timerDone(tm, 9_999), false); assert.equal(K.timerDone(tm, 10_000), true);
});
t('realistic TheMealDB-style recipe steps', () => {
  const steps = L.splitSteps('Heat the oil in a large pan. Add the onion and fry for 5 minutes until soft.\r\nAdd garlic and cook for 1 minute.\r\nPour in the tomatoes, bring to the boil, then simmer gently for 20-25 minutes.\r\nMeanwhile cook the pasta according to the packet instructions (about 10 min).');
  assert.equal(steps.length, 4);
  assert.deepEqual(steps.map(s => secs(s)), [[300], [60], [1200], [600]]);
});
const item = (o: Partial<Item>): Item => ({ id: 'x', name: 'Item', category: 'Other', quantity: 1, unit: 'pcs', percentLeft: 100, purchasedOn: null, expiresOn: null, photoUri: null, notes: '', createdAt: 0, updatedAt: 0, ...o });
const recipe = { ingredients: [{ name: 'Chicken Breast', measure: '2' }, { name: 'Onion', measure: '1' }, { name: 'Salt', measure: 'pinch' }, { name: 'Tomato Puree', measure: '2 tbs' }, { name: 'Basil', measure: 'handful' }] };
t('used from pantry: matching, staples, one item once', () => {
  const items = [
    item({ id: 'c1', name: 'Boneless skinless chicken breast', percentLeft: 100, expiresOn: '2026-11-02' }),
    item({ id: 'c2', name: 'Chicken breast', percentLeft: 50, expiresOn: '2026-10-30' }),
    item({ id: 'o', name: 'Yellow onions', percentLeft: 75 }), item({ id: 's', name: 'Sea salt', percentLeft: 100 }), item({ id: 'e', name: 'Tomato puree', percentLeft: 0 }),
  ];
  const rows = K.usedFromPantry(recipe, items);
  assert.deepEqual(rows.map(r => r.itemId), ['c2', 'o', 's']); // soonest-expiring chicken, onion, salt; empty puree and missing basil are skipped
  assert.deepEqual(rows.map(r => r.ticked), [true, true, false]); // staple not pre-ticked
  assert.deepEqual(rows.map(r => r.newPct), [10, 50, 50]);
});
t('suggested amounts and levels', () => {
  assert.equal(K.suggestedLeft(100), 50); assert.equal(K.suggestedLeft(75), 50); assert.equal(K.suggestedLeft(50), 10); assert.equal(K.suggestedLeft(10), 0); assert.equal(K.suggestedLeft(0), 0);
  assert.equal(K.levelFor(100).key, 'full'); assert.equal(K.levelFor(60).key, 'half'); assert.equal(K.levelFor(20).key, 'low'); assert.equal(K.levelFor(2).key, 'empty');
});
t('applyUsed only touches ticked rows', () => {
  const items = [item({ id: 'a', percentLeft: 100 }), item({ id: 'b', percentLeft: 100 }), item({ id: 'c', percentLeft: 100 })];
  const rows = [{ ingredient: 'a', measure: '', itemId: 'a', itemName: 'A', category: 'Other', currentPct: 100, newPct: 50, ticked: true }, { ingredient: 'b', measure: '', itemId: 'b', itemName: 'B', category: 'Other', currentPct: 100, newPct: 0, ticked: false }];
  const out = K.applyUsed(items, rows, 123);
  assert.deepEqual(out.map(i => i.percentLeft), [50, 100, 100]); assert.equal(out[0].updatedAt, 123); assert.equal(out[1].updatedAt, 0); assert.equal(out.length, 3);
});
t('progress helpers + migration of cooking data', () => {
  assert.equal(K.clampStep(9, 5), 4); assert.equal(K.clampStep(-1, 5), 0); assert.equal(K.clampStep(2, 0), 0); assert.equal(K.clampStep(NaN, 5), 0);
  const d = L.migrate({ cookingProgress: { a: 3, b: { step: 2, started: true, checked: [0, 1, 'x'], at: 5 }, c: 'bad' }, timers: [{ id: 't', recipeId: 'a', recipeName: 'A', step: 1, label: '5 min', seconds: 300, endsAt: 99 }, { bad: 1 }] });
  assert.deepEqual(d.cookingProgress!.a.step, 3); assert.deepEqual(d.cookingProgress!.b.checked, [0, 1]); assert.equal(d.cookingProgress!.c, undefined); assert.equal(d.timers!.length, 1);
  assert.deepEqual(L.migrate(null).timers, []);
});
console.log(`cooking tests: ${n} passed`);
