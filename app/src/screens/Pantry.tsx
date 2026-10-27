import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, Image, StyleSheet, ScrollView } from 'react-native';
import type { DB, Item, Profile, Settings } from '../types';
import { itemWarnings } from '../warnings';
import { CATEGORIES } from '../types';
import { expiryLabel, expiryStatus, filterItems, Filter, leftLabel, Sort, sortItems, summary } from '../logic';
import { C, statusColors, CAT_EMOJI } from '../theme';
import { Badge, Chip, EstBadge } from '../ui';

const FILTERS: { k: Filter; label: string }[] = [
  { k: 'all', label: 'All' }, { k: 'attention', label: '⚠️ Use soon' }, { k: 'expired', label: 'Expired' }, { k: 'low', label: 'Running low' }, { k: 'nodate', label: 'No date' },
];
const SORTS: { k: Sort; label: string }[] = [{ k: 'expiry', label: 'Expiry' }, { k: 'name', label: 'A–Z' }, { k: 'recent', label: 'Newest' }, { k: 'category', label: 'Category' }];

export default function Pantry({ db, onOpen, onAdd, onReceipt, onBarcode, onLabel, onAbout, updateReady }: { db: DB; onOpen: (it: Item) => void; onAdd: () => void; onReceipt: () => void; onBarcode: () => void; onLabel: () => void; onAbout: () => void; updateReady?: boolean }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('expiry');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const soon = db.settings.soonDays;
  const list = useMemo(() => sortItems(filterItems(db.items, filter, q, cat, soon), sort), [db.items, filter, q, cat, sort, soon]);
  const sum = summary(db.items, soon);
  const usedCats = CATEGORIES.filter(c => db.items.some(i => i.category === c));

  const header = (
    <View>
      <View style={s.hero}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[s.h1, { flex: 1 }]}>Pantry</Text>
          <Pressable onPress={onAbout} hitSlop={8} accessibilityRole="button" accessibilityLabel={updateReady ? 'About and settings, update available' : 'About and settings'} style={({ pressed }) => [s.info, pressed && { opacity: 0.6 }]}>
            <Text style={s.infoT}>ⓘ</Text>
            {updateReady && <View style={s.dot} />}
          </Pressable>
        </View>
        <Text style={s.heroSub}>{sum.total === 0 ? 'Nothing tracked yet' : `${sum.total} item${sum.total === 1 ? '' : 's'}`}</Text>
        {(sum.expired > 0 || sum.soon > 0) && (
          <Pressable onPress={() => setFilter('attention')} style={s.alert}>
            {sum.expired > 0 && <Badge label={`${sum.expired} expired`} fg="#fff" bg={C.red} style={{ marginRight: 6 }} />}
            {sum.soon > 0 && <Badge label={`${sum.soon} expiring within ${soon} days`} fg="#fff" bg={C.orange} />}
          </Pressable>
        )}
      </View>
      <View style={s.bulk}>
        <Pressable onPress={onReceipt} style={({ pressed }) => [s.bulkB, pressed && { opacity: 0.7 }]} accessibilityLabel="Scan a receipt"><Text style={s.bulkI}>🧾</Text><Text style={s.bulkT}>Receipt</Text></Pressable>
        <Pressable onPress={onBarcode} style={({ pressed }) => [s.bulkB, { marginLeft: 10 }, pressed && { opacity: 0.7 }]} accessibilityLabel="Scan barcodes"><Text style={s.bulkI}>▦</Text><Text style={s.bulkT}>Barcodes</Text></Pressable>
        <Pressable onPress={onLabel} style={({ pressed }) => [s.bulkB, { marginLeft: 10 }, pressed && { opacity: 0.7 }]} accessibilityLabel="Scan a nutrition label"><Text style={s.bulkI}>🏷️</Text><Text style={s.bulkT}>Label</Text></Pressable>
      </View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search items or notes" placeholderTextColor={C.faint} style={s.search} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
        {FILTERS.map(f => <Chip key={f.k} label={f.label} on={filter === f.k} onPress={() => setFilter(f.k)} />)}
      </ScrollView>
      {usedCats.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Chip label="All categories" on={!cat} onPress={() => setCat(null)} color={C.accent} />
        {usedCats.map(c => <Chip key={c} label={`${CAT_EMOJI[c] || ''} ${c}`} on={cat === c} onPress={() => setCat(cat === c ? null : c)} color={C.accent} />)}
      </ScrollView>}
      <View style={s.sortRow}><Text style={s.sortL}>Sort</Text>{SORTS.map(o => <Pressable key={o.k} onPress={() => setSort(o.k)} hitSlop={6}><Text style={[s.sortO, sort === o.k && s.sortOn]}>{o.label}</Text></Pressable>)}</View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={list}
        keyExtractor={i => i.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<View style={s.empty}>
          <Text style={{ fontSize: 44 }}>🧺</Text>
          <Text style={s.emptyT}>{db.items.length ? 'No items match this filter.' : 'Add your first item'}</Text>
          {!db.items.length && <Text style={s.emptyS}>Scan a grocery receipt or product barcodes to add a whole trip at once, or tap ＋ Add item. Pantry Chef shows what expires soon and suggests recipes from what you have.</Text>}
        </View>}
        renderItem={({ item }) => <Row it={item} soon={soon} flags={db.settings} people={db.profiles} onPress={() => onOpen(item)} />}
      />
      <Pressable onPress={onAdd} style={({ pressed }) => [s.fab, pressed && { opacity: 0.8 }]} accessibilityLabel="Add item"><Text style={s.fabT}>＋ Add item</Text></Pressable>
    </View>
  );
}

