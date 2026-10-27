// Quick food log. One text box (type, or tap the mic) -> a one-line confirm card -> "Log it". No form.
//   "2 servings Chips, 320 cal"  [who chips] [meal chip] [warnings]  [Log it]
// Also: scan a barcode, or tap a recent pantry item (big chips). Everything stays on the phone.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, ToastAndroid, Vibration, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { DB, Item, Meal, NutritionFacts } from '../types';
import { atFor, computePart, confirmLine, dayOf, lowerPantry, makeEntries, mealForHour, MEAL_ICON, parseLog, preLogWarnings, recentItems, servingsText, Amount, Computed, LogPart, PreWarning } from '../intake';
import { lookupBarcode } from '../off';
import { cacheGet, cacheSet } from '../store';
import { draftFromName, draftToItem } from '../drafts';
import { addDays, todayISO } from '../logic';
import { abortListening, startListening, stopListening, useSpeechEvent, voiceAvailable, voiceErrorText } from '../speech';
import { C } from '../theme';
import { Btn, Card, Chip, IconBtn } from '../ui';
import LabelScan, { LabelResult } from './LabelScan';

type Props = { db: DB; update: (f: (d: DB) => DB) => void; onClose: () => void; startScan?: boolean; backRef?: React.MutableRefObject<null | (() => void)> };
const toast = (m: string) => { try { ToastAndroid.show(m, ToastAndroid.SHORT); } catch {} };
const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const DAY = 86400000;
const validCode = (c: string) => /^\d{8}$|^\d{12,14}$/.test(c);
const QUICK = [0.5, 1, 1.5, 2];

