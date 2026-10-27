// v0.0.6: Recipes sort + category toggles (persisted in db.recipePrefs), and the barcode screen's "Add N items" button.
// Run: npx tsx tests/recipesort.test.ts
import assert from 'assert';
import { sortRecipeCards, visibleCats, toggleCat, onlyCat, cleanRecipePrefs, DEFAULT_RECIPE_PREFS, RECIPE_SORTS } from '../src/recipeSort';
import type { SortCard } from '../src/recipeSort';
import { scanReady, scanEntriesToDrafts, scanAddLabel } from '../src/drafts';
import type { ScanEntry } from '../src/drafts';
import type { OffProduct } from '../src/off';
import { migrate } from '../src/logic';
import { emptyDB, SCHEMA_VERSION } from '../src/types';
let n = 0; const t = (name: string, f: () => void) => { try { f(); } catch (e) { console.error('FAILED: ' + name); throw e; } n++; };

const cards: SortCard[] = [
  { cat: 'Pasta', name: 'Carbonara', rank: 0, have: 4, total: 6 },     // 2 missing
  { cat: 'Chicken', name: 'apple chicken', rank: 1, have: 5, total: 5 }, // 0 missing
  { cat: 'Beef', name: 'Beef stew', rank: 2 },                          // not loaded yet
  { cat: 'Pasta', name: 'Arrabiata', rank: 3, have: 3, total: 4 },      // 1 missing
  { cat: 'Chicken', name: 'Zesty wings', rank: 4, have: 2, total: 4 },  // 2 missing
];
const names = (cs: SortCard[]) => cs.map(c => c.name);

t('best match keeps the pantry ranking order and does not mutate the input', () => {
  const shuffled = [cards[3], cards[0], cards[4], cards[2], cards[1]];
  assert.deepEqual(names(sortRecipeCards(shuffled, 'match')), ['Carbonara', 'apple chicken', 'Beef stew', 'Arrabiata', 'Zesty wings']);
  assert.equal(shuffled[0].name, 'Arrabiata');
});
t('fewest missing: by missing count, ties by rank, not-yet-loaded last', () => {
  assert.deepEqual(names(sortRecipeCards(cards, 'missing')), ['apple chicken', 'Arrabiata', 'Carbonara', 'Zesty wings', 'Beef stew']);
  // have > total never counts as negative missing
  assert.deepEqual(names(sortRecipeCards([{ cat: 'X', name: 'a', rank: 1, have: 9, total: 3 }, { cat: 'X', name: 'b', rank: 0, have: 3, total: 3 }], 'missing')), ['b', 'a']);
  // null have/total = unknown
  assert.deepEqual(names(sortRecipeCards([{ cat: 'X', name: 'a', rank: 0, have: null, total: 3 }, { cat: 'X', name: 'b', rank: 1, have: 0, total: 9 }], 'missing')), ['b', 'a']);
});
t('A–Z is case-insensitive', () => {
  assert.deepEqual(names(sortRecipeCards(cards, 'az')), ['apple chicken', 'Arrabiata', 'Beef stew', 'Carbonara', 'Zesty wings']);
});
t('category groups by category, best match first inside each', () => {
  assert.deepEqual(sortRecipeCards(cards, 'category').map(c => `${c.cat}:${c.name}`), ['Beef:Beef stew', 'Chicken:apple chicken', 'Chicken:Zesty wings', 'Pasta:Carbonara', 'Pasta:Arrabiata']);
});
t('every sort has a label; empty list is fine', () => {
  assert.deepEqual(RECIPE_SORTS.map(s => s.k), ['match', 'missing', 'az', 'category']);
  for (const s of RECIPE_SORTS) { assert.ok(s.label); assert.deepEqual(sortRecipeCards([], s.k), []); }
});

