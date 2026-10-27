// Nutrition label -> pantry item: photo of the Nutrition Facts panel (and optionally the ingredients list) -> on-device ML Kit text
// recognition -> rule-based parser -> review screen with everything prefilled and editable -> saved in the same structure Open Food
// Facts barcode data uses (Item.nutrition with source 'ocr', Item.ingredientsText). Photos are read and thrown away; only text is kept.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, ActivityIndicator, Alert, Pressable } from 'react-native';
import { recognize, ocrAvailable } from '../../modules/receipt-ocr';
import { rowsFromOcr } from '../receipt';
import { receiptPhoto } from '../photos';
import { lookupBarcode } from '../off';
import { NUTRIENTS, parseLabel, parseIngredients, labelLooksUsable, fieldsFromFacts, factsFromFields, FieldVals } from '../nutrition';
import { offHasNutrition } from '../warnings';
import type { Item, NutritionFacts } from '../types';
import { C } from '../theme';
import { Btn, Card, Chip, IconBtn } from '../ui';

export type LabelCtx = { name: string; barcode?: string | null; nutrition?: NutritionFacts | null; ingredientsText?: string | null };
export type LabelResult = { nutrition: NutritionFacts | null; ingredientsText: string | null };
export type LabelTarget = { id: string } | { newName: string } | null;
type Props = { items: Item[]; ctx: LabelCtx | null; onDone: (r: LabelResult, target: LabelTarget) => void; onClose: () => void };
type Step = 'pick' | 'check' | 'start' | 'review';

