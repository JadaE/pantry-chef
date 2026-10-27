// Intake tracking: parser, fuzzy matching, amounts, totals, goals/limits, warnings, edits, pantry decrement, migration.
// Run: npx tsx tests/intake.test.ts
import assert from 'assert';
import * as I from '../src/intake';
import { migrate, newProfile, todayISO, addDays } from '../src/logic';
import { emptyDB, SCHEMA_VERSION } from '../src/types';
import type { IntakeEntry, Item, NutritionFacts, Profile } from '../src/types';
let n = 0; const t = (name: string, f: () => void) => { try { f(); } catch (e) { console.error('FAILED: ' + name); throw e; } n++; };

const na = (amount: number, unit = 'g') => ({ amount, unit });
const nut = (o: Partial<NutritionFacts> & { cal: number; sug?: number; add?: number; sod?: number; sat?: number }): NutritionFacts => ({
  servingSize: o.servingSize, servingsPerContainer: o.servingsPerContainer ?? null, servingQuantityG: o.servingQuantityG ?? null, packageQuantity: o.packageQuantity ?? null,
  nutrients: { calories: na(o.cal, 'kcal'), ...(o.sug != null ? { sugars: na(o.sug) } : {}), ...(o.add != null ? { addedSugars: na(o.add) } : {}), ...(o.sod != null ? { sodium: na(o.sod, 'mg') } : {}), ...(o.sat != null ? { saturatedFat: na(o.sat) } : {}) },
  per100g: o.per100g, source: 'ocr',
});
let seq = 0;
const item = (name: string, nutrition: NutritionFacts | null, extra: Partial<Item> = {}): Item => ({ id: 'i' + ++seq, name, category: 'pantry', quantity: null, unit: '', percentLeft: 100, purchasedOn: null, expiresOn: null, photoUri: null, notes: '', createdAt: 1, updatedAt: 1, nutrition, ...extra } as Item);
const chips = item("Lay's Classic Potato Chips", nut({ cal: 160, sug: 0, sod: 170, sat: 1.5, servingSize: '1 oz (28g/About 15 chips)', servingsPerContainer: 8, servingQuantityG: 28 }));
const mac = item('Mac and Cheese', nut({ cal: 350, sug: 6, add: 1, sod: 800, sat: 4, servingSize: '1 cup (140g)', servingsPerContainer: 4, servingQuantityG: 140 }), { percentLeft: 100 });
const cereal = item('Honey Oat Cereal', nut({ cal: 120, sug: 12, add: 11, sod: 190, sat: 0, servingSize: '3/4 cup (30g)', servingsPerContainer: 12, servingQuantityG: 30 }));
const cookies = item('Chocolate Chip Cookies', nut({ cal: 160, sug: 11, add: 10, sod: 100, sat: 3, servingSize: '2 cookies (34g)', servingsPerContainer: 10, servingQuantityG: 34 }));
const tacos = item('Taco Leftovers', null, {});
const soda = item('Cola', nut({ cal: 140, sug: 39, add: 39, sod: 45, sat: 0, servingSize: '1 can (355mL)', servingsPerContainer: 1, servingQuantityG: 355 }));
const rice = item('Rice', { nutrients: {}, per100g: { calories: na(130, 'kcal'), sugars: na(0.1), sodium: na(1, 'mg') }, source: 'openfoodfacts' } as any);
const milk = item('2% Milk', nut({ cal: 120, sug: 12, sod: 120, sat: 3, servingSize: '1 cup (240mL)', servingsPerContainer: 16, servingQuantityG: 240 }));
const ITEMS = [chips, mac, cereal, cookies, tacos, soda, rice, milk];
const ana = newProfile('Ana'), ben = newProfile('Ben');
const PEOPLE = [ana, ben];
const P1 = (text: string, items = ITEMS, people = PEOPLE) => I.parseLog(text, items, people);
const first = (text: string) => P1(text).parts[0];

