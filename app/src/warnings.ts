// First-pass warnings for the item page, from the nutrition label and ingredient text (all on-device, plain rules):
//   1. each person's restrictions found in the ingredients (or "may contain" traces)
//   2. flagged ingredients (rules list in flags.ts + the household's own words)
//   3. nutrients at 20% Daily Value or more per serving ("high"), split into "watch" (fat, sat fat, cholesterol, sodium, added sugars)
//      and "good" (fiber, protein, vitamins, minerals)
//   4. "hidden serving": more than one serving in the package, and eating all of it would reach 100% DV of sodium,
//      saturated fat or (added) sugar
import type { Item, NutrientAmount, NutritionFacts, Profile, Settings } from './types';
import { restrictionHitsInText, RESTRICTION_RULES, ruleKey } from './logic';
import { ingredientFlags } from './flags';
import { NUTRIENT_BY_KEY, NUTRIENTS, dvPct } from './nutrition';

export type Warning = { id: string; kind: 'restriction' | 'ingredient' | 'trans' | 'hidden' | 'dv'; level: 'high' | 'caution' | 'good'; title: string; detail: string };

/** Open Food Facts already supplied usable nutrition (calories plus at least two other nutrients) */
export function offHasNutrition(n: NutritionFacts | null | undefined): boolean {
  if (!n || n.source !== 'openfoodfacts') return false;
  const src = { ...(n.per100g || {}), ...(n.perServing || {}), ...(n.nutrients || {}) };
  return Object.values(src).filter(v => v && v.amount != null).length >= 3;
}
/** nutrient amounts for ONE serving, or null when that is not known (e.g. only per-100 g with no serving size) */
export function servingNutrients(n: NutritionFacts): Record<string, NutrientAmount> | null {
  if (n.source !== 'openfoodfacts') {
    if (n.perServing && Object.keys(n.perServing).length) return n.perServing;
    return n.nutrients && Object.keys(n.nutrients).length ? n.nutrients : null;
  }
  // Open Food Facts often has only some nutrients per serving: start from per-100 g scaled to the serving, then overlay per-serving values
  const out: Record<string, NutrientAmount> = {};
  if (n.per100g && n.servingQuantityG && n.servingQuantityG > 0) {
    const f = n.servingQuantityG / 100;
    for (const [k, v] of Object.entries(n.per100g)) if (v.amount != null) out[k] = { amount: Math.round(v.amount * f * 100) / 100, unit: v.unit };
  }
  for (const [k, v] of Object.entries(n.perServing || {})) if (v.amount != null) out[k] = v;
  return Object.keys(out).length ? out : null;
}
const MASS: [RegExp, number][] = [[/(\d+(?:[.,]\d+)?)\s*kg\b/i, 1000], [/(\d+(?:[.,]\d+)?)\s*g\b/i, 1], [/(\d+(?:[.,]\d+)?)\s*(?:lb|lbs)\b/i, 453.6], [/(\d+(?:[.,]\d+)?)\s*(?:fl\.?\s*oz)\b/i, 29.57], [/(\d+(?:[.,]\d+)?)\s*oz\b/i, 28.35],
  [/(\d+(?:[.,]\d+)?)\s*(?:l|liter|litre)\b/i, 1000], [/(\d+(?:[.,]\d+)?)\s*cl\b/i, 10], [/(\d+(?:[.,]\d+)?)\s*ml\b/i, 1]];
/** servings in the whole package: from the label, or estimated from package size / serving size for barcode data */
export function servingsInPackage(n: NutritionFacts): { count: number; estimated: boolean } | null {
  if (n.servingsPerContainer && n.servingsPerContainer > 0) return { count: n.servingsPerContainer, estimated: false };
  if (n.packageQuantity && n.servingQuantityG && n.servingQuantityG > 0) {
    for (const [re, mul] of MASS) { const m = n.packageQuantity.match(re); if (m) { const total = Number(m[1].replace(',', '.')) * mul; const c = Math.round(total / n.servingQuantityG * 10) / 10; return c > 0 ? { count: c, estimated: true } : null; } }
  }
  return null;
}
/** %DV for one serving: the label's own number, else computed from the amount */
export function servingDv(n: NutritionFacts, key: string): number | null {
  const v = servingNutrients(n)?.[key]; if (!v) return null;
  if (v.dv != null) return v.dv;
  return dvPct(key, v.amount);
}
/** %DV for the whole package: the label's per-container column, else per-serving x servings */
export function packageDv(n: NutritionFacts, key: string): number | null {
  const c = n.perContainer?.[key];
  if (c) { if (c.dv != null) return c.dv; const p = dvPct(key, c.amount); if (p != null) return p; }
  const sv = servingsInPackage(n); const per = servingDv(n, key);
  return sv && per != null ? Math.round(per * sv.count) : null;
}
const WATCH = new Set(['fat', 'saturatedFat', 'cholesterol', 'sodium', 'addedSugars']);
const HIDDEN: { key: string; label: string }[] = [{ key: 'sodium', label: 'sodium' }, { key: 'saturatedFat', label: 'saturated fat' }, { key: 'addedSugars', label: 'added sugar' }];
const fmtN = (x: number) => String(Math.round(x * 10) / 10);

