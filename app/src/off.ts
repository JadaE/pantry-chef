// Open Food Facts barcode lookup (free, open database; no key). They ask apps to send a descriptive User-Agent.
import type { NutrientAmount, NutritionFacts } from './types';
import { VERSION_NAME } from './version';
import { SITE } from './config';
import { matchGrocery } from './groceries';
export const OFF_UA = `PantryChef/${VERSION_NAME} (Android; personal sideloaded pantry app; contact via ${SITE})`;
const FIELDS = 'code,product_name,product_name_en,generic_name,brands,quantity,categories_tags,image_front_small_url,image_front_url,image_url,nutriments,serving_size,serving_quantity,ingredients_text,ingredients_text_en';

export type OffProduct = { barcode: string; name: string; brand: string | null; category: string; imageUrl: string | null; quantity: string | null; nutrition: NutritionFacts | null; ingredientsText: string | null; recipeName?: string };

// OFF category tags -> app categories (first hit wins; order matters: frozen before meat, etc.)
const CAT_RULES: [RegExp, string][] = [
  [/frozen/, 'Frozen'], [/canned|tinned/, 'Canned'], [/spices|seasonings|herbs|salts/, 'Spices'], [/condiments|sauces|dressings|ketchup|mustards|mayonnaises|vinegars|jams|spreads|honeys|syrups/, 'Condiments'],
  [/beverages|drinks|waters|juices|sodas|coffees|teas|milks-drinks/, 'Drinks'], [/dairies|milks|cheeses|yogurts|butters|creams|eggs/, 'Dairy & Eggs'],
  [/meats|poultry|chicken|beef|pork|sausages|hams|fishes|seafood|fish/, 'Meat & Fish'], [/breads|bakery|pastries|tortillas|buns/, 'Bakery'],
  [/snacks|chips|crisps|cookies|biscuits|crackers|candies|chocolates|confectioneries|bars/, 'Snacks'], [/fresh-fruits|fresh-vegetables|fruits|vegetables/, 'Produce'],
  [/cereals|pastas|rices|flours|legumes|grains|breakfasts|oils|sugars|nuts|baking/, 'Pantry'],
];
export function offCategory(tags: string[] | undefined, name: string): string {
  // OFF tags run general -> specific; check the most specific first and skip catch-all tags
  const ts = (tags || []).map(t => t.replace(/^[a-z]{2}:/, '')).filter(t => !/foods-and-beverages|^plant-based-foods$|^foods$/.test(t)).reverse();
  for (const t of ts) for (const [re, c] of CAT_RULES) if (re.test(t)) return c;
  return matchGrocery(name)?.g.cat ?? 'Other';
}

const NUTRIENTS: [string, string, string, number][] = [ // our key, OFF key, unit, multiplier
  ['calories', 'energy-kcal', 'kcal', 1], ['fat', 'fat', 'g', 1], ['saturatedFat', 'saturated-fat', 'g', 1], ['transFat', 'trans-fat', 'g', 1], ['cholesterol', 'cholesterol', 'mg', 1000],
  ['carbs', 'carbohydrates', 'g', 1], ['sugars', 'sugars', 'g', 1], ['addedSugars', 'added-sugars', 'g', 1], ['fiber', 'fiber', 'g', 1], ['protein', 'proteins', 'g', 1], ['sodium', 'sodium', 'mg', 1000],
];
function pick(n: any, suffix: '_100g' | '_serving'): Record<string, NutrientAmount> | undefined {
  const out: Record<string, NutrientAmount> = {};
  for (const [k, off, unit, mul] of NUTRIENTS) {
    const v = n?.[off + suffix];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = { amount: Math.round(v * mul * 100) / 100, unit };
  }
  return Object.keys(out).length ? out : undefined;
}
export function parseOff(code: string, p: any): OffProduct {
  const name = String(p.product_name_en || p.product_name || p.generic_name || '').trim();
  const brand = String(p.brands || '').split(',')[0].trim() || null;
  const per100g = pick(p.nutriments, '_100g'), perServing = pick(p.nutriments, '_serving');
  const nutrition: NutritionFacts | null = per100g || perServing ? {
    servingSize: p.serving_size || undefined, servingQuantityG: typeof p.serving_quantity === 'number' ? p.serving_quantity : Number(p.serving_quantity) || null,
    calories: perServing?.calories?.amount ?? per100g?.calories?.amount ?? null,
    nutrients: perServing || per100g || {}, per100g, perServing, packageQuantity: p.quantity || null,
    ingredientsText: p.ingredients_text_en || p.ingredients_text || null, source: 'openfoodfacts', capturedAt: Date.now(),
  } : null;
  const m = matchGrocery(name), category = offCategory(p.categories_tags, name);
  return {
    barcode: code, name: name || (brand ? brand + ' product' : ''), brand, category,
    imageUrl: p.image_front_small_url || p.image_front_url || p.image_url || null, quantity: p.quantity || null, nutrition,
    ingredientsText: p.ingredients_text_en || p.ingredients_text || null, recipeName: m && m.score >= 0.9 && m.g.cat === category ? m.g.name : undefined,
  };
}
/** null = not in the database; throws on network errors */
export async function lookupBarcode(code: string): Promise<OffProduct | null> {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, { headers: { 'User-Agent': OFF_UA, Accept: 'application/json' }, signal: ctl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Open Food Facts returned ' + r.status);
    const j = await r.json();
    if (j.status !== 1 || !j.product) return null;
    return parseOff(code, j.product);
  } finally { clearTimeout(tm); }
}
