import assert from 'node:assert/strict';
import * as L from '../src/logic';
import type { Item } from '../src/types';
let n = 0; const t = (name: string, f: () => void) => { f(); n++; };
const now = new Date(2026, 9, 26, 15, 0);
const mk = (p: Partial<Item>): Item => ({ id: L.newId(), name: 'x', category: 'Other', quantity: 1, unit: 'pcs', percentLeft: 100, purchasedOn: null, expiresOn: null, photoUri: null, notes: '', createdAt: 0, updatedAt: 0, ...p });
t('dates', () => {
  assert.equal(L.daysUntil('2026-10-26', now), 0); assert.equal(L.daysUntil('2026-10-25', now), -1); assert.equal(L.daysUntil('2026-11-02', now), 7);
  assert.equal(L.parseISO('2026-02-30'), null); assert.equal(L.isValidISO('2026-1-5'), true);
  assert.equal(L.addMonths('2026-01-31', 1), '2026-02-28'); assert.equal(L.addDays('2026-12-30', 3), '2027-01-02');
});
t('status', () => {
  assert.equal(L.expiryStatus({ expiresOn: '2026-10-20' }, 5, now), 'expired');
  assert.equal(L.expiryStatus({ expiresOn: '2026-10-26' }, 5, now), 'today');
  assert.equal(L.expiryStatus({ expiresOn: '2026-10-29' }, 5, now), 'soon');
  assert.equal(L.expiryStatus({ expiresOn: '2026-11-02' }, 5, now), 'week');
  assert.equal(L.expiryStatus({ expiresOn: '2026-12-01' }, 5, now), 'ok');
  assert.equal(L.expiryStatus({ expiresOn: null }, 5, now), 'none');
  assert.equal(L.expiryLabel({ expiresOn: '2026-10-24' }, now), 'Expired 2 days ago');
});
t('filter/sort', () => {
  const a = [mk({ name: 'Milk', expiresOn: '2026-10-27' }), mk({ name: 'Apples', expiresOn: '2026-10-10' }), mk({ name: 'Rice', percentLeft: 10 }), mk({ name: 'Cheese', expiresOn: '2026-12-01', notes: 'cheddar' })];
  assert.deepEqual(L.sortItems(a, 'expiry').map(i => i.name), ['Apples', 'Milk', 'Cheese', 'Rice']);
  assert.deepEqual(L.filterItems(a, 'attention', '', null, 5, now).map(i => i.name), ['Milk', 'Apples']);
  assert.deepEqual(L.filterItems(a, 'low', '', null, 5, now).map(i => i.name), ['Rice']);
  assert.deepEqual(L.filterItems(a, 'all', 'chedd', null, 5, now).map(i => i.name), ['Cheese']);
  assert.deepEqual(L.summary(a, 5, now), { expired: 1, soon: 1, total: 4 });
});
t('ingredients', () => {
  assert.ok(L.ingredientMatches('Chicken Breasts', 'Chicken Breast'));
  assert.ok(L.ingredientMatches('chicken thighs', 'Chicken'));
  assert.ok(L.ingredientMatches('Eggs', 'Egg'));
  assert.ok(L.ingredientMatches('tomato', 'Cherry Tomatoes'));
  assert.ok(!L.ingredientMatches('Eggs', 'Egg Yolks'));
  assert.ok(!L.ingredientMatches('Rice', 'Rice Vinegar'));
  assert.ok(L.haveIngredient([], 'Salt', true)); assert.ok(!L.haveIngredient([], 'Salt', false));
  assert.deepEqual(L.ingredientQueries('Chicken Breasts'), ['chicken_breasts', 'chicken_breast', 'chicken', 'breast']);
  assert.deepEqual(L.ingredientQueries('Eggs'), ['eggs', 'egg']);
  assert.deepEqual(L.pantryNames([mk({ name: 'Store 2%', recipeName: 'milk' }), mk({ name: 'Gone', percentLeft: 0 })]), ['milk']);
});
t('recipes', () => {
  const m = { idMeal: '1', strMeal: 'Omelette', strCategory: 'Breakfast', strArea: 'French', strInstructions: 'STEP 1\r\nBeat eggs.\r\nSTEP 2\r\nCook.', strIngredient1: 'Eggs', strMeasure1: '3', strIngredient2: 'Salt', strMeasure2: 'pinch', strIngredient3: 'Cheese', strMeasure3: '50g', strIngredient4: '' };
  const r = L.parseMeal(m)!;
  assert.equal(r.ingredients.length, 3);
  assert.deepEqual(L.splitSteps(r.instructions), ['Beat eggs.', 'Cook.']);
  const cov = L.recipeCoverage(r, ['eggs'], true); assert.equal(cov.have, 2); assert.equal(cov.missing, 1);
  const by = L.rankByCategory([{ id: 'a', name: 'A', thumb: '', category: 'X', hits: 1 }, { id: 'b', name: 'B', thumb: '', category: 'X', hits: 3 }, { id: 'c', name: 'C', thumb: '', category: 'X', hits: 2 }], ['c']);
  assert.deepEqual(by.X.map(c => c.id), ['b', 'a']);
  assert.equal(L.pickForCategory(by.X, 3)!.id, 'a');
});
t('migrate', () => {
  const d = L.migrate({ items: [{ id: '1', name: 'Eggs' }, { bad: 1 }], settings: { soonDays: 3 } });
  assert.equal(d.items.length, 1); assert.equal(d.items[0].percentLeft, 100); assert.equal(d.settings.soonDays, 3); assert.equal(d.settings.assumeStaples, true);
  assert.deepEqual(d.shopping, []); assert.equal(L.migrate(null).items.length, 0);
  assert.equal(L.cleanQty('1,5'), 1.5); assert.equal(L.cleanQty('abc'), null);
});
t('dislikes', () => {
  assert.ok(L.dislikeMatches('cucumber', 'Cucumbers')); assert.ok(L.dislikeMatches('Cucumbers', 'cucumber'));
  assert.ok(L.dislikeMatches('banana', 'Bananas')); assert.ok(L.dislikeMatches('banana', 'Banana Bread'));
  assert.ok(L.dislikeMatches('pepper', 'Red Pepper')); assert.ok(!L.dislikeMatches('banana', 'Bacon'));
  assert.ok(!L.dislikeMatches('egg', 'Eggplant'));
  const a = { ...L.newProfile('A'), dislikes: ['cucumber'] }, b = { ...L.newProfile('B'), dislikes: ['banana', 'cucumbers'] }, g = { ...L.newProfile('G', true), restrictions: ['dairy', 'Gluten'] };
  const r = { ingredients: [{ name: 'Cucumber', measure: '1' }, { name: 'Bananas', measure: '2' }, { name: 'Salt', measure: '' }, { name: 'Unsalted Butter', measure: '' }, { name: 'Plain Flour', measure: '' }, { name: 'Peanut Butter', measure: '' }, { name: 'Rice Flour', measure: '' }] };
  const home = L.eaters([a, b, g], null); assert.deepEqual(home.map(p => p.name), ['A', 'B']);
  const cs = L.recipeConflicts(r, home);
  assert.deepEqual(cs.map(c => [c.ingredient, c.people]), [['Cucumber', ['A', 'B']], ['Bananas', ['B']]]);
  assert.equal(L.conflictText(cs), 'Cucumber (A, B), Bananas (B)');
  const withGuest = L.recipeConflicts(r, L.eaters([a, b, g], [a.id, g.id]));
  assert.deepEqual(withGuest.map(c => [c.ingredient, c.kind]), [['Unsalted Butter', 'restriction'], ['Plain Flour', 'restriction'], ['Cucumber', 'dislike']]);
  assert.ok(L.restrictionMatches('eggs', 'Egg Yolks')); assert.ok(!L.restrictionMatches('eggs', 'Eggplant'));
  assert.ok(L.restrictionMatches('nuts', 'Flaked Almonds')); assert.ok(!L.restrictionMatches('nuts', 'Coconut Milk')); assert.ok(!L.restrictionMatches('nuts', 'Nutmeg'));
  assert.ok(L.restrictionMatches('shellfish', 'King Prawns')); assert.ok(L.restrictionMatches('soy', 'Soy Sauce')); assert.ok(L.restrictionMatches('gluten', 'Soy Sauce'));
  assert.ok(L.restrictionMatches('dairy', 'Parmesan Cheese')); assert.ok(L.restrictionMatches('dairy', 'Greek Yogurt')); assert.ok(!L.restrictionMatches('dairy', 'Coconut Cream'));
  assert.ok(L.restrictionMatches('celery', 'Celery Sticks')); // unknown restriction -> literal match
  assert.deepEqual(L.addDislike(['cucumber'], 'Cucumbers, olives'), ['cucumber', 'olives']);
  assert.equal(a.limits.addedSugarsG, 50); assert.equal(a.limits.sodiumMg, 2300);
  const m = L.migrate({ profiles: [{ id: 'x', name: 'Z', limits: { sodiumMg: 1500 } }] });
  assert.equal(m.profiles[0].limits.sodiumMg, 1500); assert.equal(m.profiles[0].limits.addedSugarsG, 50); assert.deepEqual(m.profiles[0].dislikes, []);
});
console.log(`logic tests: ${n} passed`);