const ALL = ['Beef', 'Chicken', 'Pasta', 'Dessert'];
t('category toggles: hide, show again, new categories visible by default', () => {
  let h: string[] = [];
  h = toggleCat(ALL, h, 'Dessert'); assert.deepEqual(h, ['Dessert']);
  assert.deepEqual(visibleCats(ALL, h), ['Beef', 'Chicken', 'Pasta']);
  h = toggleCat(ALL, h, 'Beef'); assert.deepEqual(visibleCats(ALL, h), ['Chicken', 'Pasta']);
  h = toggleCat(ALL, h, 'Dessert'); assert.deepEqual(visibleCats(ALL, h), ['Chicken', 'Pasta', 'Dessert']);
  assert.deepEqual(visibleCats([...ALL, 'Seafood'], h), ['Chicken', 'Pasta', 'Dessert', 'Seafood']);
});
t('the last visible category cannot be hidden; long-press "only this"', () => {
  const only = onlyCat(ALL, 'Pasta');
  assert.deepEqual(visibleCats(ALL, only), ['Pasta']);
  assert.deepEqual(toggleCat(ALL, only, 'Pasta'), only);
  assert.deepEqual(visibleCats(ALL, toggleCat(ALL, only, 'Beef')), ['Beef', 'Pasta']);
});
t('cleanRecipePrefs sanitizes stored settings', () => {
  assert.deepEqual(cleanRecipePrefs(undefined), DEFAULT_RECIPE_PREFS);
  assert.deepEqual(cleanRecipePrefs({ sort: 'bogus', hiddenCats: 'x' }), { sort: 'match', hiddenCats: [] });
  assert.deepEqual(cleanRecipePrefs({ sort: 'az', hiddenCats: ['Beef', 'Beef', 3, '', ' ', 'Pasta'] }), { sort: 'az', hiddenCats: ['Beef', 'Pasta'] });
  assert.equal(cleanRecipePrefs({ sort: 'missing', hiddenCats: Array.from({ length: 80 }, (_, i) => `c${i}`) }).hiddenCats.length, 50);
});
t('recipePrefs persist through migrate(); old data gets the defaults; schema is 6', () => {
  assert.equal(SCHEMA_VERSION, 6);
  const db = emptyDB(); assert.deepEqual(db.recipePrefs, DEFAULT_RECIPE_PREFS);
  const saved = migrate({ ...db, recipePrefs: { sort: 'category', hiddenCats: ['Dessert'] } });
  assert.deepEqual(saved.recipePrefs, { sort: 'category', hiddenCats: ['Dessert'] });
  assert.equal(saved.schema, 6);
  const old: any = { ...emptyDB(), schema: 5 }; delete old.recipePrefs;
  assert.deepEqual(migrate(old).recipePrefs, DEFAULT_RECIPE_PREFS);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(saved))).recipePrefs, saved.recipePrefs);
});

// ---- barcode screen: "Add N items to pantry" ----
const prod = (code: string, name: string): OffProduct => ({ barcode: code, name, brand: null, category: 'Pantry', imageUrl: null, quantity: '400 g', nutrition: null, ingredientsText: null });
const e = (code: string, status: ScanEntry['status'], name = '', product?: OffProduct, count = 1): ScanEntry => ({ code, count, status, name, product, lastAt: 0 });
t('add button label/enabled state', () => {
  assert.deepEqual(scanAddLabel([]), { label: 'Scan a barcode to add it', enabled: false });
  assert.deepEqual(scanAddLabel([e('1', 'looking')]), { label: 'Looking up…', enabled: false });
  assert.deepEqual(scanAddLabel([e('1', 'missing')]), { label: 'Type a name to add it', enabled: false });
  assert.deepEqual(scanAddLabel([e('1', 'found', '', prod('1', 'Beans'))]), { label: 'Add 1 item to pantry', enabled: true });
  assert.deepEqual(scanAddLabel([e('1', 'found', '', prod('1', 'Beans')), e('2', 'missing', 'Tortillas'), e('3', 'looking')]), { label: 'Add 2 items to pantry', enabled: true });
});
t('scanned entries become pantry drafts (found, typed name, quantity, barcode kept)', () => {
  const list = [e('111', 'found', '', prod('111', 'Black beans'), 2), e('222', 'missing', '  Tortillas '), e('333', 'missing'), e('444', 'error'), e('555', 'found', 'My rice', prod('555', 'Rice'))];
  assert.equal(scanReady(list).length, 3);
  const ds = scanEntriesToDrafts(list);
  assert.deepEqual(ds.map(d => d.name), ['Black beans', 'Tortillas', 'My rice']);
  assert.ok(ds.every(d => d.name && d.checked && d.source === 'barcode' && d.expiresOn !== undefined));
  assert.equal(ds[0].qty, '2'); assert.equal(ds[0].barcode, '111'); assert.equal(ds[1].barcode, '222');
  assert.ok(JSON.stringify(ds[1]).includes('222'));
});
console.log(`recipesort tests: ${n} passed`);