export function itemWarnings(item: Pick<Item, 'nutrition' | 'ingredientsText'>, settings: Pick<Settings, 'flagOverrides' | 'warnIngredients'>, profiles: Profile[]): Warning[] {
  const out: Warning[] = [];
  const ing = item.ingredientsText || item.nutrition?.ingredientsText || '';
  // 1. restrictions
  if (ing.trim()) for (const p of profiles) for (const r of p.restrictions || []) {
    const hits = restrictionHitsInText(r, ing);
    if (!hits.length) continue;
    const label = RESTRICTION_RULES[ruleKey(r) || '']?.label || r;
    const def = hits.filter(h => !h.trace).map(h => h.piece), tr = hits.filter(h => h.trace).map(h => h.piece);
    const who = p.name + (p.guest ? ' (guest)' : '');
    if (def.length) out.push({ id: `r:${p.id}:${r}`, kind: 'restriction', level: 'high', title: `${who} can't have ${label.toLowerCase()}`, detail: `Ingredients include ${[...new Set(def.map(x => x.toLowerCase()))].slice(0, 4).join(', ')}.` });
    else out.push({ id: `r:${p.id}:${r}`, kind: 'restriction', level: 'caution', title: `${who}: may contain ${label.toLowerCase()}`, detail: `The label says it may contain ${[...new Set(tr.map(x => x.toLowerCase()))].slice(0, 3).join(', ')} (shared equipment or facility).` });
  }
  // 2. flagged ingredients
  for (const f of ingredientFlags(ing, settings)) out.push({ id: 'f:' + f.id, kind: 'ingredient', level: f.level === 'high' ? 'high' : 'caution', title: f.label, detail: f.why });
  const n = item.nutrition;
  if (n) {
    const sn = servingNutrients(n);
    const trans = sn?.transFat?.amount;
    if (trans != null && trans > 0 && !out.some(o => o.id === 'f:pho')) out.push({ id: 'trans', kind: 'trans', level: 'high', title: `Trans fat: ${fmtN(trans)} g per serving`, detail: 'Artificial trans fat raises "bad" LDL cholesterol. Health agencies advise avoiding it.' });
    // 4. hidden serving
    const sv = servingsInPackage(n);
    if (sv && sv.count > 1) {
      const over: string[] = [];
      for (const h of HIDDEN) {
        let per = servingDv(n, h.key), whole = packageDv(n, h.key), label = h.label;
        if (h.key === 'addedSugars' && per == null && sn?.sugars?.amount != null && !sn.addedSugars) { // old label: only "Sugars"
          per = dvPct('addedSugars', sn.sugars.amount); whole = per != null ? Math.round(per * sv.count) : null; label = 'sugar';
        }
        if (whole != null && per != null && whole >= 100 && per < 100) over.push(`${whole}% of the daily ${label} (${per}% per serving)`);
      }
      if (over.length) out.push({ id: 'hidden', kind: 'hidden', level: 'high', title: `Hidden servings: ${fmtN(sv.count)} in this package${sv.estimated ? ' (estimated)' : ''}`, detail: `Eating the whole package would be ${over.join('; ')}.` });
    }
    // 3. 20% DV or more per serving
    for (const d of NUTRIENTS) {
      if (!d.dv) continue;
      const pct = servingDv(n, d.key);
      if (pct == null || pct < 20) continue;
      const watch = WATCH.has(d.key);
      out.push({ id: 'dv:' + d.key, kind: 'dv', level: watch ? 'caution' : 'good', title: `${watch ? 'High in' : 'Good source of'} ${d.label.toLowerCase()}`, detail: `${pct}% of the daily value per serving (20% or more counts as high).` });
    }
  }
  const rank = { restriction: 0, trans: 1, ingredient: 2, hidden: 3, dv: 4 } as const;
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || (a.level === b.level ? 0 : a.level === 'high' ? -1 : b.level === 'high' ? 1 : a.level === 'caution' ? -1 : 1));
}
export { NUTRIENT_BY_KEY };
