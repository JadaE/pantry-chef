// Pure logic (no React Native imports) so it can be unit-tested with tsx.
import type { Item, ISODate, RecipeDetail, RecipeSummary, DB, Profile, ShoppingItem } from './types';
import { emptyDB, SCHEMA_VERSION, DEFAULT_SETTINGS, FDA_DEFAULT_LIMITS } from './types';

const DAY = 86400000;
export const pad = (n: number) => (n < 10 ? '0' : '') + n;
export const toISO = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = (now = new Date()) => toISO(now);
export function parseISO(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
}
export const isValidISO = (s: string) => !!parseISO(s);
export function addDays(iso: ISODate, n: number): ISODate { const d = parseISO(iso)!; d.setDate(d.getDate() + n); return toISO(d); }
export function addMonths(iso: ISODate, n: number): ISODate { const d = parseISO(iso)!; const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return toISO(d); }
/** whole days from today to the date (negative = past) */
export function daysUntil(iso: ISODate | null, now = new Date()): number | null {
  const d = parseISO(iso); if (!d) return null;
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - t.getTime()) / DAY);
}

export type ExpiryStatus = 'expired' | 'today' | 'soon' | 'week' | 'ok' | 'none';
export function expiryStatus(item: Pick<Item, 'expiresOn'>, soonDays = 5, now = new Date()): ExpiryStatus {
  const n = daysUntil(item.expiresOn, now);
  if (n === null) return 'none';
  if (n < 0) return 'expired';
  if (n === 0) return 'today';
  if (n <= soonDays) return 'soon';
  if (n <= Math.max(7, soonDays)) return 'week';
  return 'ok';
}
export function expiryLabel(item: Pick<Item, 'expiresOn'>, now = new Date()): string {
  const n = daysUntil(item.expiresOn, now);
  if (n === null) return 'No date';
  if (n < -1) return `Expired ${-n} days ago`;
  if (n === -1) return 'Expired yesterday';
  if (n === 0) return 'Expires today';
  if (n === 1) return 'Expires tomorrow';
  if (n < 60) return `${n} days left`;
  return `Expires ${item.expiresOn}`;
}
export function leftLabel(pct: number): string {
  if (pct >= 100) return 'Full'; if (pct <= 0) return 'Empty';
  if (pct === 75) return '¾ left'; if (pct === 50) return 'Half left'; if (pct === 25) return '¼ left'; if (pct <= 10) return 'Low';
  return `${Math.round(pct)}% left`;
}

export type Filter = 'all' | 'attention' | 'expired' | 'nodate' | 'low';
export type Sort = 'expiry' | 'name' | 'recent' | 'category';
export function filterItems(items: Item[], f: Filter, query: string, category: string | null, soonDays: number, now = new Date()): Item[] {
  const q = query.trim().toLowerCase();
  return items.filter(it => {
    if (category && it.category !== category) return false;
    if (q && !(it.name.toLowerCase().includes(q) || it.notes.toLowerCase().includes(q) || it.category.toLowerCase().includes(q))) return false;
    const s = expiryStatus(it, soonDays, now);
    if (f === 'attention') return s === 'expired' || s === 'today' || s === 'soon';
    if (f === 'expired') return s === 'expired';
    if (f === 'nodate') return s === 'none';
    if (f === 'low') return it.percentLeft <= 25;
    return true;
  });
}
export function sortItems(items: Item[], s: Sort): Item[] {
  const a = items.slice();
  const name = (x: Item, y: Item) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' });
  if (s === 'name') return a.sort(name);
  if (s === 'recent') return a.sort((x, y) => y.createdAt - x.createdAt);
  if (s === 'category') return a.sort((x, y) => x.category.localeCompare(y.category) || name(x, y));
  // expiry: soonest first, undated last
  return a.sort((x, y) => {
    const dx = parseISO(x.expiresOn)?.getTime() ?? Infinity, dy = parseISO(y.expiresOn)?.getTime() ?? Infinity;
    return dx === dy ? name(x, y) : dx - dy;
  });
}
export function summary(items: Item[], soonDays: number, now = new Date()) {
  let expired = 0, soon = 0;
  for (const it of items) { const s = expiryStatus(it, soonDays, now); if (s === 'expired') expired++; else if (s === 'today' || s === 'soon') soon++; }
  return { expired, soon, total: items.length };
}

