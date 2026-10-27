// Receipt parser + shelf-life tests. Sample receipts in tests/receipts/*.txt are typed to look like real
// Walmart / H-E-B / Costco / Target receipts (plus one with OCR-style damage). Run: npx tsx tests/receipt.test.ts
import assert from 'assert';
import { readFileSync } from 'fs';
import { parseReceipt, rowsFromOcr, qtyLine } from '../src/receipt';
import { matchGrocery, shelfLifeFor } from '../src/groceries';
import { buildShopping } from '../src/logic';
import { estimateExpiry } from '../src/groceries';
let n = 0; const t = (name: string, f: () => void) => { f(); n++; };
const NOW = new Date(2026, 9, 26);
const load = (f: string) => parseReceipt(readFileSync(__dirname + `/receipts/${f}.txt`, 'utf8'), NOW);
const names = (r: ReturnType<typeof load>) => r.items.map(i => i.name);
const find = (r: ReturnType<typeof load>, nm: string) => { const i = r.items.find(x => x.name.toLowerCase() === nm.toLowerCase()); assert.ok(i, `missing ${nm} in ${names(r).join(' | ')}`); return i!; };

t('walmart', () => {
  const r = load('walmart');
  assert.equal(r.store, 'Walmart'); assert.equal(r.date, '2026-10-24');
  assert.deepEqual(names(r), ['Whole milk', 'Large white eggs', 'Boneless skinless chicken breast', 'Bananas', 'Shredded mozzarella', 'Roma tomatoes', 'White bread', 'Strawberries', 'Peanut butter creamy', 'Frozen broccoli', 'Bounty paper towels']);
  assert.deepEqual([find(r, 'Bananas').qty, find(r, 'Bananas').unit], [2.66, 'lb']);
  assert.equal(find(r, 'Large white eggs').qty, 18);
  assert.equal(find(r, 'White bread').qty, 2);
  assert.equal(find(r, 'Whole milk').category, 'Dairy & Eggs');
  assert.equal(find(r, 'Frozen broccoli').category, 'Frozen');
  assert.equal(find(r, 'Bounty paper towels').food, false);
  assert.ok(!names(r).some(x => /total|tax|visa|change|items/i.test(x)));
});
t('heb', () => {
  const r = load('heb');
  assert.equal(r.store, 'H-E-B'); assert.equal(r.date, '2026-10-25');
  assert.deepEqual(names(r), ['Whole milk', 'Chunk light tuna', 'Ground beef 80/20', 'Corn tortillas', 'Avocados hass', 'Yellow onions', 'Cucumbers', 'Sharp cheddar cheese', 'Greek yogurt plain']);
  assert.equal(find(r, 'Chunk light tuna').qty, 2); assert.equal(find(r, 'Chunk light tuna').category, 'Canned');
  assert.equal(find(r, 'Avocados hass').qty, 3);
  assert.deepEqual([find(r, 'Yellow onions').qty, find(r, 'Yellow onions').unit], [2.24, 'lb']);
  assert.equal(find(r, 'Corn tortillas').qty, 30);
  assert.equal(find(r, 'Ground beef 80/20').category, 'Meat & Fish');
});
t('costco', () => {
  const r = load('costco');
  assert.equal(r.store, 'Costco'); assert.equal(r.date, '2026-10-22');
  assert.deepEqual(names(r), ['Organic eggs', 'Whole milk', 'Bananas', 'Strawberries', 'Boneless skinless chicken breast', 'Extra virgin olive oil', 'Organic baby spinach', 'Toilet paper', 'Rotisserie chicken']);
  assert.equal(find(r, 'Organic eggs').qty, 24); assert.equal(find(r, 'Whole milk').qty, 2);
  assert.equal(find(r, 'Toilet paper').food, false);
});
t('target', () => {
  const r = load('target');
  assert.equal(r.store, 'Target'); assert.equal(r.date, '2026-10-23');
  assert.deepEqual(names(r), ['2% milk', 'Shredded cheddar', 'Baby carrots', 'White bread', 'Pasta sauce', 'Frozen pizza pepperoni', 'Cheerios', 'Dish soap']);
  assert.equal(find(r, 'Pasta sauce').qty, 2);
  assert.equal(find(r, 'Cheerios').category, 'Pantry');
});
t('ocr-damaged receipt', () => {
  const r = load('noisy');
  assert.equal(r.store, 'Walmart');
  assert.deepEqual(names(r), ['Whole milk', 'Strawberries', 'Bananas', 'Ground turkey', 'Chicken thighs', 'Organic spinach', 'Black beans', 'Spaghetti']);
});
t('rows from OCR boxes', () => {
  // ML Kit often returns the name column and the price column as separate blocks
  const rows = rowsFromOcr([
    { text: 'GV WHL MLK', left: 10, top: 100, right: 200, bottom: 120 }, { text: 'BANANAS', left: 10, top: 130, right: 150, bottom: 150 },
    { text: '3.48 N', left: 400, top: 102, right: 470, bottom: 121 }, { text: '1.33 N', left: 400, top: 131, right: 470, bottom: 151 },
  ]);
  assert.deepEqual(rows, ['GV WHL MLK  3.48 N', 'BANANAS  1.33 N']);
});
t('qty lines', () => {
  assert.deepEqual(qtyLine('2 @ 1.98'), { qty: 2, unit: 'pcs' });
  assert.deepEqual(qtyLine('2 AT 1 FOR 1.42 2.84 N'), { qty: 2, unit: 'pcs' });
  assert.deepEqual(qtyLine('1.54 LB @ 1 LB /0.69'), { qty: 1.54, unit: 'lb' });
  assert.equal(qtyLine('2% MILK 3.48'), null);
});
t('grocery matching + shelf life', () => {
  assert.equal(matchGrocery('boneless skinless chicken breast')!.g.name, 'chicken breast');
  assert.equal(matchGrocery('ground beef 80/20')!.g.name, 'ground beef');
  assert.equal(matchGrocery('strawberres')!.g.name, 'strawberries');
  assert.equal(matchGrocery('please come again'), null);
  assert.equal(shelfLifeFor('Whole milk', 'Dairy & Eggs')!.days, 7);
  assert.equal(shelfLifeFor('White bread', 'Bakery')!.days, 5);
  assert.equal(shelfLifeFor('Ground beef', 'Meat & Fish')!.days, 2);
  assert.equal(shelfLifeFor('Frozen broccoli', 'Frozen')!.days, 240);
  assert.equal(shelfLifeFor('Mystery thing', 'Canned')!.days, 540);
  assert.equal(shelfLifeFor('Mystery thing', 'Other'), null);
  assert.deepEqual(estimateExpiry('Whole milk', 'Dairy & Eggs', '2026-10-24'), { date: '2026-10-31', days: 7, basis: 'milk' });
  assert.equal(estimateExpiry('Paper towels', 'Other', '2026-10-24'), null);
});
t('shopping list', () => {
  const r = { id: '1', name: 'Pancakes', thumb: '', category: 'Breakfast', area: '', instructions: '', ingredients: [{ name: 'Flour', measure: '100g' }, { name: 'Eggs', measure: '2' }, { name: 'Milk', measure: '300ml' }, { name: 'Salt', measure: 'pinch' }, { name: 'Sunflower Oil', measure: '1 tbsp' }] };
  const have = [{ name: 'Large eggs', percentLeft: 100 } as any];
  const add = buildShopping([r], have, [], true);
  assert.deepEqual(add.map(a => a.name), ['Flour', 'Milk', 'Sunflower Oil']);
  const again = buildShopping([r], have, add.map(a => ({ ...a, id: 'x', checked: false, addedAt: 0 })), true);
  assert.equal(again.length, 0); // already on the list
});
console.log(`receipt tests: ${n} passed`);
