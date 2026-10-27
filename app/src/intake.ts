// Intake tracking (v0.0.5), all pure logic and all on-device:
//   - text/voice parser: "ate 2 servings of chips", "half the mac and cheese", "a bowl of cereal", "had the leftover tacos for lunch"
//   - fuzzy pantry matching, amount -> servings -> calories/nutrients from the item's label data (OCR or Open Food Facts)
//   - day / week / goal-range totals, limits + dated goals, 80% / 100% warnings (also BEFORE logging)
//   - edit (rescale) entries, lower the pantry amount left
import type { IntakeEntry, Item, Meal, NutrientAmount, NutritionFacts, Profile } from './types';
import { addDays, newId, parseISO, singular, toISO, todayISO } from './logic';
import { servingNutrients, servingsInPackage } from './warnings';

// ---------------------------------------------------------------- meals and days
export function mealForHour(h: number): Meal {
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 15 && h < 17) return 'snack';
  if (h >= 17 && h < 21) return 'dinner';
  return 'snack';
}
export const MEAL_ICON: Record<Meal, string> = { breakfast: '🍳', lunch: '🥪', dinner: '🍽️', snack: '🍎' };
export const dayOf = (at: number) => toISO(new Date(at));
/** the instant to record: now, or noon-ish of an earlier day keeping the meal's usual hour */
export function atFor(dayOffset: number, meal: Meal, now = new Date()): number {
  if (!dayOffset) return now.getTime();
  const d = new Date(now); d.setDate(d.getDate() + dayOffset);
  d.setHours({ breakfast: 8, lunch: 12, dinner: 18, snack: 15 }[meal], 0, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------- number formatting
const FR: [number, string][] = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];
export function fmtQty(n: number): string {
  const whole = Math.floor(n + 1e-9), frac = n - whole;
  const f = FR.find(([v]) => Math.abs(frac - v) < 0.02);
  if (f) return whole ? `${whole}${f[1]}` : f[1];
  if (Math.abs(frac) < 0.02) return String(whole);
  if (Math.abs(frac - 1) < 0.02) return String(whole + 1);
  return String(Math.round(n * 10) / 10);
}
const plural = (n: number, w: string) => (Math.abs(n - 1) < 0.02 ? w : w + 's');
export const servingsText = (n: number) => `${fmtQty(n)} ${n > 0 && n <= 1 ? 'serving' : 'servings'}`;

// ---------------------------------------------------------------- the parser
export type Amount =
  | { kind: 'servings'; n: number }
  | { kind: 'count'; n: number; noun?: string }            // "3 cookies", "2 slices"
  | { kind: 'fraction'; f: number }                         // "half the pizza": a fraction of what is left of the pantry item
  | { kind: 'container'; n: number }                        // "a can of soup": whole packages
  | { kind: 'rest' }                                        // "the rest", "all of it"
  | { kind: 'measure'; n: number; unit: string }            // "150 g", "a cup", "a bowl"
  | { kind: 'default' };                                    // nothing said: one serving
export type LogPart = { text: string; query: string; amount: Amount; matches: { item: Item; score: number }[]; item: Item | null };
export type ParsedLog = { parts: LogPart[]; meal?: Meal; dayOffset: number; people: string[]; raw: string };

const NUMW: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2, pair: 2 };
const UNICODE_FR: Record<string, string> = { '½': ' 1/2', '¼': ' 1/4', '¾': ' 3/4', '⅓': ' 1/3', '⅔': ' 2/3' };
const FRACW: [RegExp, number][] = [[/^(?:a\s+)?half\b/, 0.5], [/^(?:a\s+)?quarter\b/, 0.25], [/^(?:a\s+)?third\b/, 1 / 3], [/^two[- ]thirds\b/, 2 / 3], [/^three[- ]quarters\b/, 0.75]];
const MEASURE: Record<string, string> = { g: 'g', gram: 'g', grams: 'g', kg: 'kg', oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', ml: 'ml', l: 'l', liter: 'l', liters: 'l', litre: 'l', cup: 'cup', cups: 'cup', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', bowl: 'bowl', bowls: 'bowl', glass: 'glass', glasses: 'glass', mug: 'glass', mugs: 'glass', handful: 'handful', handfuls: 'handful' };
const CONTAINER = new Set(['can', 'cans', 'bottle', 'bottles', 'bag', 'bags', 'box', 'boxes', 'packet', 'packets', 'pack', 'packs', 'jar', 'jars', 'carton', 'cartons', 'container', 'containers', 'tub', 'tubs', 'pouch', 'pouches']);
const PIECE = new Set(['slice', 'slices', 'piece', 'pieces', 'bite', 'bites', 'scoop', 'scoops', 'stick', 'sticks', 'strip', 'strips']);
const VERBS = '(?:ate|eat|eaten|eating|had|have|having|drank|drink|drinking|finished|consumed|snacked on|munched on|munched|enjoyed|grabbed|got|log|logged|add|added|just ate|just had)';
const FILLER = /\b(?:please|today|earlier|just now|just|also|too|as well|again)\b/g;