// ---- parser: the four examples from the brief, and friends ----
t('"ate 2 servings of chips" -> 2 servings of the chips', () => {
  const p = first('ate 2 servings of chips'); assert.deepEqual(p.amount, { kind: 'servings', n: 2 }); assert.equal(p.item?.id, chips.id);
  const c = I.computePart({ label: 'Chips', amount: p.amount, item: p.item }, 1);
  assert.equal(c.servings, 2); assert.equal(c.per.calories, 320); assert.equal(I.confirmLine(c, 1), '2 servings Chips, 320 cal');
});
t('"half the mac and cheese" -> half of what is left, shared', () => {
  const p = first('half the mac and cheese'); assert.deepEqual(p.amount, { kind: 'fraction', f: 0.5 }); assert.equal(p.item?.id, mac.id);
  const c = I.computePart({ label: 'Mac and Cheese', amount: p.amount, item: p.item }, 1);
  assert.equal(c.servings, 2); assert.equal(c.per.calories, 700); assert.equal(c.dropPct, 50);
  const half = { ...mac, percentLeft: 50 }; const c2 = I.computePart({ label: 'm', amount: p.amount, item: half }, 1);
  assert.equal(c2.servings, 1); assert.equal(c2.dropPct, 25);                       // half of the half
  const c3 = I.computePart({ label: 'm', amount: p.amount, item: mac }, 2);         // two people share it
  assert.equal(c3.perPerson, 1); assert.equal(c3.per.calories, 350); assert.equal(c3.servings, 2);
});
t('"a bowl of cereal" -> a bowl (1.5 cups) against a 3/4 cup serving = 2 servings', () => {
  const p = first('a bowl of cereal'); assert.deepEqual(p.amount, { kind: 'measure', n: 1, unit: 'bowl' }); assert.equal(p.item?.id, cereal.id);
  const c = I.computePart({ label: 'Cereal', amount: p.amount, item: p.item }, 1); assert.equal(c.servings, 2); assert.equal(c.per.calories, 240);
});
t('"had the leftover tacos for lunch" -> meal lunch, item tacos (no nutrition data), 1 serving assumed', () => {
  const r = P1('had the leftover tacos for lunch'); assert.equal(r.meal, 'lunch'); assert.equal(r.parts.length, 1);
  const p = r.parts[0]; assert.equal(p.item?.id, tacos.id); assert.deepEqual(p.amount, { kind: 'default' });
  const c = I.computePart({ label: 'Tacos', amount: p.amount, item: p.item }, 1); assert.equal(c.noNutrition, true); assert.equal(c.per.calories, null);
  assert.ok(I.confirmLine(c).includes('no nutrition data')); assert.equal(c.assumed, 'assumed 1 serving');
});
t('number words, "a", fractions, mixed numbers, unicode fractions', () => {
  const q = (s: string) => I.parseQuantity(s);
  assert.deepEqual(q('two servings of x').amount, { kind: 'servings', n: 2 }); assert.equal(q('two servings of x').rest, 'x');
  assert.deepEqual(q('1 1/2 servings chips').amount, { kind: 'servings', n: 1.5 });
  assert.deepEqual(q('1½ servings chips').amount, { kind: 'servings', n: 1.5 }); assert.deepEqual(q('½ cup rice').amount, { kind: 'measure', n: 0.5, unit: 'cup' });
  assert.deepEqual(q('one and a half servings chips').amount, { kind: 'servings', n: 1.5 });
  assert.deepEqual(q('half a serving of chips').amount, { kind: 'servings', n: 0.5 });
  assert.deepEqual(q('a quarter of the pizza').amount, { kind: 'fraction', f: 0.25 }); assert.equal(q('a quarter of the pizza').rest, 'pizza');
  assert.deepEqual(q('a third of the pie').amount, { kind: 'fraction', f: 1 / 3 });
  assert.deepEqual(q('3/4 cup rice').amount, { kind: 'measure', n: 0.75, unit: 'cup' });
  assert.deepEqual(q('a couple of cookies').amount, { kind: 'count', n: 2 }); assert.equal(q('a couple of cookies').rest, 'cookies');
  assert.deepEqual(q('a banana').amount, { kind: 'count', n: 1 });
  assert.deepEqual(q('half a cup of milk').amount, { kind: 'measure', n: 0.5, unit: 'cup' });
  assert.deepEqual(q('half a bag of chips').amount, { kind: 'fraction', f: 0.5 });
  assert.deepEqual(q('a can of soda').amount, { kind: 'container', n: 1 }); assert.equal(q('2 slices pizza').amount?.kind, 'count');
  assert.equal(q('chips').amount, null);
});
t('"the rest of the mac and cheese" / "finished the chips" / "all of the cookies" -> rest', () => {
  for (const s of ['ate the rest of the mac and cheese', 'finished the mac and cheese', 'had all of the mac and cheese', 'ate the whole mac and cheese']) { const p = first(s); assert.deepEqual(p.amount, { kind: 'rest' }, s); assert.equal(p.item?.id, mac.id, s); }
  const half = { ...mac, percentLeft: 50 }; const c = I.computePart({ label: 'm', amount: { kind: 'rest' }, item: half }, 1);
  assert.equal(c.servings, 2); assert.equal(c.dropPct, 50);
});
t('grams: servings = g / serving grams; per-100 g fallback when only that exists', () => {
  const p = first('ate 56g of chips'); assert.deepEqual(p.amount, { kind: 'measure', n: 56, unit: 'g' });
  const c = I.computePart({ label: 'Chips', amount: p.amount, item: chips }, 1); assert.equal(c.servings, 2); assert.equal(c.per.calories, 320);
  const p2 = first('200 grams of rice'); assert.equal(p2.item?.id, rice.id);
  const c2 = I.computePart({ label: 'Rice', amount: p2.amount, item: rice }, 1); assert.equal(c2.servings, 2); assert.equal(c2.per.calories, 260); assert.ok(c2.assumed);
  assert.equal(first('100g chips').amount.kind, 'measure');
});
t('counts against a "2 cookies" serving; slices; pieces', () => {
  const p = first('ate 3 cookies'); assert.equal(p.item?.id, cookies.id); const c = I.computePart({ label: 'Cookies', amount: p.amount, item: p.item }, 1);
  assert.equal(c.servings, 1.5); assert.equal(c.per.calories, 240); assert.equal(c.amountText, '3 cookies'); assert.equal(I.confirmLine(c), '3 cookies Cookies, 240 cal');
});
t('volume: a glass of milk = 1 cup serving; a can of soda = whole package', () => {
  const p = first('drank a glass of milk'); assert.equal(p.item?.id, milk.id); assert.equal(I.computePart({ label: 'Milk', amount: p.amount, item: p.item }, 1).per.calories, 120);
  const s = first('had a can of cola'); assert.deepEqual(s.amount, { kind: 'container', n: 1 }); const c = I.computePart({ label: 'Cola', amount: s.amount, item: s.item }, 1);
  assert.equal(c.servings, 1); assert.equal(c.per.calories, 140); assert.equal(c.dropPct, 100);
});
t('no amount -> 1 serving, flagged as assumed; "some" is not an amount', () => {
  const p = first('had some cereal'); assert.deepEqual(p.amount, { kind: 'default' }); const c = I.computePart({ label: 'Cereal', amount: p.amount, item: p.item }, 1);
  assert.equal(c.servings, 1); assert.ok(c.assumed);
});
t('who and when: "for Ana and Ben", "Ben ate", yesterday, meal words', () => {
  assert.deepEqual(P1('2 servings of chips for Ana and Ben').people.sort(), [ana.id, ben.id].sort());
  assert.deepEqual(P1('ben ate a bowl of cereal').people, [ben.id]); assert.equal(P1('ben ate a bowl of cereal').parts[0].item?.id, cereal.id);
  assert.equal(P1('ate cereal for breakfast').meal, 'breakfast'); assert.equal(P1('had dinner: cereal').meal, undefined);
  assert.equal(P1('cereal as a snack').meal, 'snack'); assert.equal(P1('had chips yesterday').dayOffset, -1);
  assert.deepEqual(P1('ate chips').people, []);
});
t('fuzzy matching: plurals, typos, brand/partial names, recent boost, threshold', () => {
  assert.equal(first('chip').item?.id, chips.id); assert.equal(first('potatoe chips').item?.id, chips.id);
  assert.equal(first('cherios').item, null); // no such item and too far
  assert.equal(first('cerial').item?.id, cereal.id); assert.equal(first('cookie').item?.id, cookies.id);
  assert.equal(first('milk').item?.id, milk.id);
  const a = item('Peanut Butter Crunch Cereal', null), b = item('Peanut Butter', null);
  assert.equal(I.parseLog('peanut butter', [a, b], []).parts[0].matches[0].item.id, b.id);
  assert.equal(I.parseLog('cereal', [a, cereal], [], [a.id]).parts[0].matches.length, 2);
  assert.ok(I.matchScore('mac and cheese', mac) > 0.95); assert.ok(I.matchScore('pizza', mac) === 0);
  const recipeNamed = item('Store brand 2% milk', null, { recipeName: 'whole milk' }); assert.ok(I.matchScore('whole milk', recipeNamed) >= 0.9);
});
t('multi-item text: split on and/comma, but "mac and cheese" stays one', () => {
  const r = P1('ate chips and a bowl of cereal'); assert.equal(r.parts.length, 2); assert.equal(r.parts[0].item?.id, chips.id); assert.equal(r.parts[1].item?.id, cereal.id);
  assert.equal(P1('mac and cheese').parts.length, 1);
  assert.equal(P1('2 servings of chips, 3 cookies').parts.length, 2);
  const unk = P1('ate some zzzzzz'); assert.equal(unk.parts.length, 1); assert.equal(unk.parts[0].item, null); assert.equal(unk.parts[0].query, 'zzzzzz');
});
t('unknown food -> free text, logged with no nutrition data', () => {
  const c = I.computePart({ label: 'Zzzz', amount: { kind: 'default' }, item: null }, 1); assert.equal(c.noNutrition, true);
  const [e] = I.makeEntries(c, [ana.id], 'snack', 1000); assert.equal(e.noNutrition, true); assert.equal(e.calories, null); assert.equal(e.nutrients, undefined);
});
t('serving size parser', () => {
  const g = I.parseServingSize; assert.deepEqual([g('3/4 cup (30g)').ml, g('3/4 cup (30g)').g, g('3/4 cup (30g)').dim], [180, 30, 'volume']);
  assert.equal(g('2 cookies (34g)').dim, 'count'); assert.equal(g('2 cookies (34g)').qty, 2); assert.equal(g('12 fl oz (355 mL)').ml, 355);
  assert.equal(g('1 oz (28g/About 15 chips)').g, 28); assert.equal(g(undefined).dim, null); assert.equal(g('28 g').dim, 'mass');
});

