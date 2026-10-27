// Settings card: which ingredient warnings are on (with the plain-language reason for each) plus the household's own watch words.
import React, { useState } from 'react';
import { View, Text, TextInput, Switch, StyleSheet, Pressable } from 'react-native';
import type { Settings } from '../types';
import { FLAG_RULES, flagEnabled } from '../flags';
import { C } from '../theme';
import { Btn, Card } from '../ui';

export default function FlagSettings({ settings, setS }: { settings: Settings; setS: (p: Partial<Settings>) => void }) {
  const [word, setWord] = useState('');
  const words = settings.warnIngredients || [];
  const add = () => { const w = word.trim().toLowerCase(); if (!w || words.includes(w) || words.length >= 100) { setWord(''); return; } setS({ warnIngredients: [...words, w] }); setWord(''); };
  return (
    <Card>
      <Text style={s.body}>When an item has an ingredients list, Pantry Chef flags these. Turn off what you don't care about. Each person's food restrictions (People tab) are checked against ingredients too.</Text>
      {FLAG_RULES.map(r => (
        <View key={r.id} style={s.row}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={s.name}>{r.label}</Text>
            <Text style={s.why}>{r.why}</Text>
          </View>
          <Switch value={flagEnabled(r, settings)} onValueChange={v => setS({ flagOverrides: { ...(settings.flagOverrides || {}), [r.id]: v } })} trackColor={{ true: C.primary }} accessibilityLabel={r.label} />
        </View>
      ))}
      <Text style={[s.name, { marginTop: 14 }]}>Your own watch words</Text>
      <Text style={s.why}>Anything you want to avoid, e.g. "palm oil", "carrageenan", "sucralose". Matched as whole words in ingredient lists.</Text>
      <View style={s.chips}>{words.map(w => <Pressable key={w} onPress={() => setS({ warnIngredients: words.filter(x => x !== w) })} style={s.chip} accessibilityLabel={`Remove ${w}`}><Text style={s.chipT}>{w}  ✕</Text></Pressable>)}</View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <TextInput value={word} onChangeText={setWord} onSubmitEditing={add} placeholder="Add a word or phrase" placeholderTextColor={C.faint} style={s.input} autoCapitalize="none" />
        <Btn label="Add" small kind="soft" onPress={add} disabled={!word.trim()} style={{ marginLeft: 8 }} />
      </View>
      {FLAG_RULES.some(r => settings.flagOverrides?.[r.id] != null) && <Btn label="Reset the list to defaults" kind="ghost" small onPress={() => setS({ flagOverrides: {} })} style={{ marginTop: 10, alignSelf: 'flex-start' }} />}
    </Card>
  );
}
const s = StyleSheet.create({
  body: { fontSize: 14, color: C.ink, lineHeight: 21, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line },
  name: { fontSize: 15, fontWeight: '700', color: C.ink }, why: { fontSize: 12, color: C.sub, lineHeight: 17, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  chip: { backgroundColor: C.accentSoft, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, marginBottom: 6 }, chipT: { color: C.accent, fontWeight: '700', fontSize: 13 },
  input: { flex: 1, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: C.ink },
});
