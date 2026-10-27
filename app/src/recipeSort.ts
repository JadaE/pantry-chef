// v0.0.6: sorting + category filter for the Recipes tab. Pure functions (tested in tests/recipesort.test.ts).
export type RecipeSort = 'match' | 'missing' | 'az' | 'category';
export const RECIPE_SORTS: { k: RecipeSort; label: string }[] = [
  { k: 'match', label: 'Best match' }, { k: 'missing', label: 'Fewest missing' }, { k: 'az', label: 'A–Z' }, { k: 'category', label: 'Category' },
];
export type RecipePrefs = { sort: RecipeSort; hiddenCats: string[] };
export const DEFAULT_RECIPE_PREFS: RecipePrefs = { sort: 'match', hiddenCats: [] };

/** One card on the Recipes tab. `rank` = position from the pantry-match ranking; `have`/`total` once the recipe's ingredients are loaded. */
export type SortCard = { cat: string; name: string; rank: number; have?: number | null; total?: number | null };

const missingOf = (c: SortCard) => (c.total != null && c.have != null ? Math.max(0, c.total - c.have) : Infinity);
const byName = (a: SortCard, b: SortCard) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function sortRecipeCards<T extends SortCard>(cards: T[], sort: RecipeSort): T[] {
  const a = cards.slice();
  if (sort === 'az') return a.sort((x, y) => byName(x, y) || x.rank - y.rank);
  if (sort === 'category') return a.sort((x, y) => x.cat.localeCompare(y.cat) || x.rank - y.rank);
  // unknown coverage (still loading / offline) goes last
  if (sort === 'missing') return a.sort((x, y) => missingOf(x) - missingOf(y) || x.rank - y.rank || byName(x, y));
  return a.sort((x, y) => x.rank - y.rank);
}

/** categories that stay visible; a category the user never toggled is shown */
export const visibleCats = (cats: string[], hidden: string[]) => cats.filter(c => !hidden.includes(c));

/** toggle one category. Never hides the last visible one (that would leave an empty tab with no obvious way back). */
export function toggleCat(all: string[], hidden: string[], cat: string): string[] {
  if (hidden.includes(cat)) return hidden.filter(c => c !== cat);
  if (visibleCats(all, hidden).length <= 1) return hidden;
  return [...hidden, cat];
}
/** "only this one" (long press) */
export const onlyCat = (all: string[], cat: string) => all.filter(c => c !== cat);

export function cleanRecipePrefs(raw: any): RecipePrefs {
  const sort: RecipeSort = RECIPE_SORTS.some(s => s.k === raw?.sort) ? raw.sort : 'match';
  const hiddenCats = Array.isArray(raw?.hiddenCats) ? Array.from(new Set<string>(raw.hiddenCats.filter((x: any) => typeof x === 'string' && x.trim()))).slice(0, 50) : [];
  return { sort, hiddenCats };
}