// ---- meals ----
t('meal guessed from the time of day', () => {
  assert.deepEqual([6, 9, 12, 14, 15, 16, 18, 20, 22, 2].map(I.mealForHour), ['breakfast', 'breakfast', 'lunch', 'lunch', 'snack', 'snack', 'dinner', 'dinner', 'snack', 'snack']);
});

// ---- entries, several people, pantry decrement ----
t('entries: one per person; non-shared amounts apply to each, shared split', () => {
  const c = I.computePart({ label: 'Chips', amount: { kind: 'servings', n: 2 }, item: chips }, 2);
  const es = I.makeEntries(c, [ana.id, ben.id], 'snack', 5000); assert.equal(es.length, 2); assert.equal(es[0].calories, 320); assert.equal(es[1].profileId, ben.id); assert.notEqual(es[0].id, es[1].id);
  assert.equal(c.dropPct, 50);                                                    // 4 servings total of 8
  const s = I.computePart({ label: 'm', amount: { kind: 'rest' }, item: mac }, 2); const e2 = I.makeEntries(s, [ana.id, ben.id], 'dinner', 1);
  assert.equal(e2[0].servings, 2); assert.equal(e2[0].calories, 700); assert.equal(s.dropPct, 100);
});
t('pantry decrement: lowers, never below 0, unknown stays', () => {
  const out = I.lowerPantry([chips, mac, tacos], { [chips.id]: 25, [mac.id]: 500 }, 9); assert.equal(out[0].percentLeft, 75); assert.equal(out[1].percentLeft, 0); assert.equal(out[2].percentLeft, 100); assert.equal(out[0].updatedAt, 9);
  const noPkg = item('Thing', nut({ cal: 100, servingSize: '1 cup' })); assert.equal(I.computePart({ label: 'x', amount: { kind: 'servings', n: 1 }, item: noPkg }, 1).dropPct, null);
  assert.equal(I.computePart({ label: 'x', amount: { kind: 'servings', n: 1 }, item: tacos }, 1).dropPct, null);
});
t('rescale an entry (edit servings) scales calories + nutrients; zero allowed', () => {
  const c = I.computePart({ label: 'Chips', amount: { kind: 'servings', n: 2 }, item: chips }, 1); const [e] = I.makeEntries(c, [ana.id], 'snack', 1);
  const r = I.rescaleEntry(e, 1); assert.equal(r.calories, 160); assert.equal(r.nutrients!.sodium.amount, 170); assert.equal(r.servings, 1); assert.equal(r.amountText, '1 serving');
  assert.equal(I.rescaleEntry(e, 3).calories, 480); assert.equal(I.rescaleEntry(e, 0).calories, 0);
  const nn = I.rescaleEntry({ ...e, calories: null, nutrients: undefined, noNutrition: true }, 3); assert.equal(nn.calories, null);
});
t('scanning a label later fills in a no-nutrition entry', () => {
  const [e] = I.makeEntries(I.computePart({ label: 'Tacos', amount: { kind: 'servings', n: 2 }, item: tacos }, 1), [ana.id], 'lunch', 1);
  const lab = item('Taco Leftovers', nut({ cal: 200, sod: 400 })); const f = I.withNutritionFrom(e, lab); assert.equal(f.calories, 400); assert.equal(f.noNutrition, undefined); assert.equal(f.nutrients!.sodium.amount, 800);
});
t('recent items: recently logged first, then newest pantry items, no duplicates', () => {
  const old = item('Old', null, { updatedAt: 1 }), fresh = item('Fresh', null, { updatedAt: 99 });
  const log: IntakeEntry[] = [{ id: 'a', at: 10, itemId: old.id, label: 'Old', servings: 1 }, { id: 'b', at: 5, itemId: 'gone', label: 'x', servings: 1 }];
  const r = I.recentItems([fresh, old], log, 5); assert.deepEqual(r.map(x => x.id), [old.id, fresh.id]);
});