// ---------- ingredient matching ----------
const STAPLES = ['salt', 'water', 'black pepper', 'pepper', 'vegetable oil', 'olive oil', 'oil', 'sea salt', 'ice', 'cold water', 'hot water', 'warm water'];
const STOP = new Set(['fresh', 'organic', 'large', 'small', 'medium', 'whole', 'chopped', 'sliced', 'diced', 'frozen', 'canned', 'raw', 'of', 'and', 'the', 'a', 'free', 'range', 'boneless', 'skinless', 'low', 'fat', 'reduced', 'light', 'extra', 'virgin', 'unsalted', 'salted', 'dried', 'ground', 'minced', 'cold', 'hot', 'warm']);
export function singular(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
export function normWords(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)).map(singular);
}
export const normName = (s: string) => normWords(s).join(' ');
/** does pantry name `have` satisfy recipe ingredient `need`? */
export function ingredientMatches(have: string, need: string): boolean {
  const h = normWords(have), n = normWords(need);
  if (!h.length || !n.length) return false;
  if (h.join(' ') === n.join(' ')) return true;
  // every recipe word is in the pantry name (recipe "chicken" <- pantry "chicken thigh")
  if (n.every(w => h.includes(w))) return true;
  // every pantry word is in the recipe ingredient and the head noun (last word) matches (pantry "tomato" -> recipe "cherry tomatoes")
  if (h.every(w => n.includes(w)) && h[h.length - 1] === n[n.length - 1]) return true;
  return false;
}
export const pantryNames = (items: Item[]) => items.filter(i => i.percentLeft > 0).map(i => (i.recipeName && i.recipeName.trim()) || i.name);
export function isStaple(name: string) { const n = normName(name); return STAPLES.some(s => normName(s) === n); }
export function haveIngredient(names: string[], ingredient: string, assumeStaples: boolean) {
  if (assumeStaples && isStaple(ingredient)) return true;
  return names.some(h => ingredientMatches(h, ingredient));
}
export function recipeCoverage(r: RecipeDetail, names: string[], assumeStaples: boolean) {
  const marks = r.ingredients.map(ing => ({ ...ing, have: haveIngredient(names, ing.name, assumeStaples) }));
  const have = marks.filter(m => m.have).length;
  return { marks, have, missing: marks.length - have, total: marks.length };
}
/** TheMealDB ingredient query variants for a pantry name: "Chicken Breasts" -> chicken_breasts, chicken_breast, breast */
export function ingredientQueries(name: string): string[] {
  const raw = name.toLowerCase().replace(/[^a-z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const w = normWords(name);
  const out: string[] = [];
  const add = (a: string[]) => { const q = a.join('_'); if (q && !out.includes(q)) out.push(q); };
  add(raw); add(w); if (w.length > 1) { add([w[0]]); add([w[w.length - 1]]); }
  return out.slice(0, 4);
}

// ---------- household dislikes + restrictions ----------
/** loose match: every word of the term appears in the ingredient ("cucumber" ~ "Cucumbers", "Cucumber Slices"), or they match as names */
export function dislikeMatches(term: string, ingredient: string): boolean {
  const d = normWords(term), n = normWords(ingredient);
  if (!d.length || !n.length) return false;
  if (d.every(w => n.includes(w))) return true;
  return ingredientMatches(ingredient, term);
}
/** Built-in expansion of common restriction groups. `except` = look-alikes that are fine. Unknown restrictions match literally. */
export const RESTRICTION_RULES: Record<string, { label: string; terms: string[]; except?: string[] }> = {
  dairy: { label: 'Dairy', terms: ['dairy', 'milk', 'butter', 'cheese', 'cream', 'yogurt', 'yoghurt', 'whey', 'casein', 'ghee', 'buttermilk', 'creme fraiche', 'mascarpone', 'ricotta', 'mozzarella', 'parmesan', 'cheddar', 'feta', 'paneer', 'custard', 'ice cream', 'condensed milk', 'evaporated milk', 'lactose', 'quark', 'fromage frais', 'brie', 'gruyere', 'halloumi'],
    except: ['peanut butter', 'almond butter', 'cocoa butter', 'coconut milk', 'coconut cream', 'almond milk', 'soy milk', 'oat milk', 'rice milk', 'cream of tartar', 'dairy free', 'vegan butter', 'vegan cheese', 'butter bean', 'butternut'] },
  gluten: { label: 'Gluten', terms: ['gluten', 'wheat', 'flour', 'barley', 'rye', 'spelt', 'semolina', 'bulgur', 'couscous', 'farro', 'malt', 'bread', 'breadcrumb', 'pasta', 'spaghetti', 'macaroni', 'noodle', 'lasagne', 'lasagna', 'penne', 'fettuccine', 'linguine', 'tagliatelle', 'rigatoni', 'fusilli', 'farfalle', 'orzo', 'tortilla', 'pastry', 'filo', 'phyllo', 'biscuit', 'cracker', 'beer', 'soy sauce', 'seitan', 'panko', 'pita', 'naan', 'bun', 'baguette', 'brioche', 'croissant', 'digestive biscuit', 'self raising flour', 'yorkshire pudding'],
    except: ['rice flour', 'corn flour', 'almond flour', 'coconut flour', 'gluten free', 'rice noodle', 'corn tortilla', 'tamari', 'buckwheat', 'chickpea flour', 'gram flour', 'potato flour', 'tapioca flour', 'gluten free pasta'] },
  nuts: { label: 'Tree nuts', terms: ['nut', 'almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut', 'pine nut', 'praline', 'marzipan', 'nutella', 'frangipane', 'chestnut', 'almond extract', 'amaretto'], except: ['coconut', 'nutmeg', 'butternut', 'water chestnut', 'doughnut', 'donut'] },
  peanuts: { label: 'Peanuts', terms: ['peanut', 'peanut butter', 'groundnut', 'satay'] },
  shellfish: { label: 'Shellfish', terms: ['shellfish', 'shrimp', 'prawn', 'king prawn', 'crab', 'lobster', 'crayfish', 'scallop', 'mussel', 'clam', 'oyster', 'langoustine', 'squid', 'octopus', 'calamari', 'cockle', 'whelk'] },
  fish: { label: 'Fish', terms: ['fish', 'salmon', 'tuna', 'cod', 'haddock', 'anchovy', 'sardine', 'mackerel', 'trout', 'tilapia', 'halibut', 'sea bass', 'monkfish', 'pollock', 'herring', 'kipper', 'fish sauce', 'worcestershire sauce', 'red snapper', 'sole', 'plaice'] },
  eggs: { label: 'Eggs', terms: ['egg', 'egg yolk', 'egg white', 'mayonnaise', 'meringue', 'aioli', 'hollandaise'], except: ['eggplant', 'egg free'] },
  soy: { label: 'Soy', terms: ['soy', 'soya', 'soy sauce', 'tofu', 'edamame', 'miso', 'tamari', 'soybean', 'tempeh'] },
  pork: { label: 'Pork', terms: ['pork', 'bacon', 'ham', 'chorizo', 'pancetta', 'prosciutto', 'lard', 'salami', 'pepperoni', 'sausage', 'gammon', 'pork belly', 'black pudding'] },
  sesame: { label: 'Sesame', terms: ['sesame', 'tahini', 'sesame oil', 'sesame seed'] },
};
export const ruleKey = (r: string) => { const n = normName(r); return Object.keys(RESTRICTION_RULES).find(k => normName(k) === n || normName(RESTRICTION_RULES[k].label) === n || (k === 'eggs' && n === 'egg') || (k === 'nuts' && n === 'tree nut') || (k === 'peanuts' && n === 'peanut')); };
/** does a hard restriction (group name or literal ingredient) rule out this ingredient? */
export function restrictionMatches(restriction: string, ingredient: string): boolean {
  const k = ruleKey(restriction);
  if (!k) return dislikeMatches(restriction, ingredient);
  const rule = RESTRICTION_RULES[k];
  const raw = (x: string) => x.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).map(singular);
  const n = raw(ingredient);
  if (rule.except && rule.except.some(e => { const w = raw(e); return w.length > 0 && w.every(x => n.includes(x)); })) return false; // strict: every word of the look-alike present
  return rule.terms.some(t => dislikeMatches(t, ingredient));
}
export type Conflict = { ingredient: string; kind: 'restriction' | 'dislike'; reasons: string[]; people: string[] };
/** which ingredients in the recipe conflict with the given people (pass only the people who are eating) */
export function recipeConflicts(r: Pick<RecipeDetail, 'ingredients'>, people: Profile[]): Conflict[] {
  const out: Conflict[] = [];
  const hit = (ing: string, kind: Conflict['kind'], reason: string, who: string) => {
    let c = out.find(x => x.ingredient === ing);
    if (!c) { c = { ingredient: ing, kind, reasons: [], people: [] }; out.push(c); }
    if (kind === 'restriction') c.kind = 'restriction';
    if (!c.reasons.includes(reason)) c.reasons.push(reason);
    if (!c.people.includes(who)) c.people.push(who);
  };
  for (const ing of r.ingredients) for (const p of people) {
    for (const x of p.restrictions || []) if (restrictionMatches(x, ing.name)) hit(ing.name, 'restriction', (RESTRICTION_RULES[ruleKey(x) || ''] || { label: x }).label, p.name);
    for (const d of p.dislikes || []) if (dislikeMatches(d, ing.name)) hit(ing.name, 'dislike', d, p.name);
  }
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'restriction' ? -1 : 1));
}
export const conflictText = (cs: Conflict[]) => cs.map(c => `${c.ingredient} (${c.kind === 'restriction' ? `can't have ${c.reasons.join('/')}: ` : ''}${c.people.join(', ')})`).join(', ');
/** who's eating: the remembered selection (still-existing people), or else everyone who isn't a guest */
export function eaters(profiles: Profile[], eatingIds: string[] | null): Profile[] {
  if (eatingIds) { const sel = profiles.filter(p => eatingIds.includes(p.id)); return sel; }
  return profiles.filter(p => !p.guest);
}
export function newProfile(name: string, guest = false): Profile {
  return { id: newId(), name: name.trim(), guest, dislikes: [], restrictions: [], limits: { ...FDA_DEFAULT_LIMITS }, goals: [], createdAt: Date.now() };
}
export function addDislike(list: string[], raw: string): string[] {
  const parts = raw.split(/[,;\n]/).map(x => x.trim().toLowerCase()).filter(Boolean);
  const out = list.slice();
  for (const x of parts) if (!out.some(y => normName(y) === normName(x))) out.push(x);
  return out;
}

// ---------- recipe suggestions ----------
export type Candidate = RecipeSummary & { hits: number };
/** Rank candidates per category: most pantry hits first, then name for stability. Excludes dismissed. */
export function rankByCategory(cands: Candidate[], dismissed: string[]): Record<string, Candidate[]> {
  const dis = new Set(dismissed); const by: Record<string, Candidate[]> = {};
  for (const c of cands) { if (dis.has(c.id) || !c.category) continue; (by[c.category] ||= []).push(c); }
  for (const k in by) by[k].sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name));
  return by;
}
export function pickForCategory(list: Candidate[] | undefined, offset: number): Candidate | null {
  if (!list || !list.length) return null;
  return list[((offset % list.length) + list.length) % list.length];
}
/** parse one TheMealDB lookup.php meal object */
export function parseMeal(m: any): RecipeDetail | null {
  if (!m || !m.idMeal) return null;
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const n = String(m['strIngredient' + i] || '').trim(); if (!n) continue;
    ingredients.push({ name: n, measure: String(m['strMeasure' + i] || '').trim() });
  }
  return {
    id: String(m.idMeal), name: String(m.strMeal || 'Recipe'), thumb: String(m.strMealThumb || ''), category: String(m.strCategory || ''),
    area: String(m.strArea || m.strCountry || ''), instructions: String(m.strInstructions || ''), ingredients,
    youtube: m.strYoutube || undefined, source: m.strSource || undefined, tags: m.strTags ? String(m.strTags).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
  };
}
export function splitSteps(text: string): string[] {
  const lines = text.replace(/\r/g, '').split(/\n+/).map(s => s.replace(/^\s*(step\s*\d+[:.)]?|\d+[.)])\s*/i, '').trim()).filter(s => s.length > 1 && !/^step\s*\d+$/i.test(s));
  if (lines.length > 1) return lines;
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean);
}

