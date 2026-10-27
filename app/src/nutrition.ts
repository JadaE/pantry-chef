// Nutrition Facts label -> structured values, with plain rules (no AI, no network).
// Input is OCR text (rows rebuilt from ML Kit line boxes by receipt.rowsFromOcr) or typed/pasted text. Steps:
//   find serving size + servings per container -> find nutrient names in each row (tolerating OCR slips such as
//   "Sodlum", "Cholestero1", "Og") -> read the numbers after each name (amount, %DV; second pair = "per container")
//   -> cross-check amount against %DV and calories against the macros, and flag anything that looks off.
// Output uses the same shape as Open Food Facts barcode data (NutritionFacts), source 'ocr'.
import type { NutrientAmount, NutritionFacts } from './types';

export type Unit = 'g' | 'mg' | 'mcg' | 'kcal' | 'IU';
export type NutrientDef = { key: string; label: string; unit: Unit; dv?: number; pat: string; group: 'main' | 'micro'; sub?: boolean };

/** Order = order shown on the review screen. dv = FDA Daily Value (2020 label rules) in `unit`. */
export const NUTRIENTS: NutrientDef[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal', pat: 'calor[il1]es?', group: 'main' },
  { key: 'fat', label: 'Total fat', unit: 'g', dv: 78, pat: '(?:total\\s+)?fat', group: 'main' },
  { key: 'saturatedFat', label: 'Saturated fat', unit: 'g', dv: 20, pat: '(?:saturated|satur\\w*|sat\\.?)\\s+fat', group: 'main', sub: true },
  { key: 'transFat', label: 'Trans fat', unit: 'g', pat: 'trans\\s*(?:fat|fatty\\s+acids?)', group: 'main', sub: true },
  { key: 'polyunsaturatedFat', label: 'Polyunsaturated fat', unit: 'g', pat: 'poly\\w*\\s+fat', group: 'micro', sub: true },
  { key: 'monounsaturatedFat', label: 'Monounsaturated fat', unit: 'g', pat: 'mono\\w*\\s+fat', group: 'micro', sub: true },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg', dv: 300, pat: 'ch[o0]lest[e3]r[o0][l1i]', group: 'main' },
  { key: 'sodium', label: 'Sodium', unit: 'mg', dv: 2300, pat: 's[o0]d[il1]um', group: 'main' },
  { key: 'carbs', label: 'Total carbohydrate', unit: 'g', dv: 275, pat: '(?:total\\s+)?carb(?:[o0]hydrates?|s)?', group: 'main' },
  { key: 'fiber', label: 'Dietary fiber', unit: 'g', dv: 28, pat: '(?:dietary\\s+)?f[il1]b(?:er|re)', group: 'main', sub: true },
  { key: 'sugars', label: 'Total sugars', unit: 'g', pat: '(?:total\\s+)?sugars?', group: 'main', sub: true },
  { key: 'addedSugars', label: 'Added sugars', unit: 'g', dv: 50, pat: 'added\\s+sugars?', group: 'main', sub: true },
  { key: 'sugarAlcohol', label: 'Sugar alcohol', unit: 'g', pat: 'sugar\\s+alcohols?', group: 'micro', sub: true },
  { key: 'protein', label: 'Protein', unit: 'g', dv: 50, pat: 'pr[o0]te[il1]n', group: 'main' },
  { key: 'vitaminD', label: 'Vitamin D', unit: 'mcg', dv: 20, pat: 'vit(?:amin)?\\.?\\s*d\\d?', group: 'micro' },
  { key: 'calcium', label: 'Calcium', unit: 'mg', dv: 1300, pat: 'calc[il1]um', group: 'micro' },
  { key: 'iron', label: 'Iron', unit: 'mg', dv: 18, pat: 'ir[o0]n', group: 'micro' },
  { key: 'potassium', label: 'Potassium', unit: 'mg', dv: 4700, pat: 'p[o0]tass[il1]um', group: 'micro' },
  { key: 'vitaminA', label: 'Vitamin A', unit: 'mcg', dv: 900, pat: 'vit(?:amin)?\\.?\\s*a', group: 'micro' },
  { key: 'vitaminC', label: 'Vitamin C', unit: 'mg', dv: 90, pat: 'vit(?:amin)?\\.?\\s*c', group: 'micro' },
  { key: 'vitaminE', label: 'Vitamin E', unit: 'mg', dv: 15, pat: 'vit(?:amin)?\\.?\\s*e', group: 'micro' },
  { key: 'vitaminK', label: 'Vitamin K', unit: 'mcg', dv: 120, pat: 'vit(?:amin)?\\.?\\s*k', group: 'micro' },
  { key: 'thiamin', label: 'Thiamin', unit: 'mg', dv: 1.2, pat: 'thiamin(?:e)?', group: 'micro' },
  { key: 'riboflavin', label: 'Riboflavin', unit: 'mg', dv: 1.3, pat: 'ribofl[a4]vin', group: 'micro' },
  { key: 'niacin', label: 'Niacin', unit: 'mg', dv: 16, pat: 'n[il1]ac[il1]n', group: 'micro' },
  { key: 'vitaminB6', label: 'Vitamin B6', unit: 'mg', dv: 1.7, pat: 'vit(?:amin)?\\.?\\s*b\\s*-?\\s*6', group: 'micro' },
  { key: 'folate', label: 'Folate', unit: 'mcg', dv: 400, pat: 'fo[l1]ate|fo[l1]ic\\s+acid', group: 'micro' },
  { key: 'vitaminB12', label: 'Vitamin B12', unit: 'mcg', dv: 2.4, pat: 'vit(?:amin)?\\.?\\s*b\\s*-?\\s*12', group: 'micro' },
  { key: 'biotin', label: 'Biotin', unit: 'mcg', dv: 30, pat: 'b[il1]ot[il1]n', group: 'micro' },
  { key: 'pantothenicAcid', label: 'Pantothenic acid', unit: 'mg', dv: 5, pat: 'pantothen[il1]c\\s+ac[il1]d', group: 'micro' },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg', dv: 1250, pat: 'phosph[o0]rus', group: 'micro' },
  { key: 'iodine', label: 'Iodine', unit: 'mcg', dv: 150, pat: '[il1]od[il1]ne', group: 'micro' },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', dv: 420, pat: 'magnes[il1]um', group: 'micro' },
  { key: 'zinc', label: 'Zinc', unit: 'mg', dv: 11, pat: 'z[il1]nc', group: 'micro' },
  { key: 'selenium', label: 'Selenium', unit: 'mcg', dv: 55, pat: 'selen[il1]um', group: 'micro' },
  { key: 'copper', label: 'Copper', unit: 'mg', dv: 0.9, pat: 'c[o0]pper', group: 'micro' },
  { key: 'manganese', label: 'Manganese', unit: 'mg', dv: 2.3, pat: 'manganese', group: 'micro' },
  { key: 'chromium', label: 'Chromium', unit: 'mcg', dv: 35, pat: 'chrom[il1]um', group: 'micro' },
  { key: 'molybdenum', label: 'Molybdenum', unit: 'mcg', dv: 45, pat: 'm[o0]lybdenum', group: 'micro' },
  { key: 'chloride', label: 'Chloride', unit: 'mg', dv: 2300, pat: 'chl[o0]r[il1]de', group: 'micro' },
  { key: 'choline', label: 'Choline', unit: 'mg', dv: 550, pat: 'ch[o0]l[il1]ne', group: 'micro' },
];
export const NUTRIENT_BY_KEY: Record<string, NutrientDef> = Object.fromEntries(NUTRIENTS.map(n => [n.key, n]));
// rows whose numbers must never be read as nutrients
const IGNORE_LABEL = 'calor[il1]es\\s+from\\s+\\w+';
const FOOTNOTE = /calories\s+per\s+gram|daily\s+value|%\s*dv|general\s+nutrition|calorie\s+diet|calories\s+a\s+day|tells\s+you|not\s+a\s+significant|contains\s+less\s+than|nutrition\s+advice/i;