// ---- totals ----
const TODAY = todayISO(); const at = (day: string, h = 12) => new Date(day + 'T' + String(h).padStart(2, '0') + ':00:00').getTime();
const E = (day: string, who: string | undefined, cal: number | null, nuts: Record<string, number> = {}, h = 12): IntakeEntry => ({ id: Math.random().toString(36), at: at(day, h), profileId: who, label: 'x', servings: 1, calories: cal, noNutrition: cal == null ? true : undefined, nutrients: cal == null ? undefined : Object.fromEntries(Object.entries(nuts).map(([k, v]) => [k, { amount: v, unit: 'g' }])) });
t('day totals: per person, sums nutrients, counts no-data entries, local-day boundaries', () => {
  const es = [E(TODAY, ana.id, 300, { addedSugars: 10, sodium: 500 }), E(TODAY, ana.id, 200, { addedSugars: 5.5 }), E(TODAY, ana.id, null), E(TODAY, ben.id, 999, { addedSugars: 99 }), E(addDays(TODAY, -1), ana.id, 111, {}), E(TODAY, undefined, 50, {})];
  const d = I.dayTotals(es, I.whoIs(ana.id), TODAY); assert.equal(d.calories, 500); assert.equal(d.nutrients.addedSugars, 15.5); assert.equal(d.nutrients.sodium, 500); assert.equal(d.entries, 3); assert.equal(d.noData, 1);
  assert.equal(I.dayTotals(es, I.whoIs(null), TODAY).calories, 50);
  assert.equal(I.dayTotals(es, I.whoIs(ana.id), addDays(TODAY, -1)).calories, 111);
  const late = [E(TODAY, ana.id, 70, {}, 23), E(addDays(TODAY, 1), ana.id, 30, {}, 0)]; assert.equal(I.dayTotals(late, I.whoIs(ana.id), TODAY).calories, 70);
});
t('week view: 7 days ending on the chosen day, oldest first', () => {
  const es = [E(TODAY, ana.id, 100), E(addDays(TODAY, -6), ana.id, 60), E(addDays(TODAY, -7), ana.id, 5000)];
  const w = I.weekDays(es, I.whoIs(ana.id), TODAY); assert.equal(w.length, 7); assert.equal(w[0].day, addDays(TODAY, -6)); assert.equal(w[6].day, TODAY);
  assert.equal(w[0].totals.calories, 60); assert.equal(w[6].totals.calories, 100); assert.equal(w.reduce((a, d) => a + d.totals.calories, 0), 160);
});

