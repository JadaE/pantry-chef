// Ingredient flags, restriction-in-ingredient-text, 20% DV, hidden-serving warnings, Open Food Facts skip rule, migration.
// Run: npx tsx tests/warnings.test.ts
import assert from 'assert';
import { readFileSync } from 'fs';
import { parseLabel, parseIngredients } from '../src/nutrition';
import { ingredientFlags, FLAG_RULES, flagEnabled, normText, termInText } from '../src/flags';
import { itemWarnings, offHasNutrition, servingsInPackage, servingDv, packageDv, servingNutrients } from '../src/warnings';
import { restrictionHitsInText, ingredientPieces, migrate, newProfile } from '../src/logic';
import { parseOff } from '../src/off';
import { emptyDB, SCHEMA_VERSION, DEFAULT_SETTINGS } from '../src/types';
import type { NutritionFacts, Profile } from '../src/types';
let n = 0; const t = (name: string, f: () => void) => { try { f(); } catch (e) { console.error('FAILED: ' + name); throw e; } n++; };
const S = { ...DEFAULT_SETTINGS, flagOverrides: {} as Record<string, boolean>, warnIngredients: [] as string[] };
const label = (f: string) => parseLabel(readFileSync(__dirname + `/labels/${f}.txt`, 'utf8')).nutrition;
const ids = (ws: ReturnType<typeof itemWarnings>) => ws.map(w => w.id);
const person = (name: string, restrictions: string[], guest = false): Profile => ({ ...newProfile(name, guest), restrictions });

// ---- flags ----
t('flag matching: dyes in all their spellings, HFCS, nitrite, BHT, bromate, aspartame', () => {
  const f = (s: string) => ingredientFlags(s, S).map(x => x.id);
  assert.deepEqual(f('Sugar, Red #40, Yellow 5 Lake, Blue 1'), ['dyes']);
  assert.deepEqual(f('FD&C Red No. 40, water'), ['dyes']);
  assert.deepEqual(f('Corn syrup, HIGH FRUCTOSE CORN SYRUP, salt'), ['hfcs']);
  assert.deepEqual(f('Pork, water, salt, sodium nitrite'), ['nitrite']);
  assert.deepEqual(f('Vegetable oil (with BHT added to protect flavor)'), ['bha']);
  assert.deepEqual(f('Wheat flour, malted barley, potassium bromate, niacin'), ['bromate']);
  assert.deepEqual(f('Carbonated water, aspartame, acesulfame potassium'), ['aspartame', 'sweeteners']);
  assert.deepEqual(f('Flour, partially hydrogenated soybean oil'), ['pho']);
});
t('flag matching: no false positives on look-alikes', () => {
  const f = (s: string) => ingredientFlags(s, S).map(x => x.id);
  assert.deepEqual(f('Red 400 pepper, blue 15, yellow 50'), []);
  assert.deepEqual(f('Fully hydrogenated palm oil, sugar, cocoa butter, flour, water, salt'), []);
  assert.deepEqual(f('Tomatoes, corn, sea salt, vinegar, natural flavor'), []);
  assert.deepEqual(f('Beet juice (for color), turmeric, annatto'), []);
  assert.deepEqual(f(''), []); assert.deepEqual(ingredientFlags(null, S), []);
});
t('flag matching survives a line-broken word', () => { assert.deepEqual(ingredientFlags('flour, partially hydroge nated oil', S).map(x => x.id), ['pho']); assert.ok(termInText('high fructose corn syrup', normText('high fructose corn sy rup'))); });
t('flags can be toggled; milder rules are off by default; household words work', () => {
  assert.equal(flagEnabled(FLAG_RULES.find(r => r.id === 'msg')!, S), false);
  assert.deepEqual(ingredientFlags('salt, monosodium glutamate', S), []);
  assert.deepEqual(ingredientFlags('salt, monosodium glutamate', { ...S, flagOverrides: { msg: true } }).map(x => x.id), ['msg']);
  assert.deepEqual(ingredientFlags('Red 40, sugar', { ...S, flagOverrides: { dyes: false } }), []);
  const custom = ingredientFlags('Sugar, palm oil, soy lecithin', { ...S, warnIngredients: ['Palm Oil', 'carrageenan'] });
  assert.deepEqual(custom.map(x => [x.label, x.custom]), [['Palm Oil', true]]);
  assert.ok(FLAG_RULES.every(r => r.why.length > 20 && r.terms.length > 0));
});