const LABEL_RES = NUTRIENTS.map(n => ({ key: n.key, re: new RegExp('\\b(?:' + n.pat + ')(?![a-z])', 'gi') }));
const IGNORE_RE = new RegExp('\\b(?:' + IGNORE_LABEL + ')', 'gi');

type Hit = { key: string; start: number; end: number };
function findLabels(row: string): Hit[] {
  const hits: Hit[] = [];
  for (const { key, re } of LABEL_RES) { re.lastIndex = 0; let m: RegExpExecArray | null; while ((m = re.exec(row))) { hits.push({ key, start: m.index, end: m.index + m[0].length }); if (m[0].length === 0) re.lastIndex++; } }
  IGNORE_RE.lastIndex = 0; let m: RegExpExecArray | null;
  while ((m = IGNORE_RE.exec(row))) hits.push({ key: '_ignore', start: m.index, end: m.index + m[0].length });
  // longest match wins when matches overlap ("Saturated Fat" beats "Fat"; "Added Sugars" beats "Sugars")
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Hit[] = [];
  for (const h of hits) { const last = out[out.length - 1]; if (last && h.start < last.end) continue; out.push(h); }
  return out;
}

type Tok = { n: number; unit: string; pct: boolean; lt: boolean };
const TOK = /(<|less\s+than)?\s*(\d+(?:\.\d+)?|\.\d+)\s*(kcal|mcg|µg|μg|ug|mg|iu|g|%)?(?![a-z])/gi;
function cleanValueText(s: string): string {
  return s
    .replace(/[•·|*†‡]/g, ' ')
    .replace(/(^|[^A-Za-z0-9])[Oo](?=\s*(?:mg|mcg|µg|g|%)(?![a-z]))/g, '$10')       // "Og" -> "0g", "Omg" -> "0mg", "O%" -> "0%"
    .replace(/(\d)\s*(?:rng|mq|m9)(?![a-z])/gi, '$1mg')                               // "5rng" -> "5mg"
    .replace(/(\d)\s*q(?![a-z])/gi, '$1g')
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')                                          // 1,200 -> 1200
    .replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');                                      // 1,5 -> 1.5
}
function readTokens(seg: string): Tok[] {
  const s = cleanValueText(seg); const out: Tok[] = []; let m: RegExpExecArray | null; TOK.lastIndex = 0;
  while ((m = TOK.exec(s))) { const u = (m[3] || '').toLowerCase(); out.push({ n: Number(m[2]), unit: u === '%' ? '%' : u === 'ug' || u === 'µg' || u === 'μg' ? 'mcg' : u === 'iu' ? 'IU' : u, pct: u === '%', lt: !!m[1] }); }
  return out;
}
const hasWords = (row: string) => /[a-z]{3,}/i.test(cleanValueText(row).replace(TOK, ' '));
function convert(n: number, from: string, to: string): number {
  if (!from || from === to || from === 'kcal' || from === 'IU') return n;
  const g: Record<string, number> = { g: 1, mg: 0.001, mcg: 0.000001 };
  if (g[from] == null || g[to] == null) return n;
  return Math.round(n * g[from] / g[to] * 1000) / 1000;
}
/** FDA %DV for an amount (in the nutrient's own unit); null when there is no daily value */
export function dvPct(key: string, amount: number | null | undefined): number | null {
  const d = NUTRIENT_BY_KEY[key]; if (!d?.dv || amount == null) return null;
  return Math.round(amount / d.dv * 100);
}

