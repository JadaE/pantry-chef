// Bulk-add drafts: rows on the review screen before they become pantry items (receipt, barcode, shopping list).
import type { Item, NutritionFacts } from './types';
import type { ReceiptItem } from './receipt';
import type { OffProduct } from './off';
import { estimateExpiry, matchGrocery } from './groceries';
import { cleanQty, newId, todayISO } from './logic';

export type Draft = {
  key: string; checked: boolean; name: string; qty: string; unit: string; category: string;
  purchasedOn: string; expiresOn: string | null; estimated: boolean; basis?: string;
  source: 'receipt' | 'barcode' | 'shopping' | 'manual'; raw?: string; confidence?: 'high' | 'medium' | 'low';
  barcode?: string; brand?: string | null; imageUrl?: string | null; nutrition?: NutritionFacts | null; ingredientsText?: string | null; recipeName?: string;
};

/** fill/refresh an estimated expiration (never overwrites a date the user picked) */
export function withEstimate(d: Draft): Draft {
  if (d.expiresOn && !d.estimated) return d;
  const e = estimateExpiry(d.name, d.category, d.purchasedOn || todayISO());
  return e ? { ...d, expiresOn: e.date, estimated: true, basis: e.basis } : { ...d, expiresOn: null, estimated: false, basis: undefined };
}
export function draftFromReceipt(it: ReceiptItem, purchasedOn: string): Draft {
  const m = it.match ? matchGrocery(it.match) : null;
  return withEstimate({
    key: newId() + Math.random().toString(36).slice(2, 5), checked: it.food, name: it.name, qty: String(it.qty), unit: it.unit, category: it.category,
    purchasedOn, expiresOn: null, estimated: true, source: 'receipt', raw: it.raw, confidence: it.confidence,
    recipeName: m && it.name.toLowerCase() !== it.match ? it.match ?? undefined : undefined,
  });
}
export function draftFromOff(p: OffProduct, count: number): Draft {
  return withEstimate({
    key: p.barcode + ':' + newId(), checked: true, name: p.name || 'Unnamed product', qty: String(count), unit: 'pcs', category: p.category,
    purchasedOn: todayISO(), expiresOn: null, estimated: true, source: 'barcode', barcode: p.barcode, brand: p.brand, imageUrl: p.imageUrl,
    nutrition: p.nutrition, ingredientsText: p.ingredientsText, recipeName: p.recipeName, raw: [p.brand, p.quantity].filter(Boolean).join(' · ') || undefined,
  });
}
export function draftFromName(name: string, source: Draft['source'], extra: Partial<Draft> = {}): Draft {
  const m = matchGrocery(name);
  return withEstimate({
    key: newId() + Math.random().toString(36).slice(2, 5), checked: true, name, qty: '1', unit: 'pcs', category: m?.g.cat ?? 'Other',
    purchasedOn: todayISO(), expiresOn: null, estimated: true, source, ...extra,
  });
}
export function draftToItem(d: Draft, photoUri: string | null): Item {
  const now = Date.now();
  return {
    id: newId(), name: d.name.trim(), category: d.category, quantity: cleanQty(d.qty), unit: d.unit, percentLeft: 100,
    purchasedOn: d.purchasedOn || null, expiresOn: d.expiresOn, expiryEstimated: !!(d.expiresOn && d.estimated), photoUri,
    notes: '', createdAt: now, updatedAt: now, recipeName: d.recipeName, barcode: d.barcode ?? null, brand: d.brand ?? null,
    nutrition: d.nutrition ?? null, ingredientsText: d.ingredientsText ?? null, source: d.source,
  };
}
