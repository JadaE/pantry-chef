// Cooking mode: pure helpers (no React / native imports, so they are unit-tested with tsx).
import type { CookTimer, Item, RecipeDetail } from './types';
import { ingredientMatches, isStaple, daysUntil } from './logic';

// ---------- time detection ----------
export type TimeMatch = { start: number; end: number; text: string; seconds: number; label: string; unit?: 'h' | 'm' | 's' };
const WORDNUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, sixty: 60 };
const NUM = String.raw`(?:\d+\s+\d\/\d|\d+\/\d|\d+(?:[.,]\d+)?|[¼½¾]|\d+[¼½¾]|(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty-five|forty|sixty))`;
const UNIT = String.raw`(?:seconds?|secs?|minutes?|mins?|hours?|hrs?)`;
const RE = new RegExp(String.raw`(?<![\w.])(${NUM})(?:\s*(?:-|–|—|to|or)\s*(${NUM}))?\s*[-]?\s*(${UNIT})(?![a-z])`, 'gi');
const HALF_HOUR = /\bhalf an? hour\b/gi;

function numVal(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (t in WORDNUM) return WORDNUM[t];
  const uni: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
  let m = t.match(/^(\d+)\s*([¼½¾])$/); if (m) return Number(m[1]) + uni[m[2]];
  if (t in uni) return uni[t];
  m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^(\d+)\/(\d+)$/); if (m) return Number(m[1]) / Number(m[2]);
  const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : null;
}
const unitSecs = (u: string) => (/^h/i.test(u) ? 3600 : /^m/i.test(u) ? 60 : 1);
export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} hr`;
  if (m && s) return `${m} min ${s} sec`;
  if (m) return `${m} min`;
  return `${s} sec`;
}
/** countdown clock: 1:05:09 / 12:03 / 0:07 */
export function fmtClock(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n: number) => (n < 10 ? '0' : '') + n;
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

/** Finds durations in step text ("10 minutes", "1 hr", "1 hour 30 minutes", "20-25 mins", "half an hour"). A range uses its lower end. */
export function detectTimes(text: string): TimeMatch[] {
  const found: TimeMatch[] = [];
  let m: RegExpExecArray | null;
  HALF_HOUR.lastIndex = 0;
  while ((m = HALF_HOUR.exec(text))) found.push({ start: m.index, end: m.index + m[0].length, text: m[0], seconds: 1800, label: '30 min', unit: 'm' });
  RE.lastIndex = 0;
  while ((m = RE.exec(text))) {
    if (found.some(f => m!.index < f.end && m!.index + m![0].length > f.start)) continue; // "half an hour" must not also match "an hour"
    const a = numVal(m[1]); if (a == null || a <= 0) continue;
    const secs = Math.round(a * unitSecs(m[3]));
    if (secs < 5 || secs > 24 * 3600) continue;
    // "a"/"an" only count when they are clearly a duration ("a minute", "an hour"), not e.g. "a min"
    if (/^an?$/i.test(m[1]) && !/^(minute|hour|second)s?$/i.test(m[3]) && !/^(hr|min|sec)$/i.test(m[3])) continue;
    found.push({ start: m.index, end: m.index + m[0].length, text: m[0], seconds: secs, label: fmtDuration(secs), unit: (m[3][0].toLowerCase() as 'h' | 'm' | 's') });
  }
  found.sort((x, y) => x.start - y.start);
  // merge "1 hour and 30 minutes" / "1 hour 30 minutes"
  const out: TimeMatch[] = [];
  for (const f of found) {
    const p = out[out.length - 1];
    const rank = { h: 3, m: 2, s: 1 } as const;
    if (p && p.unit && f.unit && rank[p.unit] > rank[f.unit] && /^\s*(and|,)?\s*$/i.test(text.slice(p.end, f.start))) {
      p.end = f.end; p.text = text.slice(p.start, f.end); p.seconds += f.seconds; p.label = fmtDuration(p.seconds); p.unit = f.unit;
    } else out.push({ ...f });
  }
  return out;
}

export type Segment = { text: string; time?: TimeMatch };
/** splits step text into plain and timer-able segments for rendering */
export function stepSegments(text: string): Segment[] {
  const ts = detectTimes(text); const segs: Segment[] = []; let i = 0;
  for (const t of ts) { if (t.start > i) segs.push({ text: text.slice(i, t.start) }); segs.push({ text: text.slice(t.start, t.end), time: t }); i = t.end; }
  if (i < text.length) segs.push({ text: text.slice(i) });
  return segs;
}

// ---------- timers ----------
export const timerRemaining = (t: Pick<CookTimer, 'endsAt'>, now = Date.now()) => Math.max(0, Math.ceil((t.endsAt - now) / 1000));
export const timerDone = (t: Pick<CookTimer, 'endsAt'>, now = Date.now()) => t.endsAt <= now;

// ---------- progress ----------
export function clampStep(step: number, total: number) { return Math.max(0, Math.min(Math.max(0, total - 1), Math.floor(step) || 0)); }

// ---------- "Used from pantry" ----------
export const LEVELS: { key: string; label: string; pct: number }[] = [
  { key: 'full', label: 'Full', pct: 100 }, { key: 'half', label: 'Half', pct: 50 }, { key: 'low', label: 'Low', pct: 10 }, { key: 'empty', label: 'Empty', pct: 0 },
];
/** nearest preset level for a percentage */
export const levelFor = (pct: number) => LEVELS.reduce((b, l) => (Math.abs(l.pct - pct) < Math.abs(b.pct - pct) ? l : b), LEVELS[0]);
/** suggested "left after cooking": one step down from what it is now (Full -> Half, Half -> Low, Low -> Empty) */
export function suggestedLeft(pct: number): number {
  if (pct > 60) return 50;
  if (pct > 25) return 10;
  return 0;
}
export type UsedRow = { ingredient: string; measure: string; itemId: string; itemName: string; category: string; currentPct: number; newPct: number; ticked: boolean };
/** Pantry items that match the recipe's ingredients. Each item is used at most once. Salt/oil/water-type staples are listed but not pre-ticked. */
export function usedFromPantry(r: Pick<RecipeDetail, 'ingredients'>, items: Item[]): UsedRow[] {
  const taken = new Set<string>(); const rows: UsedRow[] = [];
  for (const ing of r.ingredients) {
    const cands = items.filter(i => i.percentLeft > 0 && !taken.has(i.id) && ingredientMatches((i.recipeName && i.recipeName.trim()) || i.name, ing.name));
    if (!cands.length) continue;
    // use what expires first, then what is already lowest
    cands.sort((a, b) => (daysUntil(a.expiresOn) ?? 9999) - (daysUntil(b.expiresOn) ?? 9999) || a.percentLeft - b.percentLeft);
    const it = cands[0]; taken.add(it.id);
    rows.push({ ingredient: ing.name, measure: ing.measure, itemId: it.id, itemName: it.name, category: it.category, currentPct: it.percentLeft, newPct: suggestedLeft(it.percentLeft), ticked: !isStaple(ing.name) });
  }
  return rows;
}
/** applies the ticked rows to the pantry (percentLeft only; nothing is deleted) */
export function applyUsed(items: Item[], rows: UsedRow[], now = Date.now()): Item[] {
  const by = new Map(rows.filter(r => r.ticked).map(r => [r.itemId, r.newPct]));
  return items.map(i => (by.has(i.id) ? { ...i, percentLeft: by.get(i.id)!, updatedAt: now } : i));
}
