// Recipe suggestions from TheMealDB's free public API (test key "1"; no account, no cost, no AI).
// Everything is cached on the device so the Recipes tab works offline after the first load.
import type { Item, RecipeDetail, RecipeSummary } from './types';
import { cacheGet, cacheSet } from './store';
import { Candidate, ingredientQueries, parseMeal, pantryNames, rankByCategory } from './logic';

const API = 'https://www.themealdb.com/api/json/v1/1/';
const DAY = 86400000;
async function getJSON(path: string): Promise<any> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  try { const r = await fetch(API + path, { signal: ctl.signal, headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
async function cached<T>(key: string, maxAge: number, fn: () => Promise<T>): Promise<T> {
  const c = await cacheGet<T>(key, maxAge); if (c !== undefined) return c;
  try { const v = await fn(); await cacheSet(key, v); return v; }
  catch (e) { const stale = await cacheGet<T>(key, Infinity); if (stale !== undefined) return stale; throw e; }
}
async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k]); } }));
  return out;
}
const toSummary = (m: any, category = ''): RecipeSummary => ({ id: String(m.idMeal), name: String(m.strMeal), thumb: String(m.strMealThumb || ''), category });

export async function categories(): Promise<string[]> {
  return cached('mdb:cats', 30 * DAY, async () => ((await getJSON('list.php?c=list')).meals || []).map((c: any) => String(c.strCategory)).filter(Boolean));
}
export async function categoryMeals(cat: string): Promise<RecipeSummary[]> {
  return cached('mdb:cat:' + cat, 14 * DAY, async () => ((await getJSON('filter.php?c=' + encodeURIComponent(cat))).meals || []).map((m: any) => toSummary(m, cat)));
}
async function ingredientMealIds(q: string): Promise<string[]> {
  return cached('mdb:ing:' + q, 14 * DAY, async () => ((await getJSON('filter.php?i=' + encodeURIComponent(q))).meals || []).map((m: any) => String(m.idMeal)));
}
export async function recipeDetail(id: string): Promise<RecipeDetail | null> {
  return cached('mdb:meal:' + id, 60 * DAY, async () => parseMeal(((await getJSON('lookup.php?i=' + encodeURIComponent(id))).meals || [])[0]));
}

/** Build ranked candidates per category: hits = how many different pantry items appear in the recipe (per TheMealDB's ingredient index). */
export async function buildCandidates(items: Item[], dismissed: string[]): Promise<{ byCat: Record<string, Candidate[]>; cats: string[] }> {
  const cats = await categories();
  const lists = await pool(cats, 4, c => categoryMeals(c).catch(() => [] as RecipeSummary[]));
  const all = new Map<string, Candidate>();
  lists.forEach((l, i) => l.forEach(m => all.set(m.id, { ...m, category: cats[i], hits: 0 })));
  const names = Array.from(new Set(pantryNames(items).map(n => n.trim().toLowerCase()).filter(Boolean)));
  await pool(names, 4, async name => {
    const ids = new Set<string>();
    for (const q of ingredientQueries(name)) {
      try { const r = await ingredientMealIds(q); r.forEach(x => ids.add(x)); if (r.length) break; } catch { break; }
    }
    ids.forEach(id => { const c = all.get(id); if (c) c.hits++; });
  });
  return { byCat: rankByCategory(Array.from(all.values()), dismissed), cats };
}