// ---- restrictions against ingredient text ----
t('ingredient pieces split lists, parentheses, "contains" and "may contain"', () => {
  const p = ingredientPieces('Enriched flour (wheat flour, niacin), sugar, salt. Contains: wheat, milk. May contain peanuts and tree nuts.');
  assert.ok(p.definite.includes('wheat flour') && p.definite.includes('milk') && p.definite.includes('sugar'));
  assert.deepEqual(p.trace.filter(x => /nut/.test(x)), ['peanuts', 'tree nuts']);
});
t('restriction groups are checked against the whole ingredient text', () => {
  const ing = 'Enriched wheat flour, sugar, palm oil, whey, soy lecithin, cocoa butter, peanut butter, salt. May contain egg and tree nuts.';
  const hit = (r: string) => restrictionHitsInText(r, ing).map(h => (h.trace ? '~' : '') + h.piece.toLowerCase());
  assert.deepEqual(hit('dairy'), ['whey']);                       // cocoa butter / peanut butter are fine
  assert.deepEqual(hit('gluten'), ['enriched wheat flour']);
  assert.deepEqual(hit('soy'), ['soy lecithin']);
  assert.deepEqual(hit('peanuts'), ['peanut butter']);
  assert.deepEqual(hit('eggs'), ['~egg']); assert.deepEqual(hit('tree nuts'), ['~tree nuts']);
  assert.deepEqual(hit('shellfish'), []);
  assert.deepEqual(hit('palm'), ['palm oil']);                     // a literal word works too
});
t('item warnings: each person checked, guests labelled, "may contain" is a caution', () => {
  const ws = itemWarnings({ ingredientsText: 'Wheat flour, milk, sugar. May contain peanuts.', nutrition: null }, S, [person('Pat', ['dairy']), person('Sam', ['peanuts'], true), person('Lee', ['fish'])]);
  assert.deepEqual(ws.map(w => [w.title, w.level]), [['Pat can\'t have dairy', 'high'], ['Sam (guest): may contain peanuts', 'caution']]);
  assert.ok(/milk/.test(ws[0].detail));
});

// ---- 20% DV, trans fat, hidden serving ----
t('20% DV or more per serving: watch vs good', () => {
  const ws = itemWarnings({ nutrition: label('fda-sample'), ingredientsText: null }, S, []);
  assert.deepEqual(ids(ws).sort(), ['dv:addedSugars', 'dv:calcium', 'dv:iron', 'hidden'].sort());
  assert.equal(ws.find(w => w.id === 'dv:addedSugars')!.level, 'caution'); assert.equal(ws.find(w => w.id === 'dv:iron')!.level, 'good');
  assert.ok(/45%/.test(ws.find(w => w.id === 'dv:iron')!.detail));
});
t('hidden serving: dual-column soda (2.5 servings, 54% added sugar per serving)', () => {
  const nu = label('soda-dual'); const ws = itemWarnings({ nutrition: nu, ingredientsText: null }, S, []);
  const h = ws.find(w => w.id === 'hidden')!; assert.ok(h, 'hidden serving warning expected');
  assert.ok(/2\.5 in this package/.test(h.title) && /135% of the daily added sugar \(54% per serving\)/.test(h.detail), h.title + ' | ' + h.detail);
  assert.equal(packageDv(nu, 'addedSugars'), 135); assert.equal(servingDv(nu, 'addedSugars'), 54);
});
t('hidden serving: single-column label multiplies per-serving %DV by servings; below 100% stays quiet', () => {
  const chips = itemWarnings({ nutrition: label('chips-g9'), ingredientsText: null }, S, []);
  assert.ok(/6 in this package/.test(chips.find(w => w.id === 'hidden')!.title)); assert.ok(/324% of the daily sodium \(54% per serving\)/.test(chips.find(w => w.id === 'hidden')!.detail));
});
t('hidden serving: FDA sample label crosses 100% for added sugar only (8 servings x 20%); sodium 8 x 7% does not', () => {
  const h = itemWarnings({ nutrition: label('fda-sample'), ingredientsText: null }, S, []).find(w => w.id === 'hidden')!;
  assert.ok(h && /160% of the daily added sugar \(20% per serving\)/.test(h.detail) && !/sodium/.test(h.detail), h?.detail);
});
t('hidden serving needs more than one serving, and ignores 1-serving packages', () => {
  const one: NutritionFacts = { servingsPerContainer: 1, nutrients: { sodium: { amount: 2000, unit: 'mg', dv: 87 } }, source: 'ocr' };
  assert.ok(!itemWarnings({ nutrition: one, ingredientsText: null }, S, []).some(w => w.id === 'hidden'));
  const two: NutritionFacts = { servingsPerContainer: 2, nutrients: { sodium: { amount: 1150, unit: 'mg', dv: 50 } }, source: 'ocr' };
  assert.ok(itemWarnings({ nutrition: two, ingredientsText: null }, S, []).some(w => w.id === 'hidden'));
  const half: NutritionFacts = { servingsPerContainer: 2, nutrients: { sodium: { amount: 1000, unit: 'mg', dv: 43 } }, source: 'ocr' };
  assert.ok(!itemWarnings({ nutrition: half, ingredientsText: null }, S, []).some(w => w.id === 'hidden'));
});
t('old label with only "Sugars": compared with the 50 g reference', () => {
  const nu: NutritionFacts = { servingsPerContainer: 3, nutrients: { sugars: { amount: 20, unit: 'g' } }, source: 'ocr' };
  const h = itemWarnings({ nutrition: nu, ingredientsText: null }, S, []).find(w => w.id === 'hidden')!;
  assert.ok(h && /sugar/.test(h.detail) && /120%/.test(h.detail), h?.detail);
});
t('trans fat on the label is a warning unless the oil rule already fired', () => {
  const nu = label('mac-messy');
  assert.ok(itemWarnings({ nutrition: nu, ingredientsText: null }, S, []).some(w => w.id === 'trans'));
  const w2 = itemWarnings({ nutrition: nu, ingredientsText: 'Flour, partially hydrogenated oil' }, S, []);
  assert.ok(w2.some(w => w.id === 'f:pho') && !w2.some(w => w.id === 'trans'));
  assert.equal(w2[0].level, 'high');
});

