import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Image, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import type { Item, NutritionFacts, Profile, Settings } from '../types';
import { CATEGORIES, UNITS, LEFT_PRESETS } from '../types';
import { addDays, addMonths, cleanQty, isValidISO, newId, todayISO, expiryLabel, expiryStatus } from '../logic';
import { C, CAT_EMOJI, statusColors } from '../theme';
import { Badge, Btn, Chip, IconBtn, Label, DatePickerModal, EstBadge } from '../ui';
import { estimateExpiry, describeDays } from '../groceries';
import { deletePhoto, pickPhoto, takePhoto } from '../photos';
import LabelScan from './LabelScan';
import NutritionPanel from './NutritionPanel';

type Props = { item: Item | null; soonDays: number; settings: Settings; profiles: Profile[]; onSave: (it: Item) => void; onDelete: (it: Item) => void; onClose: () => void };
const EXP_QUICK: { label: string; f: (t: string) => string }[] = [
  { label: '+3 days', f: t => addDays(t, 3) }, { label: '+1 week', f: t => addDays(t, 7) }, { label: '+2 weeks', f: t => addDays(t, 14) },
  { label: '+1 month', f: t => addMonths(t, 1) }, { label: '+3 months', f: t => addMonths(t, 3) }, { label: '+6 months', f: t => addMonths(t, 6) }, { label: '+1 year', f: t => addMonths(t, 12) },
];