const cleanText = (t: string) => {
  let s = t.toLowerCase().replace(/[½¼¾⅓⅔]/g, m => UNICODE_FR[m]).replace(/[’']/g, '').replace(/[^a-z0-9/.%&+,\s-]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Parse the quantity at the START of s. Returns the amount and the rest of the string. */
export function parseQuantity(s: string): { amount: Amount | null; rest: string } {
  s = s.replace(/[½¼¾⅓⅔]/g, m => UNICODE_FR[m]).trim();
  // "150g", "150 grams", "2 oz"
  let m = s.match(/^(\d+(?:\.\d+)?)\s*(g|grams?|kg|oz|ounces?|lbs?|pounds?|ml|l|liters?|litres?)\b\s*(?:of\s+)?/);
  if (m) return { amount: { kind: 'measure', n: Number(m[1]), unit: MEASURE[m[2]] }, rest: s.slice(m[0].length) };
  let n: number | null = null, len = 0, isFracWord = false;
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)\b/))) { n = Number(m[1]) + Number(m[2]) / Number(m[3]); len = m[0].length; }
  else if ((m = s.match(/^(\d+)\/(\d+)\b/))) { n = Number(m[1]) / Number(m[2]); len = m[0].length; if (n > 1.01) n = null; }
  else if ((m = s.match(/^(\d+(?:\.\d+)?)\b/))) { n = Number(m[1]); len = m[0].length; }
  else if ((m = s.match(/^(one|two|three|four|five|six|a)\s+and\s+(?:a\s+)?half\b/))) { n = NUMW[m[1]] + 0.5; len = m[0].length; }
  else if ((m = s.match(/^(?:a\s+)?couple(?:\s+of)?\b/))) { n = 2; len = m[0].length; }
  else {
    for (const [re, v] of FRACW) { const mm = s.match(re); if (mm) { n = v; len = mm[0].length; isFracWord = true; break; } }
    if (n == null && (m = s.match(/^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/))) { n = NUMW[m[1]]; len = m[0].length; }
  }
  if (n == null || !Number.isFinite(n)) return { amount: null, rest: s };
  let rest = s.slice(len).trim();
  if (isFracWord) rest = rest.replace(/^(?:of\s+)?(?:the\s+|a\s+|an\s+)?/, '');
  else rest = rest.replace(/^(?:of\s+)?/, '');
  const w = rest.match(/^([a-z]+)\b/)?.[1] || '';
  const after = (k: number) => rest.slice(k).trim().replace(/^of\s+(?:the\s+)?/, '');
  if (/^servings?$|^portions?$/.test(w)) return { amount: { kind: 'servings', n }, rest: after(w.length) };
  if (MEASURE[w]) return { amount: { kind: 'measure', n, unit: MEASURE[w] }, rest: after(w.length) };
  if (CONTAINER.has(w)) return isFracWord ? { amount: { kind: 'fraction', f: n }, rest: after(w.length) } : { amount: { kind: 'container', n }, rest: after(w.length) };
  if (PIECE.has(w)) return { amount: { kind: 'count', n, noun: singular(w) }, rest: after(w.length) };
  if (isFracWord) return { amount: { kind: 'fraction', f: n }, rest };
  return { amount: { kind: 'count', n }, rest };
}

