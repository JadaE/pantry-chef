// Nutrition label parser tests. Fixtures in tests/labels/*.txt are typed to look like real US labels as the
// on-device OCR returns them (rows already rebuilt), including OCR damage, an old-format label, dual-column
// "per serving / per container" labels and ML Kit's column-split ordering. Run: npx tsx tests/nutrition.test.ts
import assert from 'assert';
import { readFileSync } from 'fs';
import { parseLabel, parseIngredients, labelLooksUsable, dvPct } from '../src/nutrition';
let n = 0; const t = (name: string, f: () => void) => { try { f(); } catch (e) { console.error('FAILED: ' + name); throw e; } n++; };
const load = (f: string) => parseLabel(readFileSync(__dirname + `/labels/${f}.txt`, 'utf8'));
const amt = (p: ReturnType<typeof parseLabel>, k: string) => p.nutrition.nutrients[k]?.amount;
const dv = (p: ReturnType<typeof parseLabel>, k: string) => p.nutrition.nutrients[k]?.dv;

t('FDA sample label: every field', () => {
  const p = load('fda-sample'); const nu = p.nutrition;
  assert.equal(nu.servingSize, '2/3 cup (55g)'); assert.equal(nu.servingsPerContainer, 8); assert.equal(nu.servingQuantityG, 55);
  assert.equal(nu.calories, 230); assert.equal(nu.source, 'ocr');
  assert.deepEqual(['fat', 'saturatedFat', 'transFat', 'cholesterol', 'sodium', 'carbs', 'fiber', 'sugars', 'addedSugars', 'protein'].map(k => amt(p, k)), [8, 1, 0, 0, 160, 37, 4, 12, 10, 3]);
  assert.deepEqual(['fat', 'saturatedFat', 'cholesterol', 'sodium', 'carbs', 'fiber', 'addedSugars'].map(k => dv(p, k)), [10, 5, 0, 7, 13, 14, 20]);
  assert.deepEqual([amt(p, 'vitaminD'), dv(p, 'vitaminD'), amt(p, 'calcium'), dv(p, 'calcium'), amt(p, 'iron'), dv(p, 'iron'), amt(p, 'potassium'), dv(p, 'potassium')], [2, 10, 260, 20, 8, 45, 240, 6]);
  assert.equal(nu.nutrients.sodium.unit, 'mg'); assert.equal(nu.nutrients.calories.unit, 'kcal');
  assert.equal(p.dual, false); assert.deepEqual(p.suspect, []); assert.ok(labelLooksUsable(p));
  assert.equal(nu.perContainer, undefined);
  // same keys and units as Open Food Facts barcode data, plus per-100 g for later tracking
  assert.equal(nu.per100g!.sodium.amount, 290.91); assert.equal(nu.per100g!.calories.amount, 418.18);
  assert.deepEqual(nu.perServing, nu.nutrients); assert.ok(nu.rawText!.includes('Nutrition Facts'));
});
t('footnote numbers (2,000 calories) are never read as nutrients', () => { assert.equal(load('fda-sample').nutrition.calories, 230); });
t('dual-column soda: per serving and per container', () => {
  const p = load('soda-dual'); const nu = p.nutrition;
  assert.equal(p.dual, true); assert.equal(nu.servingsPerContainer, 2.5); assert.equal(nu.servingSize, '1 cup (240mL)'); assert.equal(nu.servingQuantityG, 240);
  assert.equal(nu.calories, 110); assert.equal(nu.perContainer!.calories.amount, 275);
  assert.deepEqual([amt(p, 'sodium'), dv(p, 'sodium'), nu.perContainer!.sodium.amount, nu.perContainer!.sodium.dv], [45, 2, 113, 5]);
  assert.deepEqual([amt(p, 'carbs'), nu.perContainer!.carbs.amount, nu.perContainer!.carbs.dv], [28, 70, 25]);
  assert.deepEqual([amt(p, 'sugars'), nu.perContainer!.sugars.amount], [27, 68]);
  assert.deepEqual([amt(p, 'addedSugars'), dv(p, 'addedSugars'), nu.perContainer!.addedSugars.amount, nu.perContainer!.addedSugars.dv], [27, 54, 68, 135]);
  assert.equal(amt(p, 'fat'), 0); assert.equal(amt(p, 'protein'), 0); assert.deepEqual(p.suspect, []);
});
t('messy OCR: Sodlum, Cholestero1, 470rng, Og, "Incl." and two nutrients on one row', () => {
  const p = load('mac-messy'); const nu = p.nutrition;
  assert.equal(nu.servingsPerContainer, 2); assert.equal(nu.servingSize, '1 cup (228g)'); assert.equal(nu.calories, 250);
  assert.deepEqual(['fat', 'saturatedFat', 'transFat', 'cholesterol', 'sodium', 'carbs', 'fiber', 'sugars', 'addedSugars', 'protein'].map(k => amt(p, k)), [12, 6, 1.5, 30, 470, 31, 0, 5, 3, 5]);
  assert.deepEqual([dv(p, 'sodium'), dv(p, 'fiber'), dv(p, 'addedSugars')], [20, 0, 6]);
  assert.deepEqual([amt(p, 'vitaminD'), amt(p, 'calcium'), dv(p, 'calcium'), amt(p, 'iron'), amt(p, 'potassium'), dv(p, 'potassium')], [0.1, 200, 15, 0.7, 470, 10]);
  assert.deepEqual(p.suspect, []);
});
t('ML Kit column-split order: names first, values after', () => {
  const p = load('fda-split-columns'); const nu = p.nutrition;
  assert.equal(nu.servingSize, '2/3 cup (55g)'); assert.equal(nu.servingsPerContainer, 8); assert.equal(nu.calories, 230);
  assert.deepEqual(['fat', 'saturatedFat', 'transFat', 'cholesterol', 'sodium', 'carbs', 'fiber', 'protein'].map(k => amt(p, k)), [8, 1, 0, 0, 160, 37, 4, 3]);
  assert.deepEqual(['fat', 'sodium', 'carbs', 'fiber'].map(k => dv(p, k)), [10, 7, 13, 14]);
});
t('old-format label: calories from fat ignored, %-only vitamins, "Sugars"', () => {
  const p = load('old-format-bread'); const nu = p.nutrition;
  assert.equal(nu.calories, 120); assert.equal(nu.servingsPerContainer, 20); assert.equal(nu.servingSize, '1 slice (28g)');
  assert.deepEqual(['fat', 'saturatedFat', 'sodium', 'carbs', 'fiber', 'sugars', 'protein'].map(k => amt(p, k)), [1.5, 0, 210, 22, 2, 2, 4]);
  assert.equal(p.nutrition.nutrients.addedSugars, undefined);
  assert.deepEqual([amt(p, 'calcium'), dv(p, 'calcium'), amt(p, 'iron'), dv(p, 'iron'), dv(p, 'vitaminA'), dv(p, 'vitaminC')], [null, 4, null, 8, 0, 0]);
  assert.ok(!p.found.includes('_ignore'));
});
t('"as packaged / as prepared" labels use the first column and store no per-container values', () => {
  const p = load('mix-as-prepared'); const nu = p.nutrition;
  assert.equal(p.dual, true); assert.equal(nu.perContainer, undefined); assert.equal(nu.servingsPerContainer, 6);
  assert.deepEqual([nu.calories, amt(p, 'fat'), amt(p, 'sodium'), dv(p, 'sodium'), amt(p, 'addedSugars'), amt(p, 'carbs')], [130, 0.5, 380, 17, 7, 27]);
});
t('a "g" misread as 9 ("89" for "8g") is repaired using the %DV; thousands commas and "less than 1g" work', () => {
  const p = load('chips-g9'); const nu = p.nutrition;
  assert.equal(amt(p, 'fat'), 8); assert.ok(p.notes.some(x => /Total fat/.test(x)));
  assert.equal(amt(p, 'sodium'), 1240); assert.equal(dv(p, 'sodium'), 54);
  assert.equal(amt(p, 'sugars'), 0.5); assert.equal(amt(p, 'transFat'), 0); assert.equal(amt(p, 'cholesterol'), 0);
  assert.equal(nu.servingsPerContainer, 6); assert.equal(nu.servingQuantityG, 28); assert.deepEqual(p.suspect, []);
});
t('servings and serving size on the same row as the header', () => {
  const p = load('side-by-side-header'); const nu = p.nutrition;
  assert.equal(nu.servingsPerContainer, 4); assert.equal(nu.servingSize, '1 cup (240g)'); assert.equal(nu.calories, 200);
  assert.deepEqual([amt(p, 'sodium'), dv(p, 'sodium'), amt(p, 'addedSugars'), dv(p, 'addedSugars'), amt(p, 'protein')], [690, 30, 4, 8, 9]);
});
t('a useless photo is not "usable"', () => { const p = load('bad-photo'); assert.equal(labelLooksUsable(p), false); assert.equal(amt(p, 'fat'), 12); });
t('cross-checks flag a value that disagrees with its %DV or the calories', () => {
  const p = parseLabel('Serving size 1 cup (240g)\nCalories 200\nTotal Fat 30g 4%\nTotal Carbohydrate 33g 12%\nProtein 9g\nSodium 690mg 30%');
  assert.ok(p.suspect.includes('fat')); assert.ok(p.notes.some(x => /Daily Value/.test(x)));
  const q = parseLabel('Calories 2300\nTotal Fat 3g 4%\nTotal Carbohydrate 33g 12%\nProtein 9g');
  assert.ok(q.suspect.includes('calories'));
  const r = parseLabel('Calories 100\nTotal Fat 1g 1%\nTotal Carbohydrate 10g 4%\nTotal Sugars 14g\nProtein 1g'); assert.ok(r.suspect.includes('sugars'));
});
t('typed text works too (no OCR needed)', () => {
  const p = parseLabel('Serving size 1 bar (40g)\nServings per container 6\nCalories 190\nTotal Fat 7g 9%\nSaturated Fat 3g 15%\nSodium 95mg 4%\nTotal Carbohydrate 28g 10%\nTotal Sugars 14g\nAdded Sugars 12g 24%\nProtein 4g');
  assert.deepEqual([p.nutrition.servingsPerContainer, amt(p, 'addedSugars'), dv(p, 'addedSugars'), amt(p, 'saturatedFat')], [6, 12, 24, 3]);
});
t('dvPct uses FDA reference values', () => { assert.equal(dvPct('sodium', 2300), 100); assert.equal(dvPct('addedSugars', 25), 50); assert.equal(dvPct('transFat', 1), null); assert.equal(dvPct('sodium', null), null); });

t('ingredients: header and trailer stripped, lines joined, hyphen kept', () => {
  const raw = 'INGREDIENTS: ENRICHED FLOUR (WHEAT FLOUR, NIACIN,\nREDUCED IRON), HIGH-\nFRUCTOSE CORN SYRUP, SOYBEAN OIL, SALT, RED 40.\nCONTAINS: WHEAT, SOY.\nDistributed by Example Foods, Anytown USA\nQuestions? Call 1-800-555-0100';
  assert.equal(parseIngredients(raw), 'ENRICHED FLOUR (WHEAT FLOUR, NIACIN, REDUCED IRON), HIGH-FRUCTOSE CORN SYRUP, SOYBEAN OIL, SALT, RED 40. CONTAINS: WHEAT, SOY.');
});
t('ingredients: a photo of just the list (no header) is kept whole', () => { assert.equal(parseIngredients('Whole grain oats,\nsugar, salt'), 'Whole grain oats, sugar, salt'); });
t('ingredients: header with OCR slip', () => { assert.equal(parseIngredients('lngredients: Milk, Cream. Best by: see lid'), 'Milk, Cream.'); });
console.log(`nutrition tests: ${n} passed`);