export default function ItemEditor({ item, soonDays, settings, profiles, onSave, onDelete, onClose }: Props) {
  const today = todayISO();
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? 'Produce');
  const [qty, setQty] = useState(item?.quantity != null ? String(item.quantity) : '1');
  const [unit, setUnit] = useState(item?.unit ?? 'pcs');
  const [pct, setPct] = useState(item?.percentLeft ?? 100);
  const [pctText, setPctText] = useState(String(item?.percentLeft ?? 100));
  const [purchased, setPurchased] = useState(item ? item.purchasedOn ?? '' : today);
  const [expires, setExpiresRaw] = useState(item?.expiresOn ?? '');
  // estimated = filled from the typical shelf-life table. A date the user types/picks is never overwritten.
  const [estimated, setEstimated] = useState(!!(item?.expiresOn && item.expiryEstimated));
  const [noAuto, setNoAuto] = useState(!!item && !item.expiresOn && item.expiryEstimated === false); // user cleared it on purpose
  const [basis, setBasis] = useState<string | null>(null);
  const setExpires = (v: string) => { setExpiresRaw(v); setEstimated(false); if (!v) setNoAuto(true); };
  useEffect(() => {
    if (noAuto || (expires && !estimated)) return;
    const t = setTimeout(() => {
      const e = name.trim() ? estimateExpiry(name, category, isValidISO(purchased) ? purchased : today) : null;
      if (e) { setExpiresRaw(e.date); setEstimated(true); setBasis(`${e.basis}: ${describeDays(e.days)}`); }
      else if (estimated) { setExpiresRaw(''); setEstimated(false); setBasis(null); }
    }, 350);
    return () => clearTimeout(t);
  }, [name, category, purchased, noAuto]); // eslint-disable-line
  const [photo, setPhoto] = useState<string | null>(item?.photoUri ?? null);
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [recipeName, setRecipeName] = useState(item?.recipeName ?? '');
  const [nutrition, setNutrition] = useState<NutritionFacts | null>(item?.nutrition ?? null);
  const [ingredients, setIngredients] = useState<string | null>(item?.ingredientsText ?? null);
  const [labelOpen, setLabelOpen] = useState(false);
  const [newPhotos] = useState<string[]>([]); // photos taken in this session (cleaned up on cancel)

  const setP = (n: number) => { const v = Math.max(0, Math.min(100, Math.round(n))); setPct(v); setPctText(String(v)); };
  const addPhoto = async (cam: boolean) => {
    try { const u = cam ? await takePhoto() : await pickPhoto(); if (u) { if (photo && newPhotos.includes(photo)) deletePhoto(photo); newPhotos.push(u); setPhoto(u); } }
    catch (e: any) { Alert.alert('Photo failed', String(e?.message || e)); }
  };
  const cancel = () => { newPhotos.forEach(p => deletePhoto(p)); onClose(); };
  const save = () => {
    const n = name.trim();
    if (!n) return Alert.alert('Name needed', 'Give the item a name, like "Eggs" or "Greek yogurt".');
    if (purchased && !isValidISO(purchased)) return Alert.alert('Purchase date', 'Use the format YYYY-MM-DD, or clear it.');
    if (expires && !isValidISO(expires)) return Alert.alert('Expiration date', 'Use the format YYYY-MM-DD, or clear it.');
    newPhotos.filter(p => p !== photo).forEach(p => deletePhoto(p));
    if (item?.photoUri && item.photoUri !== photo) deletePhoto(item.photoUri);
    const now = Date.now();
    onSave({
      ...(item || {}), id: item?.id ?? newId(), name: n, category, quantity: cleanQty(qty), unit, percentLeft: pct,
      purchasedOn: purchased || null, expiresOn: expires || null, expiryEstimated: expires ? estimated : (noAuto ? false : undefined), photoUri: photo, nutrition, ingredientsText: ingredients, notes: notes.trim(), recipeName: recipeName.trim() || undefined,
      createdAt: item?.createdAt ?? now, updatedAt: now,
    } as Item);
  };
  const del = () => item && Alert.alert('Delete item?', `Remove "${item.name}" from your pantry?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { newPhotos.forEach(p => deletePhoto(p)); onDelete(item); } }]);
  const st = statusColors[expiryStatus({ expiresOn: isValidISO(expires) ? expires : null }, soonDays)];

  if (labelOpen) return <LabelScan items={[]} ctx={{ name: name.trim() || item?.name || '', barcode: item?.barcode, nutrition, ingredientsText: ingredients }}
    onDone={r => { setNutrition(r.nutrition); setIngredients(r.ingredientsText); setLabelOpen(false); }} onClose={() => setLabelOpen(false)} />;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.top}>
        <IconBtn label="✕" a11y="Close" onPress={cancel} />
        <Text style={s.title}>{item ? 'Edit item' : 'New item'}</Text>
        <Btn label="Save" small onPress={save} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={s.photoRow}>
          {photo ? <Image source={{ uri: photo }} style={s.photo} /> : <View style={[s.photo, s.photoE]}><Text style={{ fontSize: 40 }}>{CAT_EMOJI[category] || '🛒'}</Text></View>}
          <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
            <Btn label="📷 Camera" kind="soft" small onPress={() => addPhoto(true)} style={{ marginBottom: 8 }} />
            <Btn label="🖼️ Gallery" kind="soft" small onPress={() => addPhoto(false)} style={{ marginBottom: photo ? 8 : 0 }} />
            {photo && <Btn label="Remove photo" kind="ghost" small onPress={() => { if (newPhotos.includes(photo)) deletePhoto(photo); setPhoto(null); }} />}
          </View>
        </View>

        <NutritionPanel nutrition={nutrition} ingredientsText={ingredients} settings={settings} profiles={profiles} onScan={() => setLabelOpen(true)}
          onClear={() => Alert.alert('Remove nutrition?', 'Clears the nutrition values and ingredients saved on this item.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { setNutrition(null); setIngredients(null); } }])} />

        <Label>Name</Label>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. Eggs, Spinach, Rice" placeholderTextColor={C.faint} style={s.input} autoFocus={!item} autoCapitalize="words" />

        <Label>Category</Label>
        <View style={s.wrap}>{CATEGORIES.map(c => <Chip key={c} label={`${CAT_EMOJI[c]} ${c}`} on={category === c} onPress={() => setCategory(c)} />)}</View>

        <Label>Quantity</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Btn label="−" kind="ghost" small onPress={() => { const n = cleanQty(qty) ?? 0; setQty(String(Math.max(0, n - 1))); }} />
          <TextInput value={qty} onChangeText={setQty} keyboardType="decimal-pad" style={[s.input, { width: 90, marginHorizontal: 8, textAlign: 'center' }]} />
          <Btn label="+" kind="ghost" small onPress={() => { const n = cleanQty(qty) ?? 0; setQty(String(n + 1)); }} />
          <Text style={{ marginLeft: 12, color: C.sub, fontSize: 16, fontWeight: '600' }}>{unit}</Text>
        </View>
        <View style={[s.wrap, { marginTop: 8 }]}>{UNITS.map(u => <Chip key={u} label={u} on={unit === u} onPress={() => setUnit(u)} color={C.accent} />)}</View>

        <Label>Amount left</Label>
        <View style={s.wrap}>{LEFT_PRESETS.map(p => <Chip key={p.label} label={p.label} on={pct === p.pct} onPress={() => setP(p.pct)} />)}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput value={pctText} onChangeText={t => { setPctText(t); const n = Number(t); if (t !== '' && Number.isFinite(n)) setPct(Math.max(0, Math.min(100, Math.round(n)))); }} onBlur={() => setPctText(String(pct))} keyboardType="number-pad" style={[s.input, { width: 80, textAlign: 'center' }]} />
          <Text style={{ marginLeft: 8, color: C.sub }}>% left</Text>
          <View style={s.bar}><View style={[s.barFill, { width: `${pct}%` }]} /></View>
        </View>

        <Label>Purchased</Label>
        <DateField title="Purchase date" value={purchased} onChange={setPurchased} quick={[{ label: 'Today', v: today }, { label: 'Yesterday', v: addDays(today, -1) }, { label: '1 week ago', v: addDays(today, -7) }]} />

        <Label>Expires</Label>
        <DateField value={expires} onChange={setExpires} quick={EXP_QUICK.map(q => ({ label: q.label, v: q.f(today) }))} title="Expiration date" />
        {isValidISO(expires) && (estimated
          ? <View style={{ marginTop: 4 }}>
              <EstBadge label={`est. ${expiryLabel({ expiresOn: expires })}`} fg={st.fg} />
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                <Text style={[s.hint, { marginTop: 0, flexShrink: 1 }]}>Estimated from typical shelf life{basis ? ` (${basis})` : ''}. </Text>
                <Btn label="✓ Looks right" kind="soft" small onPress={() => setEstimated(false)} />
              </View>
            </View>
          : <Badge label={expiryLabel({ expiresOn: expires })} fg={st.fg} bg={st.bg} style={{ marginTop: 4 }} />)}

        <Label>Notes</Label>
        <TextInput value={notes} onChangeText={setNotes} placeholder="Where it is, brand, opened on…, anything" placeholderTextColor={C.faint} style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline />

        <Label>Recipe name (optional)</Label>
        <TextInput value={recipeName} onChangeText={setRecipeName} placeholder="Generic name for recipe matching, e.g. milk" placeholderTextColor={C.faint} style={s.input} />
        <Text style={s.hint}>Only needed when the item name is a brand or very specific (e.g. "Store brand 2%" → "milk").</Text>

        <Btn label={item ? 'Save changes' : 'Add to pantry'} onPress={save} style={{ marginTop: 24 }} />
        {item && <Btn label="Delete item" kind="ghost" onPress={del} style={{ marginTop: 10 }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function DateField({ value, onChange, quick, title }: { value: string; onChange: (s: string) => void; quick: { label: string; v: string }[]; title: string }) {
  const bad = !!value && !isValidISO(value);
  const [cal, setCal] = useState(false);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" placeholderTextColor={C.faint} keyboardType="numbers-and-punctuation" maxLength={10} style={[s.input, { flex: 1 }, bad && { borderColor: C.red }]} />
        <Btn label="📅" kind="soft" small onPress={() => setCal(true)} style={{ marginLeft: 8 }} />
        {value ? <Btn label="Clear" kind="ghost" small onPress={() => onChange('')} style={{ marginLeft: 8 }} /> : null}
      </View>
      <DatePickerModal visible={cal} value={isValidISO(value) ? value : null} title={title} onClose={() => setCal(false)} onPick={onChange} />
      {bad && <Text style={[s.hint, { color: C.red }]}>Use YYYY-MM-DD, e.g. {todayISO()}</Text>}
      <View style={[s.wrap, { marginTop: 8 }]}>{quick.map(q => <Chip key={q.label} label={q.label} on={value === q.v} onPress={() => onChange(q.v)} color={C.accent} />)}</View>
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.card },
  title: { fontSize: 18, fontWeight: '800', color: C.ink },
  photoRow: { flexDirection: 'row' },
  photo: { width: 130, height: 130, borderRadius: 18 },
  photoE: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  input: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  bar: { flex: 1, height: 10, backgroundColor: C.graySoft, borderRadius: 5, marginLeft: 14, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: C.primary },
  hint: { fontSize: 12, color: C.faint, marginTop: 4 },
});