function Row({ it, soon, flags, people, onPress }: { it: Item; soon: number; flags: Settings; people: Profile[]; onPress: () => void }) {
  const alerts = (it.nutrition || it.ingredientsText) ? itemWarnings(it, flags, people).filter(w => w.level === 'high').length : 0;
  const st = expiryStatus(it, soon); const col = statusColors[st];
  const qty = it.quantity != null ? `${it.quantity}${it.unit ? ' ' + it.unit : ''}` : it.unit;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, { borderLeftColor: col.fg }, pressed && { opacity: 0.8 }]}>
      {it.photoUri ? <Image source={{ uri: it.photoUri }} style={s.thumb} /> : <View style={[s.thumb, s.thumbE]}><Text style={{ fontSize: 24 }}>{CAT_EMOJI[it.category] || '🛒'}</Text></View>}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={s.name} numberOfLines={1}>{it.name}</Text>
        <Text style={s.meta} numberOfLines={1}>{[it.category, qty, leftLabel(it.percentLeft)].filter(Boolean).join(' · ')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          {it.expiryEstimated && it.expiresOn ? <EstBadge label={`est. ${expiryLabel(it)}`} fg={col.fg} /> : <Badge label={expiryLabel(it)} fg={col.fg} bg={col.bg} />}
          {alerts > 0 && <Badge label={`⚠ ${alerts}`} fg={C.red} bg={C.redSoft} style={{ marginLeft: 6 }} />}
          {it.notes ? <Text style={s.note} numberOfLines={1}>📝 {it.notes}</Text> : null}
        </View>
      </View>
      <Meter pct={it.percentLeft} />
    </Pressable>
  );
}
const Meter = ({ pct }: { pct: number }) => (
  <View style={s.meter}><View style={[s.meterFill, { height: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: pct <= 25 ? C.orange : C.primary }]} /></View>
);

const s = StyleSheet.create({
  hero: { marginBottom: 12 },
  bulk: { flexDirection: 'row', marginBottom: 12 },
  bulkB: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primarySoft, borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#cfe6d9' },
  bulkI: { fontSize: 18, marginRight: 6, color: C.primary },
  bulkT: { fontSize: 15, fontWeight: '800', color: C.primary },
  h1: { fontSize: 32, fontWeight: '800', color: C.ink },
  info: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  infoT: { fontSize: 24, color: C.sub, fontWeight: '600' },
  dot: { position: 'absolute', top: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: C.accent, borderWidth: 2, borderColor: C.card },
  heroSub: { fontSize: 15, color: C.sub, marginTop: 2 },
  alert: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  search: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, color: C.ink },
  sortRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 10 },
  sortL: { color: C.faint, fontSize: 13, marginRight: 10 },
  sortO: { color: C.sub, fontSize: 14, marginRight: 14, fontWeight: '600' },
  sortOn: { color: C.primary, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: C.line, borderLeftWidth: 5 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  thumbE: { backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '700', color: C.ink },
  meta: { fontSize: 13, color: C.sub, marginTop: 2 },
  note: { fontSize: 12, color: C.faint, marginLeft: 8, flex: 1 },
  meter: { width: 8, height: 48, borderRadius: 4, backgroundColor: C.graySoft, marginLeft: 10, justifyContent: 'flex-end', overflow: 'hidden' },
  meterFill: { width: '100%', borderRadius: 4 },
  empty: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 20 },
  emptyT: { fontSize: 18, fontWeight: '700', color: C.ink, marginTop: 10 },
  emptyS: { fontSize: 14, color: C.sub, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  fab: { position: 'absolute', right: 18, bottom: 18, backgroundColor: C.primary, borderRadius: 28, paddingHorizontal: 22, paddingVertical: 15, elevation: 5, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  fabT: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