// ---- limits, goals, progress ----
const prof = (limits: Partial<Profile['limits']> = {}, goals: Profile['goals'] = []): Profile => ({ ...newProfile('Cy'), limits: { addedSugarsG: 50, sodiumMg: 2300, totalSugarsG: null, saturatedFatG: 20, caloriesKcal: null, ...limits } as any, goals });
t('limits: person limits, tracked keys, none for unset', () => {
  const l = I.limitsOn(prof(), TODAY); const by = (k: string) => l.find(x => x.key === k)!;
  assert.equal(by('addedSugars').limit, 50); assert.equal(by('sodium').limit, 2300); assert.equal(by('sugars').limit, null); assert.equal(by('calories').limit, null); assert.equal(by('sugars').source, 'none');
  assert.equal(by('saturatedFat').limit, 20);
  assert.equal(I.limitsOn(prof({ addedSugarsG: 0 as any }), TODAY).find(x => x.key === 'addedSugars')!.limit, null);
});
t('goals: dated range tightens the limit only inside the range; inactive/looser/limitless goals ignored', () => {
  const g = (o: any) => ({ id: 'g', label: 'Sugar watch', nutrient: 'addedSugarsG', dailyLimit: 25, startOn: addDays(TODAY, -2), endOn: addDays(TODAY, 2), active: true, ...o });
  const lim = (p: Profile, day = TODAY) => I.limitsOn(p, day).find(x => x.key === 'addedSugars')!;
  assert.equal(lim(prof({}, [g({})])).limit, 25); assert.equal(lim(prof({}, [g({})])).source, 'goal'); assert.equal(lim(prof({}, [g({})])).goalLabel, 'Sugar watch');
  assert.equal(lim(prof({}, [g({})]), addDays(TODAY, 3)).limit, 50); assert.equal(lim(prof({}, [g({})]), addDays(TODAY, -3)).source, 'limit');
  assert.equal(lim(prof({}, [g({ active: false })])).limit, 50); assert.equal(lim(prof({}, [g({ dailyLimit: 80 })])).limit, 50); assert.equal(lim(prof({}, [g({ dailyLimit: null })])).limit, 50);
  assert.equal(lim(prof({}, [g({ startOn: null, endOn: null })]), addDays(TODAY, 400)).limit, 25);        // open-ended goal
  assert.equal(lim(prof({ addedSugarsG: null as any }, [g({})])).limit, 25);                               // goal where there is no limit
  assert.equal(lim(prof({}, [g({ dailyLimit: 30 }), g({ dailyLimit: 20 })])).limit, 20);                  // strictest wins
  assert.equal(I.limitsOn(prof({}, [g({ nutrient: 'sodiumMg', dailyLimit: 1500 })]), TODAY).find(x => x.key === 'sodium')!.limit, 1500);
});
t('progress levels: ok < 80% <= near < 100% <= over; gentle thresholds exactly at 80 and 100', () => {
  const p = prof({ addedSugarsG: 50 }); const tt = (v: number) => I.progressFor(p, { calories: 0, nutrients: { addedSugars: v }, entries: 1, noData: 0 }, TODAY).find(x => x.key === 'addedSugars')!;
  assert.equal(tt(39).level, 'ok'); assert.equal(tt(39).pct, 78); assert.equal(tt(40).level, 'near'); assert.equal(tt(40).pct, 80); assert.equal(tt(49.9).level, 'near');
  assert.equal(tt(50).level, 'over'); assert.equal(tt(75).pct, 150);
  assert.equal(I.progressFor(p, { calories: 2000, nutrients: {}, entries: 1, noData: 0 }, TODAY).find(x => x.key === 'calories')!.level, 'ok');   // no calorie limit -> never warns
  assert.equal(I.levelOf(null), 'ok');
});