const STOPQ = new Set(['the', 'a', 'an', 'of', 'some', 'my', 'our', 'more', 'another', 'leftover', 'leftovers', 'left', 'over', 'remaining', 'from', 'fridge', 'freezer', 'with', 'in', 'on', 'at', 'for', 'to', 'it', 'that', 'this', 'there']);
const tok = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
const stem = (w: string) => singular(w).replace(/(?<=.{3})ie$/, 'y');   // cookies/cookie -> cooky, so both spellings meet
const qTokens = (s: string) => tok(s).filter(w => !STOPQ.has(w) && w !== 'and').map(stem);
const iTokens = (s: string) => tok(s).filter(w => !STOPQ.has(w) && w !== 'and').map(stem);

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let prev = dp[0]; dp[0] = i; for (let j = 1; j <= b.length; j++) { const t = dp[j]; dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
  return dp[b.length];
}
function tokSim(q: string, t: string): number {
  if (q === t) return 1;
  if (q.length >= 4 && t.length >= 4 && (t.startsWith(q) || q.startsWith(t))) return 0.85;
  if (q.length >= 5 && editDistance(q, t, 1) <= 1) return 0.8;
  if (q.length >= 8 && editDistance(q, t, 2) <= 2) return 0.7;
  return 0;
}
/** How well does the spoken/typed name match this pantry item? 0..1 */
export function matchScore(query: string, item: Item): number {
  const q = qTokens(query); if (!q.length) return 0;
  const names = [item.name, [item.brand, item.name].filter(Boolean).join(' '), item.recipeName || ''].filter(Boolean);
  let best = 0;
  for (const nm of names) {
    const t = iTokens(nm); if (!t.length) continue;
    let sum = 0, hit = new Set<number>();
    for (const w of q) { let b = 0, bi = -1; t.forEach((x, i) => { const s = tokSim(w, x); if (s > b) { b = s; bi = i; } }); sum += b; if (b > 0) hit.add(bi); }
    // the last word of a name is its head noun: query "chips" should prefer "Potato Chips" over "Chocolate Chip Cookies"
    const head = tokSim(q[q.length - 1], t[t.length - 1]) >= 0.85 ? 0.08 : 0;
    const score = Math.min(1, (sum / q.length) * (0.75 + 0.25 * (hit.size / t.length)) + head);
    if (score > best) best = score;
  }
  return best;
}
export function matchItems(query: string, items: Item[], recentIds: string[] = []): { item: Item; score: number }[] {
  const out: { item: Item; score: number }[] = [];
  for (const it of items) {
    let s = matchScore(query, it); if (s < 0.5) continue;
    if (it.percentLeft <= 0) s -= 0.2;
    if (recentIds.includes(it.id)) s += 0.03;
    if (it.nutrition) s += 0.02;
    out.push({ item: it, score: Math.min(1, Math.round(s * 1000) / 1000) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

const REST_RE = /\b(?:the rest of|the rest|all of|all the|the remaining|whatever(?: was)? left|the whole|the entire|finished off|finished|all)\b/;
function parseSegment(seg: string, items: Item[], recentIds: string[]): LogPart {
  let s = seg.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  let amount: Amount | null = null;
  // "finished the cereal" means the rest of it
  const fin = s.match(/^(?:(?:i|we|just)\s+)*finished(?:\s+off)?\s+/);
  if (fin) { amount = { kind: 'rest' }; s = s.slice(fin[0].length).replace(/^(?:the\s+|my\s+|all\s+of\s+)/, ''); }
  // verbs / lead-ins: "ate", "i just had", "log"
  for (let i = 0; i < 3; i++) s = s.replace(new RegExp(`^(?:(?:i|we|me|my|also|then|and|just)\\s+)*${VERBS}\\s+`), '').replace(/^(?:some|a bit of|a little|a little bit of)\s+/, '');
  if (amount) { /* already known */ }
  else if (REST_RE.test(s)) { amount = { kind: 'rest' }; s = s.replace(REST_RE, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:of\s+)?(?:the\s+)?/, ''); }
  else { const q = parseQuantity(s); amount = q.amount; s = q.rest; }
  const query = s.replace(/\b(?:leftover|leftovers|left over)\b/g, ' ').replace(/^(?:of\s+)?(?:the\s+|my\s+|some\s+)/, '').replace(/\s+/g, ' ').trim();
  const matches = query ? matchItems(query, items, recentIds) : [];
  const top = matches[0];
  return { text: seg, query, amount: amount || { kind: 'default' }, matches, item: top && top.score >= 0.6 ? top.item : null };
}

export function parseLog(text: string, items: Item[], profiles: Profile[] = [], recentIds: string[] = []): ParsedLog {
  let s = cleanText(text);
  const raw = text;
  let meal: Meal | undefined, dayOffset = 0;
  // when
  if (/\byesterday\b/.test(s)) { dayOffset = -1; s = s.replace(/\byesterday\b/, ' '); }
  if (/\bthis morning\b/.test(s)) { meal = 'breakfast'; s = s.replace(/\bthis morning\b/, ' '); }
  const mm = s.match(/\b(?:(?:for|at|as|during)\s+)?(?:my\s+|the\s+|a\s+)?(breakfast|brunch|lunch|dinner|supper|snack)\b/);
  if (mm && /(?:for|at|as|during)\s+(?:my\s+|the\s+|a\s+)?(?:breakfast|brunch|lunch|dinner|supper|snack)\b/.test(s)) {
    meal = ({ breakfast: 'breakfast', brunch: 'breakfast', lunch: 'lunch', dinner: 'dinner', supper: 'dinner', snack: 'snack' } as Record<string, Meal>)[mm[1]];
    s = s.replace(/\b(?:for|at|as|during)\s+(?:my\s+|the\s+|a\s+)?(?:breakfast|brunch|lunch|dinner|supper|snack)\b/, ' ');
  }
  // who: "for Sam and Jo" at the end, or "Sam ate ..." at the start
  const people: string[] = [];
  const names = profiles.map(p => ({ id: p.id, n: cleanText(p.name) })).filter(x => x.n).sort((a, b) => b.n.length - a.n.length);
  if (names.length) {
    const alt = names.map(x => esc(x.n)).join('|');
    const list = `(?:${alt})(?:\\s*(?:,|and|&)\\s*(?:${alt}))*`;
    const tailRe = new RegExp(`\\bfor\\s+(${list})\\s*$`), headRe = new RegExp(`^(${list})\\s+(?:both\\s+)?(?=${VERBS}\\b)`);
    const grab = (g: string) => { for (const x of names) if (new RegExp(`(?:^|[\\s,&])${esc(x.n)}(?=$|[\\s,&])`).test(g) && !people.includes(x.id)) people.push(x.id); };
    let m = s.match(tailRe); if (m) { grab(m[1]); s = s.replace(tailRe, ' '); }
    else if ((m = s.match(headRe))) { grab(m[1]); s = s.replace(headRe, ' '); }
  }
  s = s.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  // one item or several?
  const whole = parseSegment(s, items, recentIds);
  let parts: LogPart[] = [whole];
  if (!(whole.item && whole.matches[0].score >= 0.75)) {
    const segs = s.split(/\s*(?:,|\+|&|\band\b|\bplus\b)\s*/).map(x => x.trim()).filter(Boolean);
    if (segs.length >= 2 && segs.length <= 5) {
      // the verb only leads the first segment; later segments inherit nothing
      const ps = segs.map(g => parseSegment(g, items, recentIds));
      if (ps.some(p => p.item) && ps.every(p => p.query)) parts = ps;
    }
  }
  return { parts: parts.filter(p => p.query || p.item), meal, dayOffset, people, raw };
}

// ---------------------------------------------------------------- serving sizes and amounts
export type ServingInfo = { qty: number | null; noun: string; dim: 'volume' | 'mass' | 'count' | null; ml: number | null; g: number | null };
const VOL_ML: Record<string, number> = { cup: 240, tbsp: 15, tsp: 5, ml: 1, l: 1000, floz: 29.57, bowl: 360, glass: 240 };
const MASS_G: Record<string, number> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6, handful: 28 };
function parseFrac(t: string): number | null {
  let m = t.match(/^\s*(\d+)\s+(\d+)\/(\d+)/); if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^\s*(\d+)\/(\d+)/); if (m) return Number(m[1]) / Number(m[2]);
  m = t.match(/^\s*(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null;
}
export function parseServingSize(sz: string | undefined | null): ServingInfo {
  const info: ServingInfo = { qty: null, noun: '', dim: null, ml: null, g: null };
  if (!sz) return info;
  const t = sz.toLowerCase().replace(/[½¼¾⅓⅔]/g, m => UNICODE_FR[m]);
  const qty = parseFrac(t); info.qty = qty;
  const pm = t.match(/\(\s*(?:about\s+)?(\d+(?:\.\d+)?)\s*(g|ml)\b/) || t.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/);
  if (pm) { if (pm[2] === 'g') info.g = Number(pm[1]); else info.ml = Number(pm[1]); }
  const um = t.replace(/^\s*(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*/, '').match(/^(fl\.?\s*oz|[a-z]+)/);
  const w = um ? um[1].replace(/\s|\./g, '') : '';
  info.noun = w;
  const u = w === 'floz' ? 'floz' : MEASURE[w] || MEASURE[w + 's'] || '';
  if (qty != null && u && VOL_ML[u]) { info.dim = 'volume'; info.ml = info.ml ?? qty * VOL_ML[u]; }
  else if (qty != null && u && MASS_G[u]) { info.dim = 'mass'; info.g = info.g ?? qty * MASS_G[u]; }
  else if (qty != null && w) info.dim = 'count';
  return info;
}

export type Computed = {
  label: string; servings: number;           // TOTAL servings across everyone
  perPerson: number;                         // servings each person gets (split when the amount is shared)
  shared: boolean; amountText: string; assumed?: string;
  nutrition: NutritionFacts | null; noNutrition: boolean;
  per: { calories: number | null; nutrients: Record<string, NutrientAmount> };   // for ONE person's share
  dropPct: number | null;                    // pantry percentage points to take off (total across people), null = unknown
};
const roundN = (x: number, key: string) => (key === 'calories' ? Math.round(x) : Math.round(x * 10) / 10);
export function scaleNutrients(sn: Record<string, NutrientAmount>, servings: number): Record<string, NutrientAmount> {
  const out: Record<string, NutrientAmount> = {};
  for (const [k, v] of Object.entries(sn)) if (v && v.amount != null && Number.isFinite(v.amount)) out[k] = { amount: roundN(v.amount * servings, k), unit: v.unit };
  return out;
}
/** serving-basis nutrition for an item: label serving, or Open Food Facts per-100 g as a "100 g serving" (flagged) */
export function servingBasis(n: NutritionFacts | null | undefined): { sn: Record<string, NutrientAmount>; info: ServingInfo; assumed100g: boolean } | null {
  if (!n) return null;
  const sn = servingNutrients(n);
  const info = parseServingSize(n.servingSize);
  if (n.servingQuantityG && !info.g && !info.ml) info.g = n.servingQuantityG;
  if (sn && Object.keys(sn).length) return { sn, info, assumed100g: false };
  if (n.per100g && Object.keys(n.per100g).length) return { sn: n.per100g, info: { qty: 100, noun: 'g', dim: 'mass', ml: null, g: 100 }, assumed100g: true };
  return null;
}
const hasUsable = (sn: Record<string, NutrientAmount>) => Object.values(sn).some(v => v && v.amount != null);

export function computePart(part: { label: string; amount: Amount; item: Item | null }, nPeople: number): Computed {
  const { amount, item } = part; const n = item?.nutrition || null;
  const basis = servingBasis(n);
  const pkg = n ? servingsInPackage(n) : null;            // servings in the whole package
  const pct = item ? (item.percentLeft > 0 ? item.percentLeft : 100) : 100;
  let servings = 1, text = '', assumed: string | undefined, shared = false, drop: number | null = null;
  const P = pkg?.count ?? null;
  const dropFromServings = (sv: number) => (P && item ? Math.min(item.percentLeft, Math.round((sv / P) * 100)) : null);
  switch (amount.kind) {
    case 'servings': servings = amount.n; text = servingsText(amount.n); drop = dropFromServings(servings); break;
    case 'default': servings = 1; text = '1 serving'; assumed = 'assumed 1 serving'; drop = dropFromServings(1); break;
    case 'count': {
      const per = basis?.info.dim === 'count' && basis.info.qty ? basis.info.qty : null;
      servings = per ? amount.n / per : amount.n;
      if (!per) assumed = `assumed each ${amount.noun || 'one'} is a serving`;
      const noun = amount.noun || (per && basis?.info.noun ? basis.info.noun.replace(/(?<!s)s$/, '') : '');
      text = noun ? `${fmtQty(amount.n)} ${plural(amount.n, noun)}` : `${fmtQty(amount.n)}`;
      drop = dropFromServings(servings); break;
    }
    case 'measure': {
      const u = amount.unit; const info = basis?.info;
      const ml = VOL_ML[u] != null ? amount.n * VOL_ML[u] : null, g = MASS_G[u] != null ? amount.n * MASS_G[u] : null;
      if (g != null && info?.g) servings = g / info.g;
      else if (ml != null && info?.ml) servings = ml / info.ml;
      else if (ml != null && info?.g) { servings = ml / info.g; assumed = 'assumed 1 g per ml'; }
      else if (g != null && info?.ml) { servings = g / info.ml; assumed = 'assumed 1 g per ml'; }
      else { servings = amount.n; assumed = `assumed ${u === 'bowl' || u === 'glass' || u === 'handful' ? 'one' : 'each ' + u} is a serving`; }
      text = `${fmtQty(amount.n)} ${u === 'cup' || u === 'bowl' || u === 'glass' || u === 'handful' || u === 'tbsp' || u === 'tsp' ? plural(amount.n, u) : u}`;
      drop = dropFromServings(servings); break;
    }
    case 'fraction': {
      shared = true;
      if (P) { servings = amount.f * P * (pct / 100); assumed = pkg!.estimated ? 'servings in the package are estimated' : undefined; } else { servings = amount.f; assumed = 'assumed one serving per package'; }
      text = `${fmtQty(amount.f)} ${item && item.percentLeft < 100 && item.percentLeft > 0 ? 'of what is left' : 'of the package'}`;
      drop = item ? Math.round(item.percentLeft * amount.f) : null; break;
    }
    case 'container': {
      shared = true;
      servings = P ? amount.n * P : amount.n; if (!P) assumed = 'assumed one serving per package';
      text = `${fmtQty(amount.n)} ${plural(amount.n, 'package')}`; drop = item ? Math.min(item.percentLeft, Math.round(amount.n * 100)) : null; break;
    }
    case 'rest': {
      shared = true;
      if (P) servings = P * (pct / 100); else { servings = 1; assumed = 'assumed one serving per package'; }
      text = 'the rest'; drop = item ? item.percentLeft : null; break;
    }
  }
  servings = Math.max(0, Math.round(servings * 100) / 100);
  const people = Math.max(1, nPeople);
  const perPerson = shared ? Math.round((servings / people) * 100) / 100 : servings;
  const total = shared ? servings : servings * people;
  let per: Computed['per'] = { calories: null, nutrients: {} };
  let noNutrition = true;
  if (basis && hasUsable(basis.sn)) {
    const sc = scaleNutrients(basis.sn, perPerson);
    per = { calories: sc.calories?.amount ?? null, nutrients: sc };
    noNutrition = false;
    if (basis.assumed100g && !assumed) assumed = 'from per-100 g data, counted 100 g as a serving';
    else if (basis.assumed100g && amount.kind === 'measure' && MASS_G[amount.unit] != null) assumed = 'from per-100 g data';
  }
  const dropTotal = drop == null ? null : (shared || amount.kind === 'fraction' || amount.kind === 'rest' || amount.kind === 'container') ? drop : Math.min(item?.percentLeft ?? 100, drop * people);
  return { label: part.label, servings: total, perPerson, shared, amountText: text, assumed, nutrition: n, noNutrition, per, dropPct: dropTotal && dropTotal > 0 ? dropTotal : null };
}

/** one-line confirm text: "2 servings Chips, 320 cal" */
export function confirmLine(c: Computed, nPeople = 1): string {
  const cal = c.noNutrition ? 'no nutrition data' : c.per.calories != null ? `${c.per.calories} cal` : 'no calorie data';
  const each = nPeople > 1 && !c.noNutrition && c.per.calories != null ? ' each' : '';
  return `${c.amountText} ${c.label}, ${cal}${each}${c.shared && nPeople > 1 ? ` (split ${nPeople} ways)` : ''}`;
}

export function makeEntries(c: Computed, profileIds: (string | undefined)[], meal: Meal, at: number, extra: Partial<IntakeEntry> = {}): IntakeEntry[] {
  const who = profileIds.length ? profileIds : [undefined];
  return who.map(pid => ({
    id: newId() + Math.random().toString(36).slice(2, 5), at, profileId: pid, label: c.label, servings: c.perPerson, amountText: c.shared && who.length > 1 ? `${c.amountText} (shared)` : c.amountText, meal,
    calories: c.noNutrition ? null : c.per.calories, nutrients: c.noNutrition ? undefined : c.per.nutrients, noNutrition: c.noNutrition || undefined, assumed: c.assumed, ...extra,
  }));
}
/** lower pantry amounts by the given percentage points (never below 0) */
export function lowerPantry(items: Item[], drops: Record<string, number>, now = Date.now()): Item[] {
  return items.map(i => (drops[i.id] > 0 ? { ...i, percentLeft: Math.max(0, Math.round(i.percentLeft - drops[i.id])), updatedAt: now } : i));
}
/** Same entry, new servings: scales calories and nutrients */
export function rescaleEntry(e: IntakeEntry, servings: number): IntakeEntry {
  const s = Math.max(0, Math.round(servings * 100) / 100);
  const k = e.servings > 0 ? s / e.servings : null;
  return { ...e, servings: s, amountText: servingsText(s), calories: e.calories != null && k != null ? Math.round(e.calories * k) : e.calories,
    nutrients: e.nutrients && k != null ? scaleNutrients(e.nutrients, k) : e.nutrients };
}
/** Re-compute an entry's nutrition from an item's (newly scanned) label, keeping its servings */
export function withNutritionFrom(e: IntakeEntry, item: Item): IntakeEntry {
  const b = servingBasis(item.nutrition); if (!b || !hasUsable(b.sn)) return e;
  const sc = scaleNutrients(b.sn, e.servings);
  return { ...e, calories: sc.calories?.amount ?? null, nutrients: sc, noNutrition: undefined, itemId: e.itemId ?? item.id };
}
/** pantry items to offer as one-tap chips: recently logged first, then recently used/added */
export function recentItems(items: Item[], intake: IntakeEntry[], n = 8): Item[] {
  const byId = new Map(items.map(i => [i.id, i])); const out: Item[] = []; const seen = new Set<string>();
  for (const e of [...intake].sort((a, b) => b.at - a.at)) { const it = e.itemId ? byId.get(e.itemId) : undefined; if (it && !seen.has(it.id)) { seen.add(it.id); out.push(it); if (out.length >= n) return out; } }
  for (const it of [...items].sort((a, b) => b.updatedAt - a.updatedAt)) { if (!seen.has(it.id) && it.percentLeft > 0) { seen.add(it.id); out.push(it); if (out.length >= n) break; } }
  return out;
}

// ---------------------------------------------------------------- totals, limits, goals
export type Totals = { calories: number; nutrients: Record<string, number>; entries: number; noData: number };
export type Who = (e: IntakeEntry) => boolean;
export const whoIs = (profileId: string | null): Who => (e: IntakeEntry) => (profileId == null ? !e.profileId : e.profileId === profileId);
const emptyTotals = (): Totals => ({ calories: 0, nutrients: {}, entries: 0, noData: 0 });
export function totalsFor(entries: IntakeEntry[], who: Who, from: ISODate, to: ISODate): Totals {
  const t = emptyTotals();
  for (const e of entries) {
    if (!who(e)) continue; const d = dayOf(e.at); if (d < from || d > to) continue;
    t.entries++;
    if (e.noNutrition || (e.calories == null && !e.nutrients)) t.noData++;
    if (e.calories != null) t.calories += e.calories;
    for (const [k, v] of Object.entries(e.nutrients || {})) if (v?.amount != null && k !== 'calories') t.nutrients[k] = (t.nutrients[k] || 0) + v.amount;
  }
  t.calories = Math.round(t.calories);
  for (const k of Object.keys(t.nutrients)) t.nutrients[k] = Math.round(t.nutrients[k] * 10) / 10;
  return t;
}
type ISODate = string;
export const dayTotals = (entries: IntakeEntry[], who: Who, day: ISODate) => totalsFor(entries, who, day, day);
export function weekDays(entries: IntakeEntry[], who: Who, endDay: ISODate): { day: ISODate; totals: Totals }[] {
  return Array.from({ length: 7 }, (_, i) => { const day = addDays(endDay, i - 6); return { day, totals: dayTotals(entries, who, day) }; });
}

export const TRACKED: { key: string; limitKey: 'addedSugarsG' | 'totalSugarsG' | 'sodiumMg' | 'saturatedFatG' | 'caloriesKcal'; label: string; unit: string }[] = [
  { key: 'calories', limitKey: 'caloriesKcal', label: 'Calories', unit: 'cal' },
  { key: 'addedSugars', limitKey: 'addedSugarsG', label: 'Added sugars', unit: 'g' },
  { key: 'sugars', limitKey: 'totalSugarsG', label: 'Total sugars', unit: 'g' },
  { key: 'sodium', limitKey: 'sodiumMg', label: 'Sodium', unit: 'mg' },
  { key: 'saturatedFat', limitKey: 'saturatedFatG', label: 'Saturated fat', unit: 'g' },
];
export type ActiveLimit = { key: string; label: string; unit: string; limit: number | null; source: 'limit' | 'goal' | 'none'; goalLabel?: string };
const inRange = (day: ISODate, a?: ISODate | null, b?: ISODate | null) => (!a || day >= a) && (!b || day <= b);
/** daily limit for each tracked nutrient on a day: the person's limit, or an active dated goal when it is stricter */
export function limitsOn(p: Pick<Profile, 'limits' | 'goals'>, day: ISODate): ActiveLimit[] {
  return TRACKED.map(t => {
    let limit: number | null = (p.limits as any)?.[t.limitKey] ?? null; if (limit != null && !(limit > 0)) limit = null;
    let source: ActiveLimit['source'] = limit != null ? 'limit' : 'none'; let goalLabel: string | undefined;
    for (const g of p.goals || []) {
      if (!g.active || g.nutrient !== t.limitKey || !(g.dailyLimit != null && g.dailyLimit > 0) || !inRange(day, g.startOn, g.endOn)) continue;
      if (limit == null || g.dailyLimit < limit) { limit = g.dailyLimit; source = 'goal'; goalLabel = g.label || `${t.label} goal`; }
    }
    return { key: t.key, label: t.label, unit: t.unit, limit, source, goalLabel };
  });
}
export type Progress = ActiveLimit & { amount: number; pct: number | null; level: 'ok' | 'near' | 'over' };
export const levelOf = (pct: number | null): Progress['level'] => (pct == null ? 'ok' : pct >= 100 ? 'over' : pct >= 80 ? 'near' : 'ok');
/** whole-number percent that never reads 100% (or 80%) before the real ratio gets there */
export const pctOf = (amount: number, limit: number): number => { const r = (amount / limit) * 100; const x = Math.round(r); return r < 100 && x >= 100 ? 99 : r < 80 && x >= 80 ? 79 : x; };
export function progressFor(p: Pick<Profile, 'limits' | 'goals'>, totals: Totals, day: ISODate): Progress[] {
  return limitsOn(p, day).map(l => {
    const amount = l.key === 'calories' ? totals.calories : totals.nutrients[l.key] || 0;
    const pct = l.limit ? pctOf(amount, l.limit) : null;
    return { ...l, amount, pct, level: levelOf(pct) };
  });
}

export type PreWarning = { personId?: string; level: 'near' | 'over'; text: string };
/** Warnings to show on the confirm card BEFORE logging: would this push someone over a limit or goal today? */
export function preLogWarnings(p: Profile, entries: IntakeEntry[], add: { calories: number | null; nutrients: Record<string, NutrientAmount> }, day: ISODate, today = todayISO()): PreWarning[] {
  const before = dayTotals(entries, whoIs(p.id), day); const when = day === today ? 'today' : 'that day'; const out: PreWarning[] = [];
  for (const l of limitsOn(p, day)) {
    if (!l.limit) continue;
    const a = l.key === 'calories' ? add.calories ?? 0 : add.nutrients[l.key]?.amount ?? 0; if (!(a > 0)) continue;
    const b0 = l.key === 'calories' ? before.calories : before.nutrients[l.key] || 0;
    const bp = (b0 / l.limit) * 100, ap = pctOf(b0 + a, l.limit);
    const what = l.source === 'goal' ? `${l.label.toLowerCase()} (${l.goalLabel})` : l.label.toLowerCase();
    if (ap >= 100) out.push({ personId: p.id, level: 'over', text: `This puts ${p.name} at ${ap}% of ${what} ${when}` });
    else if (ap >= 80 && bp < 80) out.push({ personId: p.id, level: 'near', text: `This brings ${p.name} to ${ap}% of ${what} ${when}` });
  }
  return out;
}

/** Totals for a goal's date range (or any range), capped at today: the "monthly total" cards */
export type RangeSummary = { from: ISODate; to: ISODate; days: number; loggedDays: number; total: number; avgPerLoggedDay: number; limit: number | null; daysOver: number; unit: string; label: string };
export function rangeSummary(entries: IntakeEntry[], who: Who, key: string, from: ISODate, to: ISODate, limit: number | null, today = todayISO()): RangeSummary {
  const t = TRACKED.find(x => x.key === key) || TRACKED[0];
  let end = to > today ? today : to; if (parseISO(from) && parseISO(end) && end < from) end = from;
  let start = from; if (parseISO(start) && parseISO(end)) { const max = addDays(end, -365); if (start < max) start = max; }
  let total = 0, loggedDays = 0, daysOver = 0, days = 0;
  for (let d = start; d <= end && days < 400; d = addDays(d, 1)) {
    days++;
    const dt = dayTotals(entries, who, d); if (!dt.entries) continue;
    loggedDays++;
    const v = key === 'calories' ? dt.calories : dt.nutrients[key] || 0; total += v;
    if (limit && v > limit) daysOver++;
  }
  return { from: start, to: end, days, loggedDays, total: Math.round(total * 10) / 10, avgPerLoggedDay: loggedDays ? Math.round((total / loggedDays) * 10) / 10 : 0, limit, daysOver, unit: t.unit, label: t.label };
}
export const monthRange = (day: ISODate): { from: ISODate; to: ISODate } => { const d = parseISO(day)!; const from = toISO(new Date(d.getFullYear(), d.getMonth(), 1)); const to = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); return { from, to }; };
