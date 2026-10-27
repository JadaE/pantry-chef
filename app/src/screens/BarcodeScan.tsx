// Barcode quick-add: scan products back to back, look each up on Open Food Facts, then add them (or review first).
// v0.0.6: the add button lives in a bottom bar that is always on screen; the camera stays mounted while paused
// (pausePreview instead of unmount/remount) and is unmounted BEFORE this screen closes, so its preview surface is
// torn down while its parent views still exist.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, Pressable, Image, Vibration, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { lookupBarcode, OffProduct } from '../off';
import { cacheGet, cacheSet } from '../store';
import { Draft, ScanEntry, scanAddLabel, scanEntriesToDrafts, scanReady } from '../drafts';
import { C } from '../theme';
import { Btn, IconBtn } from '../ui';
import ImportReview from './ImportReview';

type Entry = ScanEntry;
type Props = { soonDays: number; onAdd: (ds: Draft[]) => void; onClose: () => void; backRef?: React.MutableRefObject<null | (() => void)> };
const DAY = 86400000;
const validCode = (c: string) => /^\d{8}$|^\d{12,14}$/.test(c);

export default function BarcodeScan({ soonDays, onAdd, onClose, backRef }: Props) {
  const [perm, requestPerm] = useCameraPermissions();
  const [list, setList] = useState<Entry[]>([]);
  const [typed, setTyped] = useState('');
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [review, setReview] = useState<Draft[] | null>(null);
  const [leaving, setLeaving] = useState(false);          // true = camera unmounted, about to close / switch to review
  const cam = useRef<CameraView | null>(null);
  const timers = useRef<any[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  /** unmount the camera first, give CameraX a moment to unbind and release its preview surface, then run `next` */
  const leave = (next: () => void) => { setLeaving(true); timers.current.push(setTimeout(next, 250)); };
  const togglePause = () => { const p = !paused; setPaused(p); (p ? cam.current?.pausePreview() : cam.current?.resumePreview())?.catch?.(() => {}); };
  const listRef = useRef<Entry[]>([]); listRef.current = list;
  const seen = useRef<Record<string, number>>({});
  const pausedRef = useRef(false); pausedRef.current = paused;

  const patch = (code: string, p: Partial<Entry>) => setList(a => a.map(e => (e.code === code ? { ...e, ...p } : e)));
  const look = useCallback(async (code: string) => {
    patch(code, { status: 'looking', err: undefined });
    try {
      let p = await cacheGet<OffProduct | null>('off:' + code, 30 * DAY);
      if (p === undefined) { p = await lookupBarcode(code); await cacheSet('off:' + code, p); }
      if (p) patch(code, { status: 'found', product: p, name: p.name }); else patch(code, { status: 'missing' });
    } catch (e: any) { patch(code, { status: 'error', err: String(e?.message || e) }); }
  }, []);
  const add = useCallback((raw: string, fromCamera = false) => {
    if (fromCamera && pausedRef.current) return;
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

  const ready = scanReady(list);
  const addBtn = scanAddLabel(list);
  const toReview = () => { const ds = scanEntriesToDrafts(list); leave(() => setReview(ds)); };
  const addAll = () => { const ds = scanEntriesToDrafts(list); if (ds.length) leave(() => onAdd(ds)); };
  const close = () => leave(onClose);
  // Android back button: same clean close as the ✕ (camera off first)
  useEffect(() => { if (!backRef) return; backRef.current = review ? onClose : close; return () => { backRef.current = null; }; });

  if (review) return <ImportReview title="Scanned items" subtitle="Product info from Open Food Facts" drafts={review} soonDays={soonDays} onAdd={onAdd} onClose={onClose} onBack={() => { setReview(null); setLeaving(false); }} backLabel="← Keep scanning" />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}><IconBtn label="✕" a11y="Close" onPress={close} /><Text style={s.title}>Scan barcodes</Text><View style={{ width: 38 }} /></View>
      <View style={s.camWrap}>
        {!perm ? <ActivityIndicator color="#fff" /> : !perm.granted ? (
          <View style={{ alignItems: 'center', padding: 20 }}>
            <Text style={{ color: '#fff', fontSize: 15, textAlign: 'center', marginBottom: 12 }}>Pantry Chef needs the camera to scan barcodes.</Text>
            <Btn label="Allow camera" onPress={requestPerm} />
          </View>
        ) : leaving ? null : (
          <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={paused ? undefined : r => add(r.data, true)} />
        )}
        {perm?.granted && !paused && !leaving && <View pointerEvents="none" style={s.frame} />}
        {perm?.granted && paused && !leaving && <Pressable onPress={togglePause} style={s.pausedCover}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>⏸ Paused — tap to scan</Text></Pressable>}
        {flash && <View style={s.flash}><Text style={s.flashT}>{flash}</Text></View>}
        {perm?.granted && !leaving && <Pressable onPress={togglePause} style={s.pause}><Text style={{ color: '#fff', fontWeight: '700' }}>{paused ? '▶ Scan' : '⏸ Pause'}</Text></Pressable>}
      </View>
      <View style={s.typeRow}>
        <TextInput value={typed} onChangeText={setTyped} placeholder="…or type the barcode number" placeholderTextColor={C.faint} keyboardType="number-pad" style={[s.input, { flex: 1 }]} onSubmitEditing={() => { add(typed); setTyped(''); }} />
        <Btn label="Add" small kind="soft" onPress={() => { add(typed); setTyped(''); }} disabled={!validCode(typed.replace(/\D/g, ''))} style={{ marginLeft: 8 }} />
      </View>
      <FlatList data={list} keyExtractor={e => e.code} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
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
      <View style={s.bottom}>
        {ready.length > 0 && <Btn label="Review" kind="ghost" onPress={toReview} style={{ marginRight: 10 }} />}
        <Btn label={addBtn.label} onPress={addAll} disabled={!addBtn.enabled} style={{ flex: 1 }} />
      </View>
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
  pausedCover: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(17,17,17,0.85)', alignItems: 'center', justifyContent: 'center' },
  bottom: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line },
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