// ---- warnings before logging ----
t('pre-log warning: "This puts Ben at 112% of added sugars today"', () => {
  const p = { ...ben, limits: { ...ben.limits, addedSugarsG: 50 } };
  const es = [E(TODAY, p.id, 100, { addedSugars: 30 })];
  const w = I.preLogWarnings(p, es, { calories: 140, nutrients: { addedSugars: { amount: 26, unit: 'g' } } }, TODAY); assert.equal(w.length, 1);
  assert.equal(w[0].level, 'over'); assert.equal(w[0].text, 'This puts Ben at 112% of added sugars today');
});
t('pre-log warning: gentle at crossing 80%, silent when already past 80 but under 100, silent without nutrition', () => {
  const p = { ...ana, limits: { ...ana.limits, addedSugarsG: 50 } }; const add = (v: number) => ({ calories: null, nutrients: { addedSugars: { amount: v, unit: 'g' } } });
  const w = I.preLogWarnings(p, [E(TODAY, p.id, 0, { addedSugars: 20 })], add(21), TODAY); assert.equal(w[0].level, 'near'); assert.ok(w[0].text.includes('82%'));
  assert.equal(I.preLogWarnings(p, [E(TODAY, p.id, 0, { addedSugars: 42 })], add(2), TODAY).length, 0);
  assert.equal(I.preLogWarnings(p, [], { calories: null, nutrients: {} }, TODAY).length, 0);
  assert.equal(I.preLogWarnings(p, [E(TODAY, p.id, 0, { addedSugars: 60 })], add(5), TODAY)[0].level, 'over');            // already over -> still says so
  assert.ok(I.preLogWarnings(p, [], add(60), addDays(TODAY, -1), TODAY)[0].text.endsWith('that day'));
  assert.equal(I.preLogWarnings(p, [E(TODAY, ben.id, 0, { addedSugars: 49 })], add(2), TODAY).length, 1 - 1 + (2 / 50 >= 0.8 ? 1 : 0)); // other people's entries do not count
});
t('pre-log warning names the goal when a dated goal is the limit', () => {
  const p = prof({}, [{ id: 'g', label: 'Sugar watch', nutrient: 'addedSugarsG', dailyLimit: 25, startOn: addDays(TODAY, -1), endOn: addDays(TODAY, 5), active: true }]);
  const w = I.preLogWarnings(p, [], { calories: null, nutrients: { addedSugars: { amount: 28, unit: 'g' } } }, TODAY); assert.equal(w[0].text, `This puts ${p.name} at 112% of added sugars (Sugar watch) today`);
});
t('end to end: parse -> compute -> warn for a sugary drink on a nearly-full day', () => {
  const p = { ...ben, limits: { ...ben.limits, addedSugarsG: 50 } };
  const part = first('had a can of cola'); const c = I.computePart({ label: 'Cola', amount: part.amount, item: part.item }, 1);
  const w = I.preLogWarnings(p, [E(TODAY, p.id, 200, { addedSugars: 20 })], c.per, TODAY); assert.equal(w[0].text, 'This puts Ben at 118% of added sugars today');
});