// ---------- persistence helpers ----------
export function migrate(raw: any): DB {
  const base = emptyDB();
  if (!raw || typeof raw !== 'object') return base;
  const db: DB = { ...base, ...raw, settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) } };
  db.items = Array.isArray(raw.items) ? raw.items.filter((i: any) => i && i.id && typeof i.name === 'string').map((i: any) => ({
    category: 'Other', quantity: null, unit: '', percentLeft: 100, purchasedOn: null, expiresOn: null, photoUri: null, notes: '', createdAt: Date.now(), updatedAt: Date.now(), ...i,
  })) : [];
  db.profiles = Array.isArray(raw.profiles) ? raw.profiles.filter((p: any) => p && p.id && typeof p.name === 'string').map((p: any) => ({
    guest: false, dislikes: [], restrictions: [], goals: [], createdAt: Date.now(), ...p, limits: { ...FDA_DEFAULT_LIMITS, ...(p.limits || {}) },
  })) : [];
  for (const k of ['bookmarks', 'dismissedRecipes', 'shopping', 'intake'] as const) if (!Array.isArray((db as any)[k])) (db as any)[k] = [];
  // v0.0.3: cooking progress + timers (both optional; anything malformed is dropped)
  const cp: Record<string, any> = {};
  if (raw.cookingProgress && typeof raw.cookingProgress === 'object') for (const [k, v] of Object.entries<any>(raw.cookingProgress)) {
    if (typeof v === 'number') cp[k] = { step: Math.max(0, Math.floor(v)), started: true, checked: [], at: Date.now() };
    else if (v && typeof v.step === 'number') cp[k] = { step: Math.max(0, Math.floor(v.step)), started: !!v.started, checked: Array.isArray(v.checked) ? v.checked.filter((x: any) => Number.isInteger(x)) : [], at: Number(v.at) || Date.now() };
  }
  db.cookingProgress = cp;
  db.timers = Array.isArray(raw.timers) ? raw.timers.filter((t: any) => t && typeof t.id === 'string' && typeof t.endsAt === 'number' && typeof t.seconds === 'number').slice(0, 30) : [];
  if (!Array.isArray(db.eatingIds)) db.eatingIds = null;
  if (!db.categoryOffset || typeof db.categoryOffset !== 'object') db.categoryOffset = {};
  db.schema = SCHEMA_VERSION;
  return db;
}
// ---------- shopping list ----------
/** Missing ingredients from recipes -> new shopping entries. Skips what's in the pantry, staples (if assumed)
 *  and anything already on the list (unchecked), merging duplicates across recipes. */
export function buildShopping(recipes: RecipeDetail[], items: Item[], existing: ShoppingItem[], assumeStaples: boolean): Omit<ShoppingItem, 'id' | 'checked' | 'addedAt'>[] {
  const names = pantryNames(items);
  const out: Omit<ShoppingItem, 'id' | 'checked' | 'addedAt'>[] = [];
  const onList = (n: string) => existing.some(e => !e.checked && (normName(e.name) === normName(n) || ingredientMatches(e.name, n))) || out.some(o => normName(o.name) === normName(n));
  for (const r of recipes) for (const ing of r.ingredients) {
    if (!ing.name.trim() || haveIngredient(names, ing.name, assumeStaples) || onList(ing.name)) continue;
    out.push({ name: ing.name.trim(), measure: ing.measure?.trim() || undefined, fromRecipeId: r.id, fromRecipeName: r.name });
  }
  return out;
}
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export function cleanQty(s: string): number | null { const t = s.replace(',', '.').trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null; }