export type LabelParse = {
  nutrition: NutritionFacts;
  dual: boolean;                 // two value columns (per serving / per container)
  found: string[];               // nutrient keys read
  suspect: string[];             // keys that failed a cross-check; the review screen highlights them
  notes: string[];               // plain-language hints about suspect values
};

type Raw = { key: string; toks: Tok[] };
const SERV_PER = /(?:about\s+|approx\.?\s+|approximately\s+)?(\d+(?:[.,]\d+)?|\.\d+)\s*(?:servings?|serv\w*|svgs?)\s*(?:per|\/)\s*(?:container|package|pkg|can|bottle|box|bag|jar|tub|carton|pouch|bar|pack\w*)/i;
const SERV_PER_AFTER = /(?:servings?|serv\w*)\s*(?:per|\/)\s*(?:container|package|pkg|can|bottle|box|bag|jar|tub|carton|pouch|pack\w*)\s*[:\-]?\s*(?:about\s+|approx\.?\s+)?(\d+(?:[.,]\d+)?|\.\d+)/i;
const SERV_PER_ANY = /serv\w*\s*(?:per|\/)\s*(?:container|package|pkg|can|bottle|box|bag|jar|tub|carton|pouch|pack\w*)/i;
const SERV_SIZE = /serv(?:ing)?s?\.?\s*size\s*[:\-]?\s*/i;

