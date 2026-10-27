// Shopping list: missing ingredients from recipes (skipping what's in the pantry and staples) + manual items.
import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, Pressable, Alert } from 'react-native';
import type { DB, ShoppingItem } from '../types';
import { buildShopping, newId } from '../logic';
import { draftFromName, Draft } from '../drafts';
import { C } from '../theme';
import { Btn, Check, Chip } from '../ui';

type Props = { db: DB; update: (f: (d: DB) => DB) => void; onToPantry: (drafts: Draft[], shoppingIds: string[]) => void };
export default function Shopping({ db, update, onToPantry }: Props) {
  const [text, setText] = useState('');
  const [showDone, setShowDone] = useState(true);
  const list = db.shopping;
  const todo = list.filter(i => !i.checked), done = list.filter(i => i.checked);
  const setList = (f: (l: ShoppingItem[]) => ShoppingItem[]) => update(d => ({ ...d, shopping: f(d.shopping) }));
  const addManual = () => {
    const names = text.split(',').map(t => t.trim()).filter(Boolean); if (!names.length) return;
    setList(l => [...names.map(n => ({ id: newId() + Math.random().toString(36).slice(2, 4), name: n, checked: false, addedAt: Date.now() })), ...l]); setText('');
  };
  const fromSaved = () => {
    if (!db.bookmarks.length) return Alert.alert('No saved recipes', 'Tap ☆ on a recipe to save it, or open a recipe and use "Add missing to shopping list".');
    const add = buildShopping(db.bookmarks, db.items, db.shopping, db.settings.assumeStaples);
    if (!add.length) return Alert.alert('Nothing to add', 'You already have (or have listed) everything your saved recipes need.');
    setList(l => [...l, ...add.map(a => ({ ...a, id: newId() + Math.random().toString(36).slice(2, 4), checked: false, addedAt: Date.now() }))]);
  };
  const toPantry = () => {
    if (!done.length) return;
    onToPantry(done.map(i => draftFromName(cleanName(i.name), 'shopping', { raw: i.fromRecipeName ? `for ${i.fromRecipeName}` : 'shopping list' })), done.map(i => i.id));
  };
  const row = (i: ShoppingItem) => (
    <View style={[s.row, i.checked && { opacity: 0.55 }]}>
      <Check on={i.checked} onPress={() => setList(l => l.map(x => (x.id === i.id ? { ...x, checked: !x.checked } : x)))} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[s.name, i.checked && { textDecorationLine: 'line-through' }]}>{i.name}{i.measure ? <Text style={s.meas}>  {i.measure}</Text> : null}</Text>
        {i.fromRecipeName ? <Text style={s.meta} numberOfLines={1}>for {i.fromRecipeName}</Text> : null}
      </View>
      <Pressable onPress={() => setList(l => l.filter(x => x.id !== i.id))} hitSlop={10}><Text style={{ fontSize: 16, color: C.faint }}>✕</Text></Pressable>
    </View>
  );
  return (
    <FlatList
      data={todo} keyExtractor={i => i.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
      ListHeaderComponent={<View>
        <Text style={s.h1}>Shopping</Text>
        <Text style={s.sub}>{todo.length ? `${todo.length} to buy` : 'Your list is empty'}{done.length ? ` · ${done.length} in the cart` : ''}</Text>
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <TextInput value={text} onChangeText={setText} placeholder="Add items (comma separated)" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} onSubmitEditing={addManual} returnKeyType="done" />
          <Btn label="Add" small onPress={addManual} style={{ marginLeft: 8 }} disabled={!text.trim()} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
          <Chip label={`★ Missing from saved recipes (${db.bookmarks.length})`} onPress={fromSaved} color={C.accent} />
        </View>
        <Text style={s.hint}>Ingredients you already have in the pantry{db.settings.assumeStaples ? ' and staples like salt, pepper and oil' : ''} are skipped. Open any recipe to add just its missing ingredients.</Text>
      </View>}
      renderItem={({ item }) => row(item)}
      ListFooterComponent={done.length ? <View style={{ marginTop: 16 }}>
        <Pressable onPress={() => setShowDone(!showDone)}><Text style={s.sec}>{showDone ? '▾' : '▸'} In the cart ({done.length})</Text></Pressable>
        {showDone && done.map(i => <View key={i.id}>{row(i)}</View>)}
        <Btn label={`🧺 Bought — add ${done.length} to pantry`} onPress={toPantry} style={{ marginTop: 8 }} />
        <Btn label="Clear checked" kind="ghost" onPress={() => setList(l => l.filter(x => !x.checked))} style={{ marginTop: 8 }} />
      </View> : undefined}
    />
  );
}
/** "2 cups Flour" style manual entries keep their text; recipe ingredient names are already clean */
const cleanName = (n: string) => n.replace(/^\d+([.,/]\d+)?\s*(x\s+)?/i, '').trim() || n;
const s = StyleSheet.create({
  h1: { fontSize: 32, fontWeight: '800', color: C.ink },
  sub: { fontSize: 15, color: C.sub, marginTop: 2 },
  input: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.ink },
  hint: { fontSize: 12, color: C.faint, marginBottom: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  name: { fontSize: 16, fontWeight: '700', color: C.ink },
  meas: { fontSize: 13, fontWeight: '500', color: C.sub },
  meta: { fontSize: 12, color: C.faint, marginTop: 2 },
  sec: { fontSize: 14, fontWeight: '800', color: C.sub, marginBottom: 8 },
});