export default function LogFood({ db, update, onClose: closeNow, startScan, backRef }: Props) {
  const [text, setText] = useState('');
  const [pick, setPick] = useState<Record<number, string | null>>({});        // part index -> chosen item id (null = "just a note")
  const [amt, setAmt] = useState<Record<number, number>>({});                  // part index -> servings chosen with the quick chips
  const [extra, setExtra] = useState<Item[]>([]);                              // scanned products that are not in the pantry (not saved there)
  const [who, setWho] = useState<string[] | null>(null);                       // null = not touched yet
  const [meal, setMeal] = useState<Meal | null>(null);
  const [yesterday, setYesterday] = useState(false);
  const [lower, setLower] = useState(db.settings.logLowersPantry !== false);
  const [scan, setScan] = useState(!!startScan);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  // v0.0.6: if the camera is open, unmount it first and close a moment later (clean camera teardown; see BarcodeScan)
  const closeT = useRef<any>(null);
  useEffect(() => () => clearTimeout(closeT.current), []);
  const onClose = () => { if (scan) { setScan(false); closeT.current = setTimeout(closeNow, 250); } else closeNow(); };
  useEffect(() => { if (!backRef) return; backRef.current = () => { abortListening(); onClose(); }; return () => { backRef.current = null; }; });
  const [labelFor, setLabelFor] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [micMsg, setMicMsg] = useState('');
  const [perm, requestPerm] = useCameraPermissions();
  const seen = useRef<Record<string, number>>({});
  const canVoice = useMemo(() => voiceAvailable(), []);

  const items = useMemo(() => [...db.items, ...extra], [db.items, extra]);
  const recentIds = useMemo(() => recentItems(db.items, db.intake, 6).map(i => i.id), [db.items, db.intake]);
  const parsed = useMemo(() => parseLog(text, items, db.profiles, recentIds), [text, items, db.profiles, recentIds]);

  // who: parsed names ("for Sam") win until the chips are touched; else the last-used people; else the only non-guest person
  const defaultWho = useMemo(() => {
    const ids = (db.logPeopleIds || []).filter(id => db.profiles.some(p => p.id === id));
    if (ids.length) return ids;
    const reg = db.profiles.filter(p => !p.guest); return reg.length === 1 ? [reg[0].id] : db.profiles.length === 1 ? [db.profiles[0].id] : [];
  }, [db.logPeopleIds, db.profiles]);
  const effWho = who ?? (parsed.people.length ? parsed.people : defaultWho);
  const effMeal: Meal = meal ?? parsed.meal ?? mealForHour(new Date().getHours());
  const dayOffset = yesterday || parsed.dayOffset === -1 ? -1 : 0;
  const day = addDays(todayISO(), dayOffset);

  const rows = parsed.parts.map((p, i) => {
    const chosen = i in pick ? (pick[i] === null ? null : items.find(x => x.id === pick[i]) || null) : p.item;
    const amount: Amount = i in amt ? { kind: 'servings', n: amt[i] } : p.amount;
    const label = chosen ? chosen.name : cap(p.query || 'Food');
    const c = computePart({ label, amount, item: chosen }, Math.max(1, effWho.length));
    return { p, chosen, amount, c, i };
  });
  const profiles = db.profiles.filter(x => effWho.includes(x.id));
  // warnings BEFORE logging: what would this do to each person's day?
  const warns: PreWarning[] = useMemo(() => {
    const add = { calories: 0 as number | null, nutrients: {} as Record<string, { amount: number; unit: string }> };
    for (const r of rows) { if (r.c.noNutrition) continue; add.calories = (add.calories || 0) + (r.c.per.calories || 0); for (const [k, v] of Object.entries(r.c.per.nutrients)) if (k !== 'calories') add.nutrients[k] = { amount: (add.nutrients[k]?.amount || 0) + (v.amount ?? 0), unit: v.unit }; }
    return profiles.flatMap(pr => preLogWarnings(pr, db.intake, add, day));
  }, [rows.map(r => r.c.per.calories + ':' + r.c.servings).join('|'), effWho.join(','), db.intake, day]); // eslint-disable-line

  const drops: Record<string, number> = {};
  for (const r of rows) if (r.chosen && r.c.dropPct && db.items.some(x => x.id === r.chosen!.id)) drops[r.chosen.id] = (drops[r.chosen.id] || 0) + r.c.dropPct;
  const canLower = Object.keys(drops).length > 0;

  const commit = () => {
    if (!rows.length) return;
    const at = atFor(dayOffset, effMeal);
    const entries = rows.flatMap(r => makeEntries(r.c, effWho, effMeal, at, { itemId: r.chosen && db.items.some(x => x.id === r.chosen!.id) ? r.chosen.id : undefined }));
    update(d => ({ ...d, intake: [...entries, ...d.intake], logPeopleIds: effWho, items: lower && canLower ? lowerPantry(d.items, drops) : d.items }));
    const nd = entries.filter(e => e.noNutrition).length;
    toast(`Logged ${rows.map(r => r.c.label).join(', ')}${nd ? ' (no nutrition data)' : ''}${lower && canLower ? ' · pantry updated' : ''}`);
    abortListening(); onClose();
  };

  // ---- voice ----
  useSpeechEvent('result', e => { const t = e.results?.[0]?.transcript; if (t) { setText(t); setPick({}); setAmt({}); } });
  useSpeechEvent('end', () => setListening(false));
  useSpeechEvent('error', e => { setListening(false); setMicMsg(voiceErrorText(e.error)); });
  const mic = async () => {
    if (listening) { stopListening(); return; }
    setMicMsg(''); const r = await startListening();
    if (r.ok) setListening(true); else setMicMsg(r.message);
  };

  // ---- barcode ----
  const onCode = useCallback(async (raw: string) => {
    const code = raw.replace(/\D/g, ''); if (!validCode(code)) return;
    const now = Date.now(); if (now - (seen.current[code] || 0) < 3000) return; seen.current[code] = now;
    Vibration.vibrate(40);
    const have = db.items.find(i => i.barcode === code);
    const apply = (it: Item) => { setScan(false); setScanMsg(null); setText(it.name); setPick({ 0: it.id }); setAmt({}); };
    if (have) return apply(have);
    setScanMsg(`Looking up ${code}…`);
    try {
      let p = await cacheGet<any>('off:' + code, 30 * DAY);
      if (p === undefined) { p = await lookupBarcode(code); await cacheSet('off:' + code, p); }
      if (!p) { setScanMsg(`${code} isn't in Open Food Facts. Type what it is instead.`); return; }
      const it = draftToItem({ ...draftFromName(p.name || 'Scanned product', 'barcode', { barcode: code, brand: p.brand, nutrition: p.nutrition, ingredientsText: p.ingredientsText }) }, null);
      setExtra(x => [it, ...x.filter(y => y.barcode !== code)]); apply(it);
    } catch { setScanMsg("Couldn't look that up (offline?). Type what it is instead."); }
  }, [db.items]);

  // ---- label nudge ----
  const applyLabel = (i: number, res: LabelResult) => {
    setLabelFor(null);
    const r = rows.find(x => x.i === i); if (!r || !res.nutrition) return;
    const nutrition: NutritionFacts = res.nutrition;
    if (r.chosen && db.items.some(x => x.id === r.chosen!.id)) {
      update(d => ({ ...d, items: d.items.map(x => (x.id === r.chosen!.id ? { ...x, nutrition, ingredientsText: res.ingredientsText ?? x.ingredientsText ?? null, updatedAt: Date.now() } : x)) }));
    } else if (r.chosen) {                         // scanned product not in the pantry: keep the label on the temporary item
      setExtra(x => x.map(y => (y.id === r.chosen!.id ? { ...y, nutrition } : y)));
    } else {                                       // a free-text food: save it as a pantry item so the label is kept (no amount left to track)
      const it = draftToItem(draftFromName(cap(r.p.query || 'Food'), 'manual', { nutrition, ingredientsText: res.ingredientsText }), null);
      update(d => ({ ...d, items: [it, ...d.items] })); setPick(p => ({ ...p, [i]: it.id }));
      toast(`Saved ${it.name} to your pantry with its label`);
    }
  };

  if (labelFor != null) {
    const r = rows.find(x => x.i === labelFor);
    return <LabelScan items={db.items} ctx={{ name: r?.c.label || 'Food', barcode: r?.chosen?.barcode, nutrition: r?.chosen?.nutrition }} onDone={(res) => applyLabel(labelFor, res)} onClose={() => setLabelFor(null)} />;
  }

  const recents = recentItems(db.items, db.intake, 8);
  const empty = !text.trim();
  const noPeople = db.profiles.length === 0;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}><IconBtn label="✕" a11y="Close" onPress={() => { abortListening(); onClose(); }} /><Text style={s.title}>Log food</Text><View style={{ width: 38 }} /></View>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={s.inRow}>
          <TextInput value={text} onChangeText={t => { setText(t); setPick({}); setAmt({}); }} autoFocus={!startScan} placeholder={listening ? 'Listening…' : 'What did you eat?  e.g. 2 servings of chips'} placeholderTextColor={C.faint}
            style={s.input} multiline={false} returnKeyType="done" onSubmitEditing={commit} accessibilityLabel="What did you eat" />
          {canVoice && <Pressable onPress={mic} accessibilityLabel={listening ? 'Stop listening' : 'Speak what you ate'} style={[s.sq, listening && { backgroundColor: C.red, borderColor: C.red }]}><Text style={{ fontSize: 22 }}>{listening ? '⏹' : '🎤'}</Text></Pressable>}
          <Pressable onPress={() => { setScan(x => !x); setScanMsg(null); }} accessibilityLabel="Scan a barcode" style={[s.sq, scan && { backgroundColor: C.primarySoft, borderColor: C.primary }]}><Text style={{ fontSize: 22 }}>▦</Text></Pressable>
        </View>
        {!!micMsg && <Text style={s.warnT}>{micMsg}</Text>}
        {listening && <Text style={s.hint}>🎤 Listening (on this phone)… say it like “half the mac and cheese”.</Text>}

        {scan && (
          <View style={s.cam}>
            {!perm ? <ActivityIndicator color="#fff" /> : !perm.granted ? (
              <View style={{ alignItems: 'center', padding: 16 }}><Text style={{ color: '#fff', textAlign: 'center', marginBottom: 10 }}>Pantry Chef needs the camera to scan barcodes.</Text><Btn label="Allow camera" onPress={requestPerm} /></View>
            ) : <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onBarcodeScanned={r => onCode(r.data)} />}
            {perm?.granted && <View pointerEvents="none" style={s.frame} />}
            {!!scanMsg && <View style={s.flash}><Text style={s.flashT}>{scanMsg}</Text></View>}
          </View>
        )}

        {empty && !scan && (
          <View style={{ marginTop: 14 }}>
            {noPeople && <Card style={{ backgroundColor: C.yellowSoft, borderColor: C.yellowSoft }}><Text style={s.hintDark}>Tip: add people on the People tab to keep a daily total for each person. Until then, food is logged without a person.</Text></Card>}
            <Text style={s.sec}>{recents.length ? 'Tap something you had' : 'Nothing in your pantry yet'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {recents.map(it => (
                <Pressable key={it.id} onPress={() => { setText(it.name); setPick({ 0: it.id }); setAmt({}); }} style={({ pressed }) => [s.big, pressed && { opacity: 0.7 }]} accessibilityLabel={`Log ${it.name}`}>
                  <Text style={s.bigT} numberOfLines={2}>{it.name}</Text>
                  {!it.nutrition && <Text style={s.bigS}>no nutrition data</Text>}
                </Pressable>
              ))}
            </View>
            <Text style={s.hint}>Or type / say it: “ate 2 servings of chips”, “half the mac and cheese”, “a bowl of cereal”, “had the leftover tacos for lunch”.</Text>
          </View>
        )}

        {!empty && rows.length === 0 && <Text style={s.hint}>Say what you ate and how much.</Text>}
        {rows.map(r => <PartCard key={r.i} r={r} nPeople={Math.max(1, effWho.length)} onQuick={n => setAmt(a => ({ ...a, [r.i]: n }))} onPickItem={id => { setPick(p => ({ ...p, [r.i]: id })); setAmt(a => { const { [r.i]: _, ...rest } = a; return rest; }); }} onLabel={() => setLabelFor(r.i)} />)}

        {rows.length > 0 && <>
          {warns.map((w, i) => (
            <View key={i} style={[s.warn, w.level === 'over' ? { backgroundColor: C.redSoft } : { backgroundColor: C.orangeSoft }]}>
              <Text style={[s.warnT, { color: w.level === 'over' ? C.red : C.orange }]}>{w.level === 'over' ? '⚠️ ' : '• '}{w.text}</Text>
            </View>
          ))}
          <Text style={s.sec}>Who ate it</Text>
          {noPeople ? <Text style={s.hint}>No people added yet.</Text> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {db.profiles.map(p => <Chip key={p.id} label={p.name + (p.guest ? ' (guest)' : '')} on={effWho.includes(p.id)} onPress={() => setWho(effWho.includes(p.id) ? effWho.filter(x => x !== p.id) : [...effWho, p.id])} />)}
            </View>
          )}
          <Text style={s.sec}>Meal</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {MEALS.map(m => <Chip key={m} label={`${MEAL_ICON[m]} ${cap(m)}`} on={effMeal === m} onPress={() => setMeal(m)} />)}
            <Chip label="Yesterday" on={dayOffset === -1} onPress={() => setYesterday(!yesterday)} color={C.accent} />
          </View>
          {canLower && <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            <Chip label={lower ? `✓ Lower pantry (${Object.entries(drops).map(([id, v]) => `${items.find(x => x.id === id)?.name ?? ''} −${v}%`).join(', ')})` : 'Leave pantry as is'} on={lower} onPress={() => setLower(!lower)} />
          </View>}
        </>}
      </ScrollView>
      <View style={s.bar}>
        <Btn label={rows.length ? `✓ Log it${effWho.length > 1 ? ` for ${effWho.length}` : ''}` : scan ? 'Scan a barcode to log it' : 'Type or say what you ate'} onPress={commit} disabled={!rows.length} style={{ paddingVertical: 17 }} />
      </View>
    </View>
  );
}