// ---- goal range + monthly totals ----
t('goal range summary: total, logged days, average, days over, capped at today', () => {
  const from = addDays(TODAY, -4), to = addDays(TODAY, 10);
  const es = [E(addDays(TODAY, -4), ana.id, 0, { addedSugars: 30 }), E(addDays(TODAY, -3), ana.id, 0, { addedSugars: 10 }), E(addDays(TODAY, -3), ana.id, 0, { addedSugars: 20 }), E(TODAY, ana.id, 0, { addedSugars: 5 }), E(addDays(TODAY, -1), ben.id, 0, { addedSugars: 500 })];
  const r = I.rangeSummary(es, I.whoIs(ana.id), 'addedSugars', from, to, 25, TODAY);
  assert.equal(r.to, TODAY); assert.equal(r.days, 5); assert.equal(r.loggedDays, 3); assert.equal(r.total, 65); assert.equal(r.avgPerLoggedDay, 21.7); assert.equal(r.daysOver, 2); assert.equal(r.unit, 'g');
  const none = I.rangeSummary([], I.whoIs(ana.id), 'sodium', from, to, null, TODAY); assert.equal(none.total, 0); assert.equal(none.avgPerLoggedDay, 0); assert.equal(none.daysOver, 0);
  const fut = I.rangeSummary(es, I.whoIs(ana.id), 'addedSugars', addDays(TODAY, 3), addDays(TODAY, 9), 25, TODAY); assert.equal(fut.total, 0);
  assert.equal(I.rangeSummary(es, I.whoIs(ana.id), 'calories', '2000-01-01', TODAY, null, TODAY).days <= 400, true);   // absurd ranges are capped
});
t('monthly total: calendar month range', () => {
  assert.deepEqual(I.monthRange('2026-02-14'), { from: '2026-02-01', to: '2026-02-28' }); assert.deepEqual(I.monthRange('2028-02-10'), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(I.monthRange('2026-12-31'), { from: '2026-12-01', to: '2026-12-31' });
  const es = [E('2026-03-02', ana.id, 400), E('2026-03-30', ana.id, 600), E('2026-04-01', ana.id, 9999)];
  const m = I.monthRange('2026-03-10'); const r = I.rangeSummary(es, I.whoIs(ana.id), 'calories', m.from, m.to, null, '2026-03-31'); assert.equal(r.total, 1000); assert.equal(r.loggedDays, 2); assert.equal(r.days, 31);
});

// ---- migration (schema 5) ----
t('migrate: schema 5 keeps good intake entries, drops/cleans bad ones, defaults', () => {
  const good = { id: 'e1', at: 5, label: 'Chips', servings: 2, calories: 320, meal: 'snack', nutrients: { sodium: { amount: 340, unit: 'mg' } } };
  const db = migrate({ schema: 4, items: [], intake: [good, { id: 'e2', at: 'x', label: 'bad' }, null, { id: 'e3', at: 6, label: 'Odd', servings: -3, meal: 'brunch', calories: 'lots', nutrients: 'junk' }], logPeopleIds: ['a', 5] });
  assert.equal(db.schema, SCHEMA_VERSION); assert.equal(db.intake.length, 2); assert.deepEqual(db.intake[0], { ...good });
  assert.equal(db.intake[1].servings, 1); assert.equal(db.intake[1].meal, undefined); assert.equal(db.intake[1].calories, null); assert.equal(db.intake[1].nutrients, undefined);
  assert.deepEqual(db.logPeopleIds, ['a']); assert.equal(db.settings.logLowersPantry, true);
  assert.equal(migrate({ settings: { logLowersPantry: false } }).settings.logLowersPantry, false);
  const e = emptyDB(); assert.deepEqual(e.intake, []); assert.deepEqual(e.logPeopleIds, []);
});
t('formatting', () => { assert.deepEqual([0.5, 1, 1.5, 2.25, 0.33, 2 / 3, 3, 1.2].map(I.fmtQty), ['½', '1', '1½', '2¼', '⅓', '⅔', '3', '1.2']); assert.equal(I.servingsText(1), '1 serving'); assert.equal(I.servingsText(0.5), '½ serving'); assert.equal(I.servingsText(2), '2 servings'); });

console.log(`intake tests: ${n} passed`);
