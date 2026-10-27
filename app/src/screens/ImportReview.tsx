// Review screen for bulk adds (receipt scan, barcode scan, shopping list -> pantry).
// Every row: checkbox, editable name, qty + unit, category, expiration (estimated dates get a dashed "est." badge).
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { CATEGORIES, UNITS } from '../types';
import { cleanQty, expiryLabel, expiryStatus } from '../logic';
import { describeDays } from '../groceries';
import type { Draft } from '../drafts';
import { withEstimate } from '../drafts';
import { C, CAT_EMOJI, statusColors } from '../theme';
import { Badge, Btn, Check, Chip, DatePickerModal, EstBadge, IconBtn } from '../ui';

type Props = { title: string; subtitle?: string; drafts: Draft[]; soonDays: number; onAdd: (ds: Draft[]) => void; onClose: () => void; onBack?: () => void; backLabel?: string };

export default function ImportReview({ title, subtitle, drafts: init, soonDays, onAdd, onClose, onBack, backLabel }: Props) {
  const [ds, setDs] = useState<Draft[]>(init);
  const [open, setOpen] = useState<string | null>(null);          // row expanded for unit/category chips
  const [pick, setPick] = useState<{ key: string; field: 'expiresOn' | 'purchasedOn' } | 'all' | null>(null);
  const set = (key: string, f: (d: Draft) => Draft) => setDs(a => a.map(d => (d.key === key ? f(d) : d)));
  const n = ds.filter(d => d.checked && d.name.trim()).length;
  const allOn = ds.length > 0 && ds.every(d => d.checked);
  const purchased = ds[0]?.purchasedOn;
  const pickValue = pick === 'all' ? purchased : pick ? (ds.find(d => d.key === pick.key)?.[pick.field] ?? null) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <IconBtn label="✕" a11y="Close" onPress={onClose} />
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={s.sub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <Btn label={`Add ${n}`} small onPress={() => onAdd(ds.filter(d => d.checked && d.name.trim()))} disabled={!n} />
      </View>
      <FlatList
        data={ds}
        keyExtractor={d => d.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
        ListHeaderComponent={<View style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip label={allOn ? 'Select none' : 'Select all'} onPress={() => setDs(a => a.map(d => ({ ...d, checked: !allOn })))} />
            {purchased ? <Chip label={`🛍️ Bought ${purchased}`} onPress={() => setPick('all')} color={C.accent} /> : null}
            {onBack ? <Chip label={backLabel || '← Back'} onPress={onBack} /> : null}
          </View>
          <Text style={s.hint}>Check the names, untick anything you don't want, then tap Add. Dates marked <Text style={{ fontWeight: '800' }}>est.</Text> are typical shelf life — you can confirm or change them later.</Text>
        </View>}
        ListEmptyComponent={<Text style={[s.hint, { textAlign: 'center', marginTop: 30 }]}>Nothing to review.</Text>}
        renderItem={({ item: d }) => {
          const exp = d.expiresOn; const st = statusColors[expiryStatus({ expiresOn: exp }, soonDays)];
          const expanded = open === d.key;
          return (
            <View style={[s.card, !d.checked && { opacity: 0.55 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Check on={d.checked} onPress={() => set(d.key, x => ({ ...x, checked: !x.checked }))} />
                {d.imageUrl ? <Image source={{ uri: d.imageUrl }} style={s.img} /> : <Text style={{ fontSize: 22, marginLeft: 10 }}>{CAT_EMOJI[d.category] || '🛒'}</Text>}
                <TextInput value={d.name} onChangeText={t => set(d.key, x => ({ ...x, name: t }))} onEndEditing={() => set(d.key, x => withEstimate(x))}
                  style={[s.input, { flex: 1, marginLeft: 10 }]} placeholder="Name" placeholderTextColor={C.faint} />
              </View>
              {d.raw ? <Text style={s.raw} numberOfLines={1}>{d.source === 'receipt' ? '🧾 ' : d.source === 'barcode' ? '▦ ' : '🛒 '}{d.raw}{d.confidence === 'low' ? '  · check name' : ''}</Text> : null}
              <View style={s.line}>
                <TextInput value={d.qty} onChangeText={t => set(d.key, x => ({ ...x, qty: t }))} keyboardType="decimal-pad" style={[s.input, { width: 64, textAlign: 'center' }]} />
                <Pressable onPress={() => setOpen(expanded ? null : d.key)} style={s.pill}><Text style={s.pillT}>{d.unit} ▾</Text></Pressable>
                <Pressable onPress={() => setOpen(expanded ? null : d.key)} style={s.pill}><Text style={s.pillT}>{CAT_EMOJI[d.category] || ''} {d.category} ▾</Text></Pressable>
              </View>
              {expanded && <View style={{ marginTop: 6 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>{UNITS.map(u => <Chip key={u} label={u} on={d.unit === u} color={C.accent} onPress={() => set(d.key, x => ({ ...x, unit: u }))} />)}</ScrollView>
                <View style={s.wrap}>{CATEGORIES.map(c => <Chip key={c} label={`${CAT_EMOJI[c]} ${c}`} on={d.category === c} onPress={() => set(d.key, x => withEstimate({ ...x, category: c }))} />)}</View>
              </View>}
              <View style={[s.line, { marginTop: 8 }]}>
                <Pressable onPress={() => setPick({ key: d.key, field: 'expiresOn' })} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Text style={s.expL}>Expires </Text>
                  {exp ? (d.estimated ? <EstBadge label={`est. ${exp} · ${expiryLabel({ expiresOn: exp })}`} fg={st.fg} /> : <Badge label={`${exp} · ${expiryLabel({ expiresOn: exp })}`} fg={st.fg} bg={st.bg} />)
                    : <Text style={[s.expL, { color: C.faint }]}>no date — tap to set</Text>}
                </Pressable>
                {exp ? <Pressable onPress={() => set(d.key, x => ({ ...x, expiresOn: null, estimated: false }))} hitSlop={8}><Text style={s.clear}>Clear</Text></Pressable> : null}
              </View>
              {d.estimated && d.basis && exp ? <Text style={s.raw}>Typical for {d.basis}: {describeDays(Math.max(1, Math.round((new Date(exp).getTime() - new Date(d.purchasedOn).getTime()) / 86400000)))}</Text> : null}
            </View>
          );
        }}
      />
      <View style={s.bottom}><Btn label={n ? `Add ${n} item${n === 1 ? '' : 's'} to pantry` : 'Nothing selected'} disabled={!n} onPress={() => onAdd(ds.filter(d => d.checked && d.name.trim()))} /></View>
      <DatePickerModal visible={!!pick} value={pickValue || null} title={pick === 'all' ? 'Purchase date for all items' : 'Expiration date'}
        onClose={() => setPick(null)}
        onPick={iso => {
          if (pick === 'all') setDs(a => a.map(d => withEstimate({ ...d, purchasedOn: iso })));
          else if (pick) set(pick.key, x => ({ ...x, [pick.field]: iso, ...(pick.field === 'expiresOn' ? { estimated: false } : {}) }));
        }} />
    </View>
  );
}
export const qtyOk = (q: string) => q.trim() === '' || cleanQty(q) != null;
const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.card },
  title: { fontSize: 18, fontWeight: '800', color: C.ink },
  sub: { fontSize: 13, color: C.sub },
  hint: { fontSize: 13, color: C.sub, lineHeight: 18, marginTop: 4 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  img: { width: 34, height: 34, borderRadius: 8, marginLeft: 10, backgroundColor: C.bg },
  input: { backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 7, fontSize: 16, color: C.ink },
  raw: { fontSize: 12, color: C.faint, marginTop: 5 },
  line: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  pill: { marginLeft: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg },
  pillT: { fontSize: 14, fontWeight: '600', color: C.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  expL: { fontSize: 14, color: C.sub, fontWeight: '600', marginRight: 4 },
  clear: { color: C.sub, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line },
});
