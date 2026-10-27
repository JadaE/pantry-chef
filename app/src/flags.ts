// Ingredient flag rules: plain-language reasons for ingredients many people want to watch. Built-in rules can be
// switched on/off in About > Ingredient warnings (Settings.flagOverrides); the household can also add their own
// words (Settings.warnIngredients). Matching is on whole words/phrases in the label's ingredient text, so
// "Red #40", "RED 40 LAKE" and "FD&C Red No. 40" all match the term "red 40".
import type { Settings } from './types';

export type FlagRule = { id: string; label: string; why: string; terms: string[]; defaultOn: boolean; level: 'high' | 'caution' };

export const FLAG_RULES: FlagRule[] = [
  { id: 'hfcs', label: 'High-fructose corn syrup', level: 'caution', defaultOn: true, terms: ['high fructose corn syrup', 'hfcs', 'glucose fructose', 'isoglucose'],
    why: 'A cheap, highly processed sweetener. It adds sugar without any other nutrition, and many people limit it.' },
  { id: 'dyes', label: 'Artificial food dyes', level: 'caution', defaultOn: true,
    terms: ['red 40', 'red no 40', 'allura red', 'yellow 5', 'yellow no 5', 'tartrazine', 'yellow 6', 'yellow no 6', 'sunset yellow', 'blue 1', 'blue no 1', 'brilliant blue', 'blue 2', 'blue no 2', 'indigotine', 'indigo carmine', 'red 3', 'red no 3', 'erythrosine', 'green 3', 'fast green', 'artificial color', 'artificial colors', 'artificial colour', 'artificial colours'],
    why: 'Synthetic colors add no nutrition. Some people avoid them, and some studies link certain dyes to behavior changes in sensitive children.' },
  { id: 'pho', label: 'Partially hydrogenated oil (trans fat)', level: 'high', defaultOn: true, terms: ['partially hydrogenated', 'hydrogenated vegetable oil'],
    why: 'A source of artificial trans fat, which raises "bad" LDL cholesterol and lowers "good" HDL. Health agencies advise avoiding it.' },
  { id: 'nitrite', label: 'Sodium nitrite / nitrate', level: 'caution', defaultOn: true, terms: ['sodium nitrite', 'sodium nitrate', 'potassium nitrite', 'potassium nitrate', 'nitrite', 'nitrates'],
    why: 'Curing chemicals in processed meats. Eaten often, cured and processed meats are linked to a higher risk of some cancers.' },
  { id: 'bha', label: 'BHA, BHT or TBHQ', level: 'caution', defaultOn: true, terms: ['bha', 'butylated hydroxyanisole', 'bht', 'butylated hydroxytoluene', 'tbhq', 'tertiary butylhydroquinone'],
    why: 'Preservatives that keep fats from going rancid. BHA is listed as "reasonably anticipated to be a human carcinogen" by the US National Toxicology Program, so some people avoid all three.' },
  { id: 'bromate', label: 'Potassium bromate', level: 'high', defaultOn: true, terms: ['potassium bromate', 'bromated flour'],
    why: 'A flour improver banned in the EU, UK and Canada. It is classified as possibly carcinogenic to humans.' },
  { id: 'bvo', label: 'Brominated vegetable oil', level: 'high', defaultOn: true, terms: ['brominated vegetable oil', 'bvo'],
    why: 'An emulsifier the FDA has withdrawn its approval for, because it can build up in the body.' },
  { id: 'aspartame', label: 'Aspartame', level: 'caution', defaultOn: true, terms: ['aspartame', 'phenylketonurics', 'contains phenylalanine'],
    why: 'An artificial sweetener. People with phenylketonuria (PKU) must avoid it, and many others choose to limit artificial sweeteners.' },
  { id: 'sweeteners', label: 'Other artificial sweeteners', level: 'caution', defaultOn: true, terms: ['sucralose', 'acesulfame potassium', 'acesulfame k', 'ace k', 'saccharin', 'neotame', 'advantame'],
    why: 'No-calorie sweeteners. Some people avoid them because of the aftertaste, sugar cravings, or concerns about long-term effects.' },
  { id: 'tio2', label: 'Titanium dioxide', level: 'caution', defaultOn: true, terms: ['titanium dioxide'],
    why: 'A whitening pigment with no nutritional purpose. It is no longer allowed as a food additive in the EU.' },
  { id: 'azo', label: 'Azodicarbonamide', level: 'caution', defaultOn: true, terms: ['azodicarbonamide'],
    why: 'A dough conditioner that is banned in the EU and Australia.' },
  { id: 'msg', label: 'Monosodium glutamate (MSG)', level: 'caution', defaultOn: false, terms: ['monosodium glutamate', 'msg'],
    why: 'A flavor enhancer. Most people tolerate it, but some notice headaches or flushing and prefer to avoid it.' },
  { id: 'benzoate', label: 'Sodium or potassium benzoate', level: 'caution', defaultOn: false, terms: ['sodium benzoate', 'potassium benzoate'],
    why: 'A preservative that can form small amounts of benzene when combined with vitamin C (ascorbic acid).' },
  { id: 'artflavor', label: 'Artificial flavors', level: 'caution', defaultOn: false, terms: ['artificial flavor', 'artificial flavors', 'artificial flavour', 'artificial flavours'],
    why: 'Lab-made flavorings. The individual ingredients do not have to be listed.' },
];
export const FLAG_BY_ID: Record<string, FlagRule> = Object.fromEntries(FLAG_RULES.map(r => [r.id, r]));

export function flagEnabled(rule: FlagRule, settings: Pick<Settings, 'flagOverrides'>): boolean {
  const o = settings.flagOverrides?.[rule.id];
  return typeof o === 'boolean' ? o : rule.defaultOn;
}

/** lowercase letters and digits only, single spaces: "FD&C Red #40" -> "fd and c red 40" */
export function normText(s: string): string {
  return ' ' + s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
}
/** does the normalized ingredient text contain this term as whole words? Long terms also match when a line break split a word ("hydroge nated"). */
export function termInText(term: string, text: string, squashed?: string): boolean {
  const t = normText(term).trim(); if (!t) return false;
  if (text.includes(' ' + t + ' ')) return true;
  const letters = t.replace(/ /g, '');
  return letters.length >= 12 && /^[a-z ]+$/.test(t) && (squashed ?? text.replace(/ /g, '')).includes(letters);
}
export type FlagHit = { id: string; label: string; why: string; level: 'high' | 'caution'; matched: string; custom?: boolean };
/** which enabled rules (plus the household's own words) appear in this ingredient text */
export function ingredientFlags(ingredientsText: string | null | undefined, settings: Pick<Settings, 'flagOverrides' | 'warnIngredients'>): FlagHit[] {
  if (!ingredientsText || !ingredientsText.trim()) return [];
  const text = normText(ingredientsText); const sq = text.replace(/ /g, '');
  const out: FlagHit[] = [];
  for (const r of FLAG_RULES) {
    if (!flagEnabled(r, settings)) continue;
    const m = r.terms.find(t => termInText(t, text, sq));
    if (m) out.push({ id: r.id, label: r.label, why: r.why, level: r.level, matched: m });
  }
  for (const w of settings.warnIngredients || []) {
    if (w.trim() && termInText(w, text, sq)) out.push({ id: 'custom:' + w.trim().toLowerCase(), label: w.trim(), why: "On your household's watch list.", level: 'caution', matched: w.trim(), custom: true });
  }
  return out;
}
