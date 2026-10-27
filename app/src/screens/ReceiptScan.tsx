// Receipt -> pantry: photo (camera or gallery) -> on-device ML Kit text recognition -> rule-based parser -> review.
import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { recognize, ocrAvailable } from '../../modules/receipt-ocr';
import { parseReceipt, rowsFromOcr } from '../receipt';
import { draftFromReceipt, Draft } from '../drafts';
import { receiptPhoto } from '../photos';
import { todayISO } from '../logic';
import { C } from '../theme';
import { Btn, IconBtn, Card } from '../ui';
import ImportReview from './ImportReview';

type Props = { soonDays: number; onAdd: (ds: Draft[]) => void; onClose: () => void };
export default function ReceiptScan({ soonDays, onAdd, onClose }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [showText, setShowText] = useState(false);
  const [review, setReview] = useState<{ drafts: Draft[]; sub: string } | null>(null);

  const parse = (t: string) => {
    const r = parseReceipt(t);
    const bought = r.date || todayISO();
    if (!r.items.length) { setShowText(true); Alert.alert('No items found', 'Pantry Chef could not find grocery lines in this text. Try a sharper, flatter photo, or fix the text below and tap "Find items".'); return; }
    setReview({ drafts: r.items.map(i => draftFromReceipt(i, bought)), sub: [r.store, r.date ? `bought ${r.date}` : null, `${r.items.length} lines found`].filter(Boolean).join(' · ') });
  };
  const scan = async (camera: boolean) => {
    try {
      const uri = await receiptPhoto(camera); if (!uri) return;
      setBusy('Reading the receipt…');
      const res = await recognize(uri);
      const rows = rowsFromOcr(res.lines);
      const t = rows.join('\n');
      setText(t); setBusy(null);
      parse(t);
    } catch (e: any) { setBusy(null); Alert.alert('Could not read the receipt', String(e?.message || e)); }
  };

  if (review) return <ImportReview title="Receipt items" subtitle={review.sub} drafts={review.drafts} soonDays={soonDays} onAdd={onAdd} onClose={onClose}
    onBack={() => { setReview(null); setShowText(true); }} backLabel="← Receipt text" />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}><IconBtn label="✕" a11y="Close" onPress={onClose} /><Text style={s.title}>Scan a receipt</Text><View style={{ width: 38 }} /></View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={s.h}>🧾 Add a whole shopping trip at once</Text>
          <Text style={s.p}>Take a photo of a grocery receipt. Pantry Chef reads it on your phone (no internet, no account), finds the food lines, expands abbreviations like "GV WHL MLK" → "Whole milk", and guesses a category and a typical expiration date. You check the list before anything is added.</Text>
          <Text style={s.tips}>Tips: lay it flat in good light · fill the frame with the item lines · for long receipts take two photos (top half, bottom half) and import each.</Text>
        </Card>
        {busy ? <View style={{ alignItems: 'center', padding: 30 }}><ActivityIndicator color={C.primary} size="large" /><Text style={[s.p, { marginTop: 10 }]}>{busy}</Text></View> : <>
          <Btn label="📷 Take a photo of the receipt" onPress={() => scan(true)} disabled={!ocrAvailable} />
          <Btn label="🖼️ Pick a receipt photo" kind="soft" onPress={() => scan(false)} style={{ marginTop: 10 }} disabled={!ocrAvailable} />
          {!ocrAvailable && <Text style={[s.p, { color: C.red, marginTop: 8 }]}>Text recognition isn't available in this build — you can still paste or type receipt text below.</Text>}
          <Btn label={showText ? 'Hide text' : '⌨️ Paste or type receipt text'} kind="ghost" onPress={() => setShowText(!showText)} style={{ marginTop: 10 }} />
        </>}
        {showText && !busy && <View style={{ marginTop: 14 }}>
          <Text style={s.p}>{text ? 'This is what was read from the photo. Fix anything that looks wrong, then tap Find items.' : 'One item per line, e.g. "GV WHL MLK 3.48".'}</Text>
          <TextInput value={text} onChangeText={setText} multiline style={s.box} placeholder={'GV WHL MLK 3.48\nBANANAS 1.33\n2 @ 0.98\nTOTAL 5.79'} placeholderTextColor={C.faint} autoCapitalize="characters" />
          <Btn label="Find items" onPress={() => parse(text)} disabled={!text.trim()} style={{ marginTop: 10 }} />
        </View>}
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.card },
  title: { fontSize: 18, fontWeight: '800', color: C.ink },
  h: { fontSize: 17, fontWeight: '800', color: C.ink, marginBottom: 6 },
  p: { fontSize: 14, color: C.sub, lineHeight: 20 },
  tips: { fontSize: 13, color: C.faint, lineHeight: 19, marginTop: 8 },
  box: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, minHeight: 200, textAlignVertical: 'top', fontSize: 14, fontFamily: 'monospace', color: C.ink, marginTop: 8 },
});
