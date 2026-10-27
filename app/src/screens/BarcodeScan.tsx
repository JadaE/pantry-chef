// Barcode quick-add: scan products back to back, look each up on Open Food Facts, then review and add.
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, Pressable, Image, Vibration, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { lookupBarcode, OffProduct } from '../off';
import { cacheGet, cacheSet } from '../store';
import { draftFromOff, draftFromName, Draft } from '../drafts';
import { C } from '../theme';
import { Btn, IconBtn } from '../ui';
import ImportReview from './ImportReview';

type Entry = { code: string; count: number; status: 'looking' | 'found' | 'missing' | 'error'; product?: OffProduct; name: string; lastAt: number; err?: string };
type Props = { soonDays: number; onAdd: (ds: Draft[]) => void; onClose: () => void };
const DAY = 86400000;
const validCode = (c: string) => /^\d{8}$|^\d{12,14}$/.test(c);

export default function BarcodeScan({ soonDays, onAdd, onClose }: Props) {
  const [perm, requestPerm] = useCameraPermissions();
  const [list, setList] = useState<Entry[]>([]);
  const [typed, setTyped] = useState('');
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [review, setReview] = useState<Draft[] | null>(null);
  const listRef = useRef<Entry[]>([]); listRef.current = list;
  const seen = useRef<Record<string, number>>({});

  const patch = (code: string, p: Partial<Entry>) => setList(a => a.map(e => (e.code === code ? { ...e, ...p } : e)));
  const look = useCallback(async (code: string) => {
    patch(code, { status: 'looking', err: undefined });
    try {
      let p = await cacheGet<OffProduct | null>('off:' + code, 30 * DAY);
      if (p === undefined) { p = await lookupBarcode(code); await cacheSet('off:' + code, p); }
      if (p) patch(code, { status: 'found', product: p, name: p.name }); else patch(code, { status: 'missing' });
    } catch (e: any) { patch(code, { status: 'error', err: String(e?.message || e) }); }
  }, []);
  const add = useCallback((raw: string) => {
    const code = raw.replace(/\D/g, '');
    if (!validCode(code)) return;
    const now = Date.now();
    if (now - (seen.current[code] || 0) < 2500) return;     // same code still in view
    seen.current[code] = now;
    Vibration.vibrate(40);
    const ex = listRef.current.find(e => e.code === code);
    if (ex) { patch(code, { count: ex.count + 1, lastAt: now }); setFlash(`${ex.name || code}: ×${ex.count + 1}`); }
    else { setList(a => [{ code, count: 1, status: 'looking', name: '', lastAt: now }, ...a]); setFlash(`Scanned ${code}`); look(code); }
    setTimeout(() => setFlash(null), 1500);
  }, [look]);

  const ready = list.filter(e => e.status === 'found' || e.name.trim());
  const toReview = () => setReview(list.filter(e => e.status === 'found' || e.name.trim()).map(e => e.product
    ? { ...draftFromOff(e.product, e.count), name: e.name.trim() || e.product.name }
    : draftFromName(e.name.trim(), 'barcode', { barcode: e.code, qty: String(e.count), raw: `barcode ${e.code} (not in Open Food Facts)` })));

  if (review) return <ImportReview title="Scanned items" subtitle="Product info from Open Food Facts" drafts={review} soonDays={soonDays} onAdd={onAdd} onClose={onClose} onBack={() => setReview(null)} backLabel="← Keep scanning" />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}><IconBtn label="✕" a11y="Close" onPress={onClose} /><Text style={s.title}>Scan barcodes</Text>
        <Btn label={`Review ${ready.length}`} small disabled={!ready.length} onPress={toReview} /></View>
      <View style={s.camWrap}>
        {!perm ? <ActivityIndicator color="#fff" /> : !perm.granted ? (
          <View style={{ alignItems: 'center', padding: 20 }}>
            <Text style={{ color: '#fff', fontSize: 15, textAlign: 'center', marginBottom: 12 }}>Pantry Chef needs the camera to scan barcodes.</Text>
            <Btn label="Allow camera" onPress={requestPerm} />
          </View>
        ) : paused ? (
          <Pressable onPress={() => setPaused(false)} style={{ alignItems: 'center' }}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>⏸ Paused — tap to scan</Text></Pressable>
        ) : (
          <CameraView style={StyleSheet.absoluteFill} facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={r => add(r.data)} />
        )}
        {perm?.granted && !paused && <View pointerEvents="none" style={s.frame} />}
        {flash && <View style={s.flash}><Text style={s.flashT}>{flash}</Text></View>}
        {perm?.granted && <Pressable onPress={() => setPaused(!paused)} style={s.pause}><Text style={{ color: '#fff', fontWeight: '700' }}>{paused ? '▶ Scan' : '⏸ Pause'}</Text></Pressable>}
      </View>
      <View style={s.typeRow}>
        <TextInput value={typed} onChangeText={setTyped} placeholder="…or type the barcode number" placeholderTextColor={C.faint} keyboardType="number-pad" style={[s.input, { flex: 1 }]} onSubmitEditing={() => { add(typed); setTyped(''); }} />
        <Btn label="Add" small kind="soft" onPress={() => { add(typed); setTyped(''); }} disabled={!validCode(typed.replace(/\D/g, ''))} style={{ marginLeft: 8 }} />
      </View>
      <FlatList data={list} keyExtractor={e => e.code} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={s.hint}>Point the camera at a barcode. Scan items one after another — scanning the same product again adds one more.</Text>}
        renderItem={({ item: e }) => (
          <View style={s.row}>
            {e.product?.imageUrl ? <Image source={{ uri: e.product.imageUrl }} style={s.img} /> : <View style={[s.img, { alignItems: 'center', justifyContent: 'center' }]}><Text>▦</Text></View>}
            <View style={{ flex: 1, marginLeft: 10 }}>
              {e.status === 'looking' && <Text style={s.meta}>Looking up {e.code}…</Text>}
              {e.status === 'found' && <><Text style={s.name} numberOfLines={2}>{e.name}</Text><Text style={s.meta} numberOfLines={1}>{[e.product?.brand, e.product?.quantity, e.product?.category].filter(Boolean).join(' · ')}</Text></>}
              {(e.status === 'missing' || e.status === 'error') && <>
                <Text style={[s.meta, { color: e.status === 'error' ? C.red : C.orange }]}>{e.status === 'error' ? `Lookup failed (${e.err}). ` : 'Not in Open Food Facts. '}Type a name:</Text>
                <TextInput value={e.name} onChangeText={t => patch(e.code, { name: t })} placeholder="e.g. Tortilla chips" placeholderTextColor={C.faint} style={[s.input, { marginTop: 4 }]} />
                {e.status === 'error' && <Pressable onPress={() => look(e.code)}><Text style={s.link}>Try again</Text></Pressable>}
              </>}
            </View>
            <View style={{ alignItems: 'center', marginLeft: 8 }}>
              <Pressable onPress={() => patch(e.code, { count: e.count + 1 })} hitSlop={6}><Text style={s.cnt}>＋</Text></Pressable>
              <Text style={s.cntN}>×{e.count}</Text>
              <Pressable onPress={() => e.count > 1 ? patch(e.code, { count: e.count - 1 }) : setList(a => a.filter(x => x.code !== e.code))} hitSlop={6}><Text style={s.cnt}>{e.count > 1 ? '−' : '🗑'}</Text></Pressable>
            </View>
          </View>
        )} />
    </View>
  );
}
const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.card },
  title: { fontSize: 18, fontWeight: '800', color: C.ink },
  camWrap: { height: 260, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  frame: { width: '78%', height: 120, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 16 },
  flash: { position: 'absolute', bottom: 12, left: 12, right: 90, backgroundColor: 'rgba(47,125,87,0.92)', borderRadius: 10, padding: 8 },
  flashT: { color: '#fff', fontWeight: '700' },
  pause: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  typeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10 },
  input: { backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: C.ink },
  hint: { fontSize: 14, color: C.sub, textAlign: 'center', marginTop: 20, lineHeight: 20, paddingHorizontal: 10 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  img: { width: 48, height: 48, borderRadius: 10, backgroundColor: C.bg },
  name: { fontSize: 16, fontWeight: '700', color: C.ink },
  meta: { fontSize: 13, color: C.sub, marginTop: 2 },
  link: { color: C.primary, fontWeight: '700', marginTop: 4 },
  cnt: { fontSize: 20, color: C.primary, fontWeight: '800', paddingHorizontal: 6 },
  cntN: { fontSize: 14, fontWeight: '800', color: C.ink },
});
