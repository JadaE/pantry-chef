import React from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import type { DB, RecipeDetail } from '../types';
import { eaters, conflictText, pantryNames, recipeConflicts, recipeCoverage } from '../logic';
import { C } from '../theme';
import { Badge, IconBtn } from '../ui';

export default function Saved({ db, update, onOpen }: { db: DB; update: (f: (d: DB) => DB) => void; onOpen: (r: RecipeDetail) => void }) {
  const names = pantryNames(db.items);
  return (
    <FlatList
      data={db.bookmarks}
      keyExtractor={r => r.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
      ListHeaderComponent={<View style={{ marginBottom: 12 }}><Text style={s.sub}>Recipes you starred. Saved on this phone, so they open offline too.</Text></View>}
      ListEmptyComponent={<View style={s.empty}><Text style={{ fontSize: 40 }}>☆</Text><Text style={s.sub}>Tap the star on a recipe to keep it here.</Text></View>}
      renderItem={({ item: r }) => {
        const cov = recipeCoverage(r, names, db.settings.assumeStaples);
        const cf = recipeConflicts(r, eaters(db.profiles, db.eatingIds));
        return (
          <Pressable onPress={() => onOpen(r)} style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}>
            <Image source={{ uri: r.thumb ? r.thumb + '/small' : undefined }} style={s.img} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.name} numberOfLines={2}>{r.name}</Text>
              <Text style={s.meta}>{[r.category, r.area].filter(Boolean).join(' · ')}</Text>
              <Badge label={`Have ${cov.have} of ${cov.total}`} fg={C.primary} bg={C.primarySoft} style={{ marginTop: 6 }} />
              {cf.length > 0 && <Text style={{ fontSize: 12, color: C.red, fontWeight: '700', marginTop: 4 }} numberOfLines={2}>🚫 {conflictText(cf)}</Text>}
            </View>
            <IconBtn a11y="Remove bookmark" label="★" textStyle={{ color: C.accent }} onPress={() => update(d => ({ ...d, bookmarks: d.bookmarks.filter(b => b.id !== r.id) }))} />
          </Pressable>
        );
      }}
    />
  );
}
const s = StyleSheet.create({
  h1: { fontSize: 32, fontWeight: '800', color: C.ink },
  sub: { fontSize: 14, color: C.sub, marginTop: 4, lineHeight: 20 },
  empty: { alignItems: 'center', padding: 40 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  img: { width: 72, height: 72, borderRadius: 12, backgroundColor: C.graySoft },
  name: { fontSize: 16, fontWeight: '700', color: C.ink },
  meta: { fontSize: 13, color: C.sub, marginTop: 2 },
});