export function parseLabel(text: string): LabelParse {
  const rows = text.replace(/\r/g, '').split('\n').map(r => r.replace(/\s+/g, ' ').trim()).filter(Boolean)
    // "Includes 10g Added Sugars" -> "Added Sugars 10g"
    .map(r => r.replace(/\bincl(?:udes?|\.)?\s+((?:<|less\s+than)?\s*[\dO][\d.,Oo]*\s*(?:mg|g|mcg)?)\s+added\s+sugars?/gi, 'Added Sugars $1'));
  const joined = rows.join('\n');

  // ---- serving size, servings per container ----
  let servingSize: string | undefined; let servingsPerContainer: number | null = null;
  const used = new Set<number>(); let wantSizeNext = false; let wantServingsAt = -1;
  rows.forEach((row0, i) => {
    let row = row0;
    const sp = row.match(SERV_PER) || row.match(SERV_PER_AFTER);
    if (sp && servingsPerContainer == null) { servingsPerContainer = Number(sp[1].replace(',', '.')); row = row.replace(sp[0], ' ').trim(); used.add(i); }
    else if (SERV_PER_ANY.test(row) && servingsPerContainer == null) { wantServingsAt = i; used.add(i); }
    if (wantServingsAt >= 0 && wantServingsAt !== i && servingsPerContainer == null && /^(?:about\s+)?\d+(?:[.,]\d+)?$/i.test(row0)) { servingsPerContainer = Number(row0.replace(/[^\d.,]/g, '').replace(',', '.')); wantServingsAt = -1; used.add(i); }
    const sz = row.match(SERV_SIZE);
    if (sz && servingSize == null) {
      const rest = row.slice(sz.index! + sz[0].length).trim();
      if (rest) servingSize = rest; else wantSizeNext = true;
      used.add(i);
    } else if (wantSizeNext && servingSize == null && !findLabels(row).length) { servingSize = row; wantSizeNext = false; used.add(i); }
  });
  if (servingSize) servingSize = servingSize.replace(/\s*(?:amount\s+per\s+serving|calories).*$/i, '').replace(/[:\-\s]+$/, '').slice(0, 80) || undefined;
  if (servingsPerContainer != null && (!Number.isFinite(servingsPerContainer) || servingsPerContainer <= 0 || servingsPerContainer > 1000)) servingsPerContainer = null;
  let servingQuantityG: number | null = null;
  if (servingSize) { const m = servingSize.match(/\(\s*(?:about\s+)?(\d+(?:\.\d+)?)\s*(g|ml)\s*\)/i) || servingSize.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i); if (m) servingQuantityG = Number(m[1]); }

  // ---- column header ----
  const hdr = joined.replace(/(?:\d+(?:[.,]\d+)?\s*)?serv\w*\s*(?:per|\/)\s*\w+/gi, ' '); // "8 servings per container" is not a column heading
  const perServingHdr = /per\s+serving|1\s+serving|one\s+serving/i.test(hdr);
  const perContainerHdr = /per\s+(?:container|package|pkg)|whole\s+(?:container|package)|entire\s+(?:container|package)|per\s+\d+\s+servings/i.test(hdr);
  const preparedHdr = /as\s+prepared|prepared/i.test(hdr) && /as\s+packaged|packaged/i.test(hdr);
  let headerDual = (perServingHdr && perContainerHdr) || preparedHdr;
  const secondIsPrepared = preparedHdr && !perContainerHdr;

  // ---- nutrient rows ----
  const raws: Raw[] = []; const pending: Raw[] = [];
  rows.forEach((row, i) => {
    if (used.has(i)) return;
    if (FOOTNOTE.test(row)) return;
    const hits = findLabels(row);
    if (!hits.length) {
      if (pending.length && readTokens(row).length && !hasWords(row)) { const p = pending.shift()!; p.toks = readTokens(row); }
      return;
    }
    hits.forEach((h, j) => {
      if (h.key === '_ignore') return;
      const seg = row.slice(h.end, j + 1 < hits.length ? hits[j + 1].start : undefined);
      const toks = readTokens(seg);
      const r: Raw = { key: h.key, toks };
      raws.push(r);
      if (!toks.length) pending.push(r);
    });
  });
  const mainRows = raws.filter(r => ['fat', 'carbs', 'protein', 'sodium', 'cholesterol'].includes(r.key));
  const twoCol = mainRows.filter(r => r.toks.filter(t => !t.pct).length >= 2).length;
  const dual = headerDual || (mainRows.length >= 3 && twoCol >= Math.ceil(mainRows.length / 2));

  const nutrients: Record<string, NutrientAmount> = {}; const perContainer: Record<string, NutrientAmount> = {};
  const suspect: string[] = []; const notes: string[] = [];
  const toAmt = (def: NutrientDef, t: Tok | undefined, pct: Tok | undefined): NutrientAmount | null => {
    if (!t && !pct) return null;
    return { amount: t ? Math.round((t.lt ? (t.n <= 1 ? t.n / 2 : t.n) : convert(t.n, t.unit || def.unit, def.unit)) * 1000) / 1000 : null, unit: def.unit, dv: pct ? pct.n : null };
  };
  for (const r of raws) {
    if (nutrients[r.key] && nutrients[r.key].amount != null) continue; // first reading wins
    const def = NUTRIENT_BY_KEY[r.key];
    const amts = r.toks.filter(t => !t.pct), pcts = r.toks.filter(t => t.pct);
    if (def.key === 'calories') { // "Calories 230" or "Calories 230 460"; a % is never calories
      if (!amts.length) continue;
      nutrients.calories = { amount: amts[0].n, unit: 'kcal', dv: null };
      if (dual && amts[1] && !secondIsPrepared) perContainer.calories = { amount: amts[1].n, unit: 'kcal', dv: null };
      continue;
    }
    // vitamins/minerals on older labels show only a %DV, so a lone number with no unit and a % is not an amount
    const a1 = amts[0], a2 = dual ? amts[1] : undefined, p1 = pcts[0], p2 = dual ? pcts[1] : undefined;
    const first = toAmt(def, a1, p1); if (first) nutrients[r.key] = first;
    if (dual && !secondIsPrepared) { const second = toAmt(def, a2, p2); if (second) perContainer[r.key] = second; }
  }
  // ---- cross-checks ----
  for (const [k, v] of Object.entries(nutrients)) {
    const def = NUTRIENT_BY_KEY[k];
    if (def.dv && v.amount != null && v.dv != null && v.amount > 0 && v.dv > 0) {
      let expected = v.amount / def.dv * 100;
      const off = (e: number, p: number) => Math.abs(e - p) > Math.max(4, 0.35 * p);
      if (off(expected, v.dv)) {
        // a "g" misread as 9 ("89" for "8g"): try dropping the last digit when no unit was read
        const hadUnit = raws.find(r => r.key === k)?.toks.some(t => !t.pct && t.unit);
        if (!hadUnit && def.unit !== 'kcal' && v.amount >= 10 && String(v.amount).endsWith('9') && !off(Math.floor(v.amount / 10) / def.dv * 100, v.dv)) { const was = v.amount; v.amount = Math.floor(was / 10); notes.push(`${def.label}: read "${was}" as ${v.amount}${def.unit} (the g looked like a 9).`); }
        else { suspect.push(k); notes.push(`${def.label}: ${v.amount}${def.unit} does not match ${v.dv}% Daily Value. Check it against the label.`); }
      }
    }
  }
  const cal = nutrients.calories?.amount;
  if (cal != null) {
    const g = (k: string) => nutrients[k]?.amount ?? null;
    const fat = g('fat'), carbs = g('carbs'), prot = g('protein');
    let bad = cal > 1500 || cal < 0;
    if (!bad && fat != null && carbs != null && prot != null) { const calc = 9 * fat + 4 * carbs + 4 * prot; bad = Math.abs(calc - cal) > 0.4 * Math.max(cal, calc) + 30; }
    if (bad && !suspect.includes('calories')) { suspect.push('calories'); notes.push('Calories do not add up with the fat, carbs and protein. Check them against the label.'); }
  }
  for (const k of ['sugars', 'addedSugars']) { const s = nutrients[k]?.amount, c = nutrients.carbs?.amount; if (s != null && c != null && s > c + 1 && !suspect.includes(k)) { suspect.push(k); notes.push(`${NUTRIENT_BY_KEY[k].label} is higher than total carbohydrate. Check it.`); } }
  { const s = nutrients.saturatedFat?.amount, f = nutrients.fat?.amount; if (s != null && f != null && s > f + 0.5 && !suspect.includes('saturatedFat')) { suspect.push('saturatedFat'); notes.push('Saturated fat is higher than total fat. Check it.'); } }

  const per100g = servingQuantityG && servingQuantityG > 0 ? scale(nutrients, 100 / servingQuantityG) : undefined;
  const nutrition: NutritionFacts = {
    servingSize, servingsPerContainer, calories: nutrients.calories?.amount ?? null, nutrients, perServing: { ...nutrients },
    perContainer: Object.keys(perContainer).length ? perContainer : undefined, per100g, servingQuantityG, source: 'ocr', rawText: text, capturedAt: Date.now(),
  };
  return { nutrition, dual, found: Object.keys(nutrients), suspect, notes };
}
function scale(n: Record<string, NutrientAmount>, f: number): Record<string, NutrientAmount> {
  const out: Record<string, NutrientAmount> = {};
  for (const [k, v] of Object.entries(n)) if (v.amount != null) out[k] = { amount: Math.round(v.amount * f * 100) / 100, unit: v.unit };
  return out;
}
/** Is this good enough to save, or should the user retake the photo? */
export function labelLooksUsable(p: LabelParse): boolean {
  const core = ['calories', 'fat', 'carbs', 'protein', 'sodium'].filter(k => p.found.includes(k)).length;
  return core >= 3;
}