export default function LabelScan({ items, ctx: ctx0, onDone, onClose }: Props) {
  const [ctx, setCtx] = useState<LabelCtx | null>(ctx0);
  const [target, setTarget] = useState<LabelTarget>(null);
  const [step, setStep] = useState<Step>(ctx0 ? 'check' : 'pick');
  const [busy, setBusy] = useState<string | null>(null);
  const [off, setOff] = useState<{ nutrition: NutritionFacts | null; ingredientsText: string | null; name: string } | null>(null);
  // review state
  const [fields, setFields] = useState<FieldVals>({});
  const [servingSize, setServingSize] = useState('');
  const [servings, setServings] = useState('');
  const [raw, setRaw] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [ingredients, setIngredients] = useState('');
  const [perContainer, setPerContainer] = useState<NutritionFacts['perContainer']>(undefined);
  const [suspect, setSuspect] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [extra, setExtra] = useState<string[]>([]); // vitamin/mineral rows the user added by hand
  const [banner, setBanner] = useState<string | null>(null);
  const [typed, setTyped] = useState(false);
  const [typedText, setTypedText] = useState('');

  // Step "check": when the item already has Open Food Facts nutrition (or a barcode that OFF knows) the label step is optional.
  useEffect(() => {
    if (step !== 'check' || !ctx) return;
    if (offHasNutrition(ctx.nutrition)) { setOff({ nutrition: ctx.nutrition!, ingredientsText: ctx.ingredientsText ?? ctx.nutrition!.ingredientsText ?? null, name: ctx.name }); return; }
    if (ctx.barcode && !ctx.nutrition) {
      let dead = false; setBusy('Checking Open Food Facts…');
      lookupBarcode(ctx.barcode).then(p => { if (dead) return; setBusy(null); if (p && offHasNutrition(p.nutrition)) setOff({ nutrition: p.nutrition, ingredientsText: p.ingredientsText, name: p.name }); else setStep('start'); })
        .catch(() => { if (!dead) { setBusy(null); setStep('start'); } });
      return () => { dead = true; };
    }
    setStep('start');
  }, [step, ctx]); // eslint-disable-line

  const pick = (it: Item | null, newName?: string) => {
    if (it) { setTarget({ id: it.id }); setCtx({ name: it.name, barcode: it.barcode, nutrition: it.nutrition, ingredientsText: it.ingredientsText }); }
    else { setTarget({ newName: newName! }); setCtx({ name: newName!, barcode: null, nutrition: null }); }
    setStep('check');
  };

  const fill = (text: string, keepIngredients: boolean) => {
    const p = parseLabel(text), n = p.nutrition;
    setRaw(text); setFields(fieldsFromFacts(n)); setServingSize(n.servingSize || ''); setServings(n.servingsPerContainer != null ? String(n.servingsPerContainer) : '');
    setPerContainer(n.perContainer); setSuspect(p.suspect); setNotes(p.notes); setExtra([]);
    const ing = parseIngredients(text); // a label photo sometimes includes the ingredients too
    if (ing && !keepIngredients) setIngredients(ing);
    setBanner(labelLooksUsable(p) ? (p.dual ? 'This label has two columns (per serving and per container). The per-serving column is shown; the whole-package numbers are kept too.' : null)
      : p.found.length ? `Only ${p.found.length} value${p.found.length === 1 ? ' was' : 's were'} read. Retake the photo (flat, well lit, panel filling the frame) or fill in the rest below.` : "Couldn't find a Nutrition Facts panel in that photo. Retake it, or type the values below.");
    setStep('review');
  };
  const readPhoto = async (camera: boolean): Promise<string | null> => {
    const uri = await receiptPhoto(camera); if (!uri) return null;
    setBusy('Reading the photo…');
    try { const res = await recognize(uri); return rowsFromOcr(res.lines).join('\n'); } finally { setBusy(null); }
  };
  const scanLabel = async (camera: boolean) => {
    try { const t = await readPhoto(camera); if (t != null) fill(t, false); }
    catch (e: any) { setBusy(null); Alert.alert('Could not read the photo', String(e?.message || e)); }
  };
  const scanIngredients = async (camera: boolean) => {
    try {
      const t = await readPhoto(camera); if (t == null) return;
      const ing = parseIngredients(t) || t.replace(/\s*\n\s*/g, ' ').trim();
      if (!ing) Alert.alert('Nothing read', 'No text found. Try a sharper, flatter photo of the ingredients list.'); else setIngredients(ing);
    } catch (e: any) { setBusy(null); Alert.alert('Could not read the photo', String(e?.message || e)); }
  };
  const edit = () => { // edit the values already saved on the item
    const n = ctx?.nutrition; if (!n) return;
    setFields(fieldsFromFacts(n)); setServingSize(n.servingSize || ''); setServings(n.servingsPerContainer != null ? String(n.servingsPerContainer) : ''); setPerContainer(n.perContainer);
    setRaw(n.rawText || ''); setIngredients(ctx?.ingredientsText ?? n.ingredientsText ?? ''); setSuspect([]); setNotes([]); setBanner(null); setExtra([]); setStep('review');
  };
  const ingredientsOnly = () => { setFields({}); setServingSize(''); setServings(''); setPerContainer(undefined); setRaw(''); setIngredients(ctx?.ingredientsText ?? ''); setSuspect([]); setNotes([]); setBanner(null); setExtra([]); setStep('review'); };

  const save = () => {
    const ing = ingredients.trim() || null;
    const nutrition = factsFromFields(fields, { servingSize, servings, rawText: raw, perContainer, ingredientsText: ing });
    if (!nutrition && !ing) return Alert.alert('Nothing to save', 'Fill in at least some values or the ingredients, or go back.');
    onDone({ nutrition, ingredientsText: ing }, target);
  };
  const setF = (key: string, part: 'amount' | 'dv', v: string) => setFields(f => ({ ...f, [key]: { amount: f[key]?.amount ?? '', dv: f[key]?.dv ?? '', [part]: v } }));

  const title = step === 'pick' ? 'Scan nutrition label' : `Nutrition label${ctx?.name ? ' · ' + ctx.name : ''}`;
  const back = step === 'review' ? () => setStep('start') : onClose;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}><IconBtn label={step === 'review' ? '←' : '✕'} a11y={step === 'review' ? 'Back' : 'Close'} onPress={back} /><Text style={s.title} numberOfLines={1}>{title}</Text>{step === 'review' ? <Btn label="Save" small onPress={save} /> : <View style={{ width: 38 }} />}</View>
      {busy && <View style={{ alignItems: 'center', padding: 40 }}><ActivityIndicator color={C.primary} size="large" /><Text style={[s.p, { marginTop: 10 }]}>{busy}</Text></View>}

      {!busy && step === 'pick' && <PickItem items={items} onPick={pick} />}

      {!busy && step === 'check' && off && (
        <ScrollView contentContainerStyle={s.pad}>
          <Card>
            <Text style={s.h}>✓ Open Food Facts already has nutrition for this</Text>
            <Text style={s.p}>{off.name ? `"${off.name}" — ` : ''}{summaryLine(off.nutrition)}. {off.ingredientsText ? 'Ingredients are included.' : 'No ingredients list came with it.'} You can skip scanning the label.</Text>
          </Card>
          <Btn label={ctx?.nutrition ? '✓ Keep it' : '✓ Use this data'} onPress={() => { if (ctx?.nutrition) onClose(); else onDone({ nutrition: off.nutrition, ingredientsText: off.ingredientsText }, target); }} />
          <Btn label="Scan the label anyway (replaces it)" kind="soft" onPress={() => setStep('start')} style={{ marginTop: 10 }} />
        </ScrollView>
      )}

      {!busy && step === 'start' && (
        <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={s.h}>🏷️ Photograph the Nutrition Facts panel</Text>
            <Text style={s.p}>Pantry Chef reads it on your phone (no internet, no account) and fills in serving size, calories, fats, sodium, carbs, sugars, protein and vitamins. You check every number before it is saved.</Text>
            <Text style={s.tips}>Tips: flat and well lit · panel fills the frame · avoid glare on shiny packaging · for a wide two-column label, hold the phone sideways.</Text>
          </Card>
          <Btn label="📷 Take a photo of the label" onPress={() => scanLabel(true)} disabled={!ocrAvailable} />
          <Btn label="🖼️ Pick a label photo" kind="soft" onPress={() => scanLabel(false)} disabled={!ocrAvailable} style={{ marginTop: 10 }} />
          {!ocrAvailable && <Text style={[s.p, { color: C.red, marginTop: 8 }]}>Text recognition isn't available in this build. You can still paste or type the label text below.</Text>}
          <Btn label={typed ? 'Hide text box' : '⌨️ Paste or type label text'} kind="ghost" onPress={() => setTyped(!typed)} style={{ marginTop: 10 }} />
          {typed && <View>
            <TextInput value={typedText} onChangeText={setTypedText} multiline style={s.box} placeholder={'Serving size 1 cup (240g)\nCalories 150\nTotal Fat 8g 10%\nSodium 160mg 7%'} placeholderTextColor={C.faint} />
            <Btn label="Read these values" onPress={() => fill(typedText, false)} disabled={!typedText.trim()} style={{ marginTop: 8 }} />
          </View>}
          <Btn label="Only photograph the ingredients" kind="ghost" onPress={ingredientsOnly} style={{ marginTop: 10 }} />
          {ctx?.nutrition && <Btn label="✏️ Edit the saved values" kind="ghost" onPress={edit} style={{ marginTop: 4 }} />}
        </ScrollView>
      )}

      {!busy && step === 'review' && (
        <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
          {banner && <View style={s.banner}><Text style={s.bannerT}>{banner}</Text><Btn label="📷 Retake photo" kind="soft" small onPress={() => scanLabel(true)} style={{ marginTop: 8, alignSelf: 'flex-start' }} /></View>}
          {notes.length > 0 && <View style={[s.banner, { backgroundColor: C.yellowSoft }]}>{notes.map((n, i) => <Text key={i} style={s.bannerT}>• {n}</Text>)}</View>}
          <Text style={s.sec}>Serving</Text>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 2 }}><Text style={s.small}>Serving size</Text><TextInput value={servingSize} onChangeText={setServingSize} placeholder="2/3 cup (55g)" placeholderTextColor={C.faint} style={s.input} /></View>
            <View style={{ flex: 1, marginLeft: 10 }}><Text style={s.small}>Servings in package</Text><TextInput value={servings} onChangeText={setServings} keyboardType="decimal-pad" placeholder="8" placeholderTextColor={C.faint} style={s.input} /></View>
          </View>
          <Text style={s.sec}>Per serving</Text>
          <View style={s.head}><Text style={[s.small, { flex: 1 }]}>Nutrient</Text><Text style={[s.small, { width: 84, textAlign: 'center' }]}>Amount</Text><Text style={[s.small, { width: 62, textAlign: 'center', marginLeft: 8 }]}>% DV</Text></View>
          {NUTRIENTS.filter(d => d.group === 'main' || fields[d.key] || extra.includes(d.key)).map(d => {
            const bad = suspect.includes(d.key);
            return (
              <View key={d.key} style={s.frow}>
                <Text style={[s.flabel, d.sub && { paddingLeft: 14, color: C.sub }, bad && { color: C.orange }]} numberOfLines={2}>{d.label}</Text>
                <TextInput value={fields[d.key]?.amount ?? ''} onChangeText={v => setF(d.key, 'amount', v)} keyboardType="decimal-pad" style={[s.num, bad && s.numBad]} accessibilityLabel={`${d.label} amount`} />
                <Text style={s.unit}>{d.unit === 'kcal' ? '' : d.unit}</Text>
                {d.key === 'calories' ? <View style={{ width: 62, marginLeft: 8 }} /> : <TextInput value={fields[d.key]?.dv ?? ''} onChangeText={v => setF(d.key, 'dv', v)} keyboardType="decimal-pad" style={[s.num, { width: 62, marginLeft: 8 }]} accessibilityLabel={`${d.label} percent daily value`} />}
              </View>
            );
          })}
          <Text style={[s.small, { marginTop: 10 }]}>Add a vitamin or mineral</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
            {NUTRIENTS.filter(d => d.group === 'micro' && !fields[d.key] && !extra.includes(d.key)).map(d => <Chip key={d.key} label={'＋ ' + d.label} onPress={() => { setExtra(e => [...e, d.key]); setF(d.key, 'amount', ''); }} color={C.accent} />)}
          </View>
          {perContainer && Object.keys(perContainer).length > 0 && <Text style={[s.small, { marginTop: 10 }]}>Whole-package column from the label is kept ({Object.keys(perContainer).length} values) and used for the hidden-servings warning.</Text>}

          <Text style={s.sec}>Ingredients (optional)</Text>
          <TextInput value={ingredients} onChangeText={setIngredients} multiline style={[s.box, { minHeight: 110 }]} placeholder="Type, paste, or photograph the ingredients list" placeholderTextColor={C.faint} />
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <Btn label="📷 Ingredients photo" kind="soft" small onPress={() => scanIngredients(true)} disabled={!ocrAvailable} />
            <Btn label="🖼️ Pick photo" kind="ghost" small onPress={() => scanIngredients(false)} disabled={!ocrAvailable} style={{ marginLeft: 8 }} />
            {!!ingredients && <Btn label="Clear" kind="ghost" small onPress={() => setIngredients('')} style={{ marginLeft: 8 }} />}
          </View>
          <Text style={s.small}>Used to check each person's restrictions and flag ingredients you want to watch.</Text>

          <Pressable onPress={() => setShowRaw(!showRaw)} style={{ marginTop: 18 }}><Text style={s.link}>{showRaw ? '▾' : '▸'} Text read from the photo</Text></Pressable>
          {showRaw && <View>
            <TextInput value={raw} onChangeText={setRaw} multiline style={s.box} placeholder="(nothing)" placeholderTextColor={C.faint} />
            <Btn label="Re-read values from this text" kind="soft" small onPress={() => fill(raw, true)} disabled={!raw.trim()} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
          </View>}
          <Btn label="Save to this item" onPress={save} style={{ marginTop: 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

function summaryLine(n: NutritionFacts | null): string {
  if (!n) return 'no values';
  const ps = n.perServing && Object.keys(n.perServing).length ? n.perServing : n.nutrients;
  const bits = [ps?.calories?.amount != null ? `${Math.round(ps.calories.amount)} cal` : null, ps?.sodium?.amount != null ? `${Math.round(ps.sodium.amount)} mg sodium` : null, ps?.protein?.amount != null ? `${Math.round(ps.protein.amount)} g protein` : null].filter(Boolean);
  return bits.length ? bits.join(', ') + (n.servingSize ? ` per ${n.servingSize}` : n.perServing ? ' per serving' : ' per 100 g') : 'nutrition values';
}

function PickItem({ items, onPick }: { items: Item[]; onPick: (it: Item | null, newName?: string) => void }) {
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const list = items.filter(i => !ql || i.name.toLowerCase().includes(ql)).slice(0, 40);
  return (
    <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.p}>Which item is this label for?</Text>
      <TextInput value={q} onChangeText={setQ} placeholder="Search your pantry, or type a new item's name" placeholderTextColor={C.faint} style={[s.input, { marginTop: 10 }]} autoCapitalize="words" />
      {!!q.trim() && <Btn label={`＋ New item "${q.trim()}"`} kind="soft" onPress={() => onPick(null, q.trim())} style={{ marginTop: 10 }} />}
      {list.map(i => (
        <Pressable key={i.id} onPress={() => onPick(i)} style={({ pressed }) => [s.pickRow, pressed && { opacity: 0.7 }]}>
          <View style={{ flex: 1 }}><Text style={s.flabel} numberOfLines={1}>{i.name}</Text><Text style={s.small}>{[i.category, i.nutrition ? 'has nutrition' : null].filter(Boolean).join(' · ')}</Text></View>
          <Text style={{ color: C.faint, fontSize: 20 }}>›</Text>
        </Pressable>
      ))}
      {!list.length && !q.trim() && <Text style={[s.p, { marginTop: 16 }]}>Your pantry is empty. Type a name above to scan a label for a new item.</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.card },
  title: { fontSize: 17, fontWeight: '800', color: C.ink, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  pad: { padding: 16, paddingBottom: 80 },
  h: { fontSize: 17, fontWeight: '800', color: C.ink, marginBottom: 6 },
  p: { fontSize: 14, color: C.sub, lineHeight: 20 },
  tips: { fontSize: 13, color: C.faint, lineHeight: 19, marginTop: 8 },
  sec: { fontSize: 13, fontWeight: '800', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 6 },
  small: { fontSize: 12, color: C.faint, marginBottom: 3 },
  link: { fontSize: 14, fontWeight: '700', color: C.primary },
  input: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.ink },
  box: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, minHeight: 140, textAlignVertical: 'top', fontSize: 14, color: C.ink, marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', paddingBottom: 2 },
  frow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: C.line },
  flabel: { flex: 1, fontSize: 15, fontWeight: '600', color: C.ink },
  num: { width: 70, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 8, paddingVertical: 7, fontSize: 15, color: C.ink, textAlign: 'right' },
  numBad: { borderColor: C.orange, backgroundColor: C.orangeSoft },
  unit: { width: 22, fontSize: 12, color: C.sub, marginLeft: 3 },
  banner: { backgroundColor: C.orangeSoft, borderRadius: 12, padding: 12, marginBottom: 10 },
  bannerT: { fontSize: 13, color: C.ink, lineHeight: 19 },
  pickRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, padding: 14, marginTop: 8, borderWidth: 1, borderColor: C.line },
});
