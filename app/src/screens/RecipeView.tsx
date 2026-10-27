import React from 'react';
import { ToastAndroid } from 'react-native';
import { View, Text, ScrollView, Image, StyleSheet, Linking, Pressable } from 'react-native';
import type { DB, RecipeDetail } from '../types';
import { buildShopping, newId, eaters, conflictText, pantryNames, recipeConflicts, recipeCoverage, splitSteps } from '../logic';
import { C, CAT_EMOJI } from '../theme';
import { Badge, Btn, IconBtn } from '../ui';

export default function RecipeView({ r, db, update, onClose }: { r: RecipeDetail; db: DB; update: (f: (d: DB) => DB) => void; onClose: () => void }) {
  const cov = recipeCoverage(r, pantryNames(db.items), db.settings.assumeStaples);
  const steps = splitSteps(r.instructions);
  const conflicts = recipeConflicts(r, eaters(db.profiles, db.eatingIds));
  const disliked = new Set(conflicts.map(c => c.ingredient));
  const marked = db.bookmarks.some(b => b.id === r.id);
  const toShop = buildShopping([r], db.items, db.shopping, db.settings.assumeStaples);
  const onList = db.shopping.filter(i => !i.checked && i.fromRecipeId === r.id).length;
  const addShop = () => {
    update(d => ({ ...d, shopping: [...d.shopping, ...toShop.map(a => ({ ...a, id: newId() + Math.random().toString(36).slice(2, 4), checked: false, addedAt: Date.now() }))] }));
    try { ToastAndroid.show(`Added ${toShop.length} to your shopping list`, ToastAndroid.SHORT); } catch {}
  };
  const toggle = () => update(d => ({ ...d, bookmarks: marked ? d.bookmarks.filter(b => b.id !== r.id) : [r, ...d.bookmarks] }));
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 50 }}>
        <View>
          <Image source={{ uri: r.thumb || undefined }} style={s.img} />
          <View style={s.top}><IconBtn a11y="Back" label="←" onPress={onClose} />
            <IconBtn a11y={marked ? 'Remove bookmark' : 'Bookmark'} label={marked ? '★' : '☆'} textStyle={{ color: marked ? C.accent : C.ink, fontSize: 20 }} onPress={toggle} /></View>
        </View>
        <View style={{ padding: 16 }}>
          <Text style={s.h1}>{r.name}</Text>
          <Text style={s.meta}>{[CAT_EMOJI[r.category] ? `${CAT_EMOJI[r.category]} ${r.category}` : r.category, r.area].filter(Boolean).join(' · ')}</Text>
          <View style={{ flexDirection: 'row', marginTop: 10 }}>
            <Badge label={`Have ${cov.have} of ${cov.total}`} fg="#fff" bg={cov.missing ? C.accent : C.primary} />
            {cov.missing > 0 && <Badge label={`${cov.missing} missing`} fg={C.red} bg={C.redSoft} style={{ marginLeft: 6 }} />}
          </View>
          {conflicts.length > 0 && <View style={s.warn}><Text style={s.warnT}>{conflicts.some(c => c.kind === 'restriction') ? '⛔ Not safe for who is eating' : '🚫 Contains something disliked'}: {conflictText(conflicts)}</Text></View>}
          <Btn label={marked ? '★ Bookmarked' : '☆ Bookmark'} kind={marked ? 'soft' : 'primary'} onPress={toggle} style={{ marginTop: 14 }} />
          {toShop.length > 0 ? <Btn label={`🛒 Add ${toShop.length} missing to shopping list`} kind="soft" onPress={addShop} style={{ marginTop: 8 }} />
            : cov.missing > 0 && onList > 0 ? <Text style={{ color: C.sub, marginTop: 8, textAlign: 'center' }}>🛒 Missing ingredients are on your shopping list</Text> : null}

          <Text style={s.h2}>Ingredients</Text>
          {cov.marks.map((m, i) => (
            <View key={i} style={s.ing}>
              <Text style={[s.mark, { color: m.have ? C.primary : C.red }]}>{m.have ? '✓' : '✗'}</Text>
              <Text style={[s.ingT, !m.have && { color: C.ink }]}>{m.name}</Text>
              {disliked.has(m.name) && (() => { const c = conflicts.find(c => c.ingredient === m.name)!; return <Text style={s.dis}>{c.kind === 'restriction' ? '⛔' : '🚫'} {c.people.join(', ')}</Text>; })()}
              <Text style={s.measure}>{m.measure}</Text>
            </View>
          ))}
          <Text style={s.hint}>✓ = matched to something in your pantry{db.settings.assumeStaples ? ' (salt, pepper, oil, water count as basics)' : ''}.</Text>

          <Text style={s.h2}>Steps</Text>
          {steps.map((t, i) => (
            <View key={i} style={s.step}><View style={s.num}><Text style={s.numT}>{i + 1}</Text></View><Text style={s.stepT}>{t}</Text></View>
          ))}
          {(r.youtube || r.source) && <View style={{ marginTop: 10 }}>
            {r.youtube ? <Pressable onPress={() => Linking.openURL(r.youtube!)}><Text style={s.link}>▶ Watch video</Text></Pressable> : null}
            {r.source ? <Pressable onPress={() => Linking.openURL(r.source!)}><Text style={s.link}>🔗 Original recipe</Text></Pressable> : null}
          </View>}
          <Text style={s.credit}>Recipe from TheMealDB</Text>
        </View>
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  img: { width: '100%', height: 260, backgroundColor: C.graySoft },
  top: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  h1: { fontSize: 26, fontWeight: '800', color: C.ink },
  meta: { fontSize: 14, color: C.sub, marginTop: 4 },
  h2: { fontSize: 20, fontWeight: '800', color: C.ink, marginTop: 24, marginBottom: 8 },
  ing: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  mark: { width: 26, fontSize: 18, fontWeight: '900' },
  ingT: { flex: 1, fontSize: 16, color: C.sub, fontWeight: '600' },
  measure: { fontSize: 14, color: C.faint, marginLeft: 8, maxWidth: '40%', textAlign: 'right' },
  hint: { fontSize: 12, color: C.faint, marginTop: 8 },
  step: { flexDirection: 'row', marginBottom: 14 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 1 },
  numT: { color: C.primary, fontWeight: '800' },
  stepT: { flex: 1, fontSize: 16, lineHeight: 24, color: C.ink },
  link: { color: C.primary, fontWeight: '700', fontSize: 16, paddingVertical: 6 },
  warn: { backgroundColor: C.redSoft, borderRadius: 12, padding: 10, marginTop: 12 },
  warnT: { color: C.red, fontWeight: '700', fontSize: 14 },
  dis: { fontSize: 12, color: C.red, fontWeight: '700', marginLeft: 6 },
  credit: { fontSize: 12, color: C.faint, marginTop: 20 },
});