// ---------- ingredients list ----------
/** Pull the ingredient list out of OCR text: starts after "Ingredients:", stops at distributor/allergen-contact lines. */
export function parseIngredients(text: string): string {
  let t = text.replace(/\r/g, '');
  const m = t.match(/[il1]ngred[il1]ents?\s*[:;.\-]?/i);
  if (m) t = t.slice(m.index! + m[0].length);
  t = t.split(/\b(?:distributed|manufactured|produced|packed|packaged)\s+(?:by|for|in)\b|\bquestions\??\s*(?:or comments)?\b|\bcall\s+\d|\bwww\.|\bbest\s+(?:by|before)\b|\bnutrition\s+facts\b|\bvisit\s+us\b/i)[0];
  t = t.replace(/(\w)-[ \t]*\n[ \t]*(?=[a-z])/gi, '$1-').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').replace(/\s+([,.;:)])/g, '$1').trim();
  return t.replace(/^[\s,.:;]+/, '').slice(0, 2500);
}

// ---------- review-screen helpers (pure, so they are tested) ----------
/** grams (or ml) in one serving from text like "2/3 cup (55g)" or "1 oz (28g/About 15 chips)" */
export function servingQuantityOf(servingSize: string | undefined | null): number | null {
  if (!servingSize) return null;
  const m = servingSize.match(/\(\s*(?:about\s+)?(\d+(?:\.\d+)?)\s*(g|ml)\s*\)/i) || servingSize.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
  return m ? Number(m[1]) : null;
}
export type FieldVals = Record<string, { amount: string; dv: string }>;
const fmt = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '' : String(Math.round(x * 1000) / 1000));
export function fieldsFromFacts(n: NutritionFacts | null | undefined): FieldVals {
  const out: FieldVals = {};
  for (const [k, v] of Object.entries(n?.perServing && Object.keys(n.perServing).length ? n.perServing : n?.nutrients || {})) if (NUTRIENT_BY_KEY[k]) out[k] = { amount: fmt(v.amount), dv: fmt(v.dv) };
  return out;
}
const num = (s: string): number | null => { const t = s.replace(',', '.').replace('%', '').trim(); if (!t) return null; const v = Number(t); return Number.isFinite(v) && v >= 0 ? v : null; };
/** Review-screen text fields -> NutritionFacts (source 'ocr', same structure as Open Food Facts data). Returns null when nothing was filled in. */
export function factsFromFields(f: FieldVals, o: { servingSize?: string; servings?: string; rawText?: string; perContainer?: Record<string, NutrientAmount>; ingredientsText?: string | null; capturedAt?: number }): NutritionFacts | null {
  const nutrients: Record<string, NutrientAmount> = {};
  for (const def of NUTRIENTS) {
    const v = f[def.key]; if (!v) continue;
    const amount = num(v.amount), dv = num(v.dv);
    if (amount == null && dv == null) continue;
    nutrients[def.key] = { amount, unit: def.unit, dv: def.key === 'calories' ? null : dv };
  }
  const servingSize = (o.servingSize || '').trim() || undefined;
  const servings = num(o.servings || '');
  if (!Object.keys(nutrients).length && !servingSize && servings == null) return null;
  const q = servingQuantityOf(servingSize);
  const pc = o.perContainer && Object.keys(o.perContainer).length ? o.perContainer : undefined;
  return {
    servingSize, servingsPerContainer: servings && servings > 0 ? servings : null, calories: nutrients.calories?.amount ?? null, nutrients, perServing: { ...nutrients },
    perContainer: pc, per100g: q && q > 0 ? scale(nutrients, 100 / q) : undefined, servingQuantityG: q,
    ingredientsText: o.ingredientsText || null, source: 'ocr', rawText: o.rawText, capturedAt: o.capturedAt ?? Date.now(),
  };
}