function PartCard({ r, nPeople, onQuick, onPickItem, onLabel }: { r: { p: LogPart; chosen: Item | null; amount: Amount; c: Computed; i: number }; nPeople: number; onQuick: (n: number) => void; onPickItem: (id: string | null) => void; onLabel: () => void }) {
  const { p, chosen, c } = r;
  const alts = p.matches.filter(m => m.item.id !== chosen?.id).slice(0, 3);
  return (
    <Card style={{ marginTop: 14 }}>
      <Text style={s.line} accessibilityLiveRegion="polite">{confirmLine(c, nPeople)}</Text>
      {!chosen && <Text style={s.sub}>Not in your pantry. I'll log “{c.label}” as a note.</Text>}
      {!!c.assumed && <Text style={s.sub}>({c.assumed})</Text>}
      {c.noNutrition && (
        <View style={s.nudge}><Text style={s.nudgeT}>No nutrition data for this one, so it won't count toward totals.</Text>
          <Btn label="📷 Scan the label" kind="soft" small onPress={onLabel} style={{ marginTop: 8, alignSelf: 'flex-start' }} /></View>
      )}
      {!c.shared && <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
        {QUICK.map(n => <Chip key={n} label={servingsText(n).replace(' servings', '').replace(' serving', '') + '×'} on={Math.abs(c.perPerson - n) < 0.01 && (r.amount.kind === 'servings' || r.amount.kind === 'default')} onPress={() => onQuick(n)} />)}
        <Text style={[s.sub, { alignSelf: 'center', marginLeft: 4 }]}>servings</Text>
      </View>}
      {alts.length > 0 && <View style={{ marginTop: 6 }}><Text style={s.sub}>Not it?</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {alts.map(m => <Chip key={m.item.id} label={m.item.name} onPress={() => onPickItem(m.item.id)} />)}
        {chosen && <Chip label="Just a note" onPress={() => onPickItem(null)} />}</View></View>}
    </Card>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.card },
  title: { fontSize: 18, fontWeight: '800', color: C.ink },
  inRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 14, paddingVertical: 14, fontSize: 18, color: C.ink },
  sq: { width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  hint: { fontSize: 14, color: C.sub, marginTop: 12, lineHeight: 20 }, hintDark: { fontSize: 14, color: C.ink, lineHeight: 20 },
  sec: { fontSize: 13, fontWeight: '700', color: C.sub, marginTop: 16, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  big: { minWidth: '46%', flexGrow: 1, minHeight: 58, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, marginRight: 8, marginBottom: 8, justifyContent: 'center' },
  bigT: { fontSize: 17, fontWeight: '700', color: C.ink }, bigS: { fontSize: 12, color: C.faint, marginTop: 2 },
  line: { fontSize: 20, fontWeight: '800', color: C.ink }, sub: { fontSize: 13, color: C.sub, marginTop: 4 },
  nudge: { backgroundColor: C.yellowSoft, borderRadius: 12, padding: 10, marginTop: 10 }, nudgeT: { fontSize: 14, color: C.ink },
  warn: { borderRadius: 12, padding: 10, marginTop: 10 }, warnT: { fontSize: 14, fontWeight: '700', color: C.red, marginTop: 6 },
  bar: { padding: 12, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line },
  cam: { height: 220, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 16, marginTop: 12 },
  frame: { width: '78%', height: 110, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 16 },
  flash: { position: 'absolute', bottom: 10, left: 10, right: 10, backgroundColor: 'rgba(47,125,87,0.92)', borderRadius: 10, padding: 8 }, flashT: { color: '#fff', fontWeight: '700' },
});