// ---- Open Food Facts data: same structure, skip rule, serving estimates ----
const OFF_JSON = { product_name: 'Test cereal', brands: 'Acme', quantity: '500 g', serving_size: '40 g', serving_quantity: 40,
  nutriments: { 'energy-kcal_100g': 380, fat_100g: 4, 'saturated-fat_100g': 1, carbohydrates_100g: 80, sugars_100g: 30, proteins_100g: 8, sodium_100g: 0.4, 'energy-kcal_serving': 152, 'sodium_serving': 0.16 }, ingredients_text: 'Corn, sugar, red 40' };
t('Open Food Facts nutrition counts as present; OCR data and empty OFF data do not', () => {
  const off = parseOff('123', OFF_JSON); assert.equal(offHasNutrition(off.nutrition), true);
  assert.equal(offHasNutrition(label('fda-sample')), false); assert.equal(offHasNutrition(null), false);
  const thin = parseOff('1', { product_name: 'x', nutriments: { 'energy-kcal_100g': 100 } }); assert.equal(offHasNutrition(thin.nutrition), false);
});
t('label OCR output has the same shape as OFF data (nutrients/perServing/per100g, same keys and units)', () => {
  const off = parseOff('123', OFF_JSON).nutrition!, ocr = label('fda-sample');
  for (const k of ['calories', 'fat', 'saturatedFat', 'sodium', 'carbs', 'sugars', 'protein']) { assert.ok(off.per100g![k], 'off ' + k); assert.ok(ocr.nutrients[k], 'ocr ' + k); assert.equal(off.per100g![k].unit, ocr.nutrients[k].unit); }
  assert.ok(ocr.perServing && ocr.per100g); assert.equal(typeof ocr.servingQuantityG, 'number'); assert.equal(off.source, 'openfoodfacts'); assert.equal(ocr.source, 'ocr');
});
t('OFF barcode data: serving amounts and a package-size estimate drive the same warnings', () => {
  const nu = parseOff('123', OFF_JSON).nutrition!;
  assert.deepEqual(servingsInPackage(nu), { count: 12.5, estimated: true });
  assert.equal(servingNutrients(nu)!.sodium.amount, 160); assert.equal(servingDv(nu, 'sodium'), 7);
  assert.ok(itemWarnings({ nutrition: nu, ingredientsText: nu.ingredientsText }, S, []).some(w => w.id === 'hidden' && /12\.5 in this package \(estimated\)/.test(w.title)));
  const only100: NutritionFacts = { nutrients: { sodium: { amount: 400, unit: 'mg' } }, per100g: { sodium: { amount: 400, unit: 'mg' } }, source: 'openfoodfacts' };
  assert.equal(servingNutrients(only100), null); assert.deepEqual(itemWarnings({ nutrition: only100, ingredientsText: null }, S, []), []);
});
t('ingredients from a photo feed the flags and restrictions', () => {
  const ing = parseIngredients('INGREDIENTS: SUGAR, WHEAT FLOUR, HIGH FRUCTOSE CORN SYRUP, RED 40, SKIM MILK.\nDistributed by Foo Inc');
  const ws = itemWarnings({ nutrition: null, ingredientsText: ing }, S, [person('Pat', ['dairy', 'gluten'])]);
  assert.deepEqual(ws.map(w => w.id), ['r:' + ws[0].id.split(':')[1] + ':dairy', ws[1].id, 'f:hfcs', 'f:dyes'].map(x => x));
});

// ---- migration ----
t('migrate: schema 5, settings sanitized, old data untouched, bad nutrition dropped', () => {
  const old = { schema: 3, items: [{ id: 'a', name: 'Milk', nutrition: { nutrients: { calories: { amount: 100, unit: 'kcal' } }, source: 'openfoodfacts' } }, { id: 'b', name: 'Eggs', nutrition: 'junk' }], profiles: [], settings: { soonDays: 3, assumeStaples: true, warnIngredients: ['palm oil', '', 5] } };
  const db = migrate(old);
  assert.equal(db.schema, SCHEMA_VERSION); assert.equal(SCHEMA_VERSION, 6);
  assert.deepEqual(db.settings.warnIngredients, ['palm oil']); assert.deepEqual(db.settings.flagOverrides, {}); assert.equal(db.settings.soonDays, 3);
  assert.equal(db.items[0].nutrition!.nutrients.calories.amount, 100); assert.equal(db.items[1].nutrition, null);
  assert.deepEqual(migrate({ ...old, settings: { flagOverrides: { msg: true, dyes: 'x' } } }).settings.flagOverrides, { msg: true });
  assert.equal(emptyDB().schema, SCHEMA_VERSION);
});
console.log(`warnings tests: ${n} passed`);
