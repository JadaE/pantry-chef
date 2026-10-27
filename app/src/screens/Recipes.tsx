import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import type { DB, RecipeDetail } from '../types';
import { Candidate, eaters, pantryNames, pickForCategory, recipeConflicts, recipeCoverage } from '../logic';
import { buildCandidates, recipeDetail } from '../recipes';
import { C, CAT_EMOJI } from '../theme';
import { Badge, Btn, IconBtn } from '../ui';

type Props = { db: DB; update: (f: (d: DB) => DB) => void; onOpen: (r: RecipeDetail) => void; active: boolean };

export default function Recipes({ db, update, onOpen, active }: Props) {
  const [byCat, setByCat] = useState<Record<string, Candidate[]> | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, RecipeDetail | null>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const itemsKey = useMemo(() => pantryNames(db.items).sort().join('|'), [db.items]);
  const loadedKey = useRef<string | null>(null);
  const names = useMemo(() => pantryNames(db.items), [db.items]);
  const dis = useMemo(() => new Set(db.dismissedRecipes), [db.dismissedRecipes]);
  // recipes containing an ingredient an active household member dislikes (known once their details are loaded)
  const eating = useMemo(() => eaters(db.profiles, db.eatingIds), [db.profiles, db.eatingIds]);
  const blocked = useMemo(() => {
    const b = new Set<string>(); if (!eating.some(p => p.dislikes.length || p.restrictions.length)) return b;
    for (const id in details) { const d = details[id]; if (d && recipeConflicts(d, eating).length) b.add(id); }
    return b;
  }, [details, eating]);
  const toggleEater = (id: string) => update(d => {
    const cur = eaters(d.profiles, d.eatingIds).map(p => p.id);
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    return { ...d, eatingIds: next };
  });

  const fetchDetail = useCallback(async (id: string) => {
    if (details[id] !== undefined) return details[id];
    const d = await recipeDetail(id).catch(() => null);
    setDetails(x => ({ ...x, [id]: d })); return d;
  }, [details]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { byCat: b, cats } = await buildCandidates(db.items, db.dismissedRecipes);
      setByCat(b);
      const picks = cats.map(c => ({ c, p: pickForCategory(b[c], db.categoryOffset[c] || 0) })).filter(x => x.p) as { c: string; p: Candidate }[];
      const ds = await Promise.all(picks.map(x => recipeDetail(x.p.id).catch(() => null)));
      const dm: Record<string, RecipeDetail | null> = {}; picks.forEach((x, i) => (dm[x.p.id] = ds[i]));
      setDetails(old => ({ ...old, ...dm }));
      const score = (x: { p: Candidate }) => { const d = dm[x.p.id]; const cov = d ? recipeCoverage(d, names, db.settings.assumeStaples) : null; return [x.p.hits, cov ? cov.have / Math.max(1, cov.total) : 0]; };
      setOrder(picks.sort((a, b) => { const sa = score(a), sb = score(b); return (sb[0] > 0 ? 1 : 0) - (sa[0] > 0 ? 1 : 0) || sb[1] - sa[1] || sb[0] - sa[0]; }).map(x => x.c));
      loadedKey.current = itemsKey;
    } catch (e: any) { setErr('Could not reach the recipe service. Check your internet connection and pull down to retry.'); }
    finally { setLoading(false); }
  }, [db.items, db.dismissedRecipes, db.categoryOffset, names, itemsKey, db.settings.assumeStaples]);

  useEffect(() => { if (active && !loading && loadedKey.current !== itemsKey) load(); }, [active, itemsKey]);

  const live = (cat: string) => (byCat?.[cat] || []).filter(c => !dis.has(c.id) && !blocked.has(c.id));
  const current = (cat: string) => pickForCategory(live(cat), db.categoryOffset[cat] || 0);
  // make sure details exist for cards after refresh/dismiss
  useEffect(() => { if (!byCat) return; order.forEach(c => { const p = current(c); if (p && details[p.id] === undefined) fetchDetail(p.id); }); }, [byCat, order, db.categoryOffset, db.dismissedRecipes, blocked, details]);

  const refresh = (cat: string) => update(d => ({ ...d, categoryOffset: { ...d.categoryOffset, [cat]: (d.categoryOffset[cat] || 0) + 1 } }));
  const dismissR = (id: string) => update(d => ({ ...d, dismissedRecipes: d.dismissedRecipes.includes(id) ? d.dismissedRecipes : [...d.dismissedRecipes, id] }));
  const isMarked = (id: string) => db.bookmarks.some(b => b.id === id);
  const toggleMark = (r: RecipeDetail) => update(d => ({ ...d, bookmarks: d.bookmarks.some(b => b.id === r.id) ? d.bookmarks.filter(b => b.id !== r.id) : [r, ...d.bookmarks] }));

  const cards = order.map(c => ({ cat: c, p: current(c) })).filter(x => x.p) as { cat: string; p: Candidate }[];
  const header = (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.h1}>Recipes</Text>
      <Text style={s.sub}>{db.items.length ? 'One idea per category, ranked by how many ingredients you already have.' : 'Add pantry items to get matched ideas. Meanwhile, here is one idea per category.'}</Text>
      {db.profiles.length > 0 && <View style={{ marginTop: 10 }}>
        <Text style={s.who}>Who's eating?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {db.profiles.map(p => { const on = eating.some(e => e.id === p.id); return (
            <Pressable key={p.id} onPress={() => toggleEater(p.id)} style={[s.eat, on && s.eatOn]} accessibilityState={{ selected: on }}>
              <Text style={[s.eatT, on && { color: '#fff' }]}>{on ? '✓ ' : ''}{p.guest ? '🧳 ' : ''}{p.name}</Text></Pressable>); })}
          {db.eatingIds && <Pressable onPress={() => update(d => ({ ...d, eatingIds: null }))} style={s.eat}><Text style={[s.eatT, { color: C.primary }]}>↺ Household</Text></Pressable>}
        </View>
      </View>}
      {blocked.size > 0 && <Text style={s.note}>🚫 Skipped {blocked.size} recipe{blocked.size === 1 ? '' : 's'} with something {eating.length === 1 ? eating[0].name : 'someone eating'} can't have or doesn't like.</Text>}
      {db.dismissedRecipes.length > 0 && <Pressable onPress={() => update(d => ({ ...d, dismissedRecipes: [] }))}><Text style={s.link}>Show {db.dismissedRecipes.length} hidden recipe{db.dismissedRecipes.length === 1 ? '' : 's'} again</Text></Pressable>}
    </View>
  );
  if (!byCat && loading) return <View style={s.center}><ActivityIndicator size="large" color={C.primary} /><Text style={s.sub}>Finding recipes for your pantry…</Text></View>;
  return (
    <FlatList
      data={cards}
      keyExtractor={x => x.cat}
      ListHeaderComponent={header}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[C.primary]} />}
      ListEmptyComponent={<View style={s.center}><Text style={{ fontSize: 40 }}>🍳</Text><Text style={s.sub}>{err || 'No recipes yet. Pull down to load.'}</Text>{err && <Btn label="Retry" onPress={load} style={{ marginTop: 12 }} />}</View>}
      renderItem={({ item: { cat, p } }) => {
        const d = details[p.id];
        const cov = d ? recipeCoverage(d, names, db.settings.assumeStaples) : null;
        const missing = cov ? cov.marks.filter(m => !m.have).map(m => m.name) : [];
        return (
          <Pressable onPress={() => d && onOpen(d)} style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]}>
            <Image source={{ uri: p.thumb ? p.thumb + '/small' : undefined }} style={s.img} />
            <View style={s.catTag}><Text style={s.catT}>{CAT_EMOJI[cat] || '🍽️'} {cat}</Text></View>
            <View style={s.actions}>
              <IconBtn a11y="Show another recipe in this category" label="↻" onPress={() => refresh(cat)} />
              <IconBtn a11y="Hide this recipe" label="✕" onPress={() => dismissR(p.id)} style={{ marginLeft: 8 }} />
            </View>
            <View style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <Text style={s.name} numberOfLines={2}>{p.name}</Text>
                {d && <Pressable onPress={() => toggleMark(d)} hitSlop={10} accessibilityLabel="Bookmark"><Text style={{ fontSize: 24, color: isMarked(p.id) ? C.accent : C.faint }}>{isMarked(p.id) ? '★' : '☆'}</Text></Pressable>}
              </View>
              {cov ? <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                <Badge label={`Have ${cov.have} of ${cov.total}`} fg={cov.missing === 0 ? '#fff' : C.primary} bg={cov.missing === 0 ? C.primary : C.primarySoft} />
                {missing.length > 0 && <Text style={s.miss} numberOfLines={1}>Missing: {missing.slice(0, 4).join(', ')}{missing.length > 4 ? ` +${missing.length - 4}` : ''}</Text>}
              </View> : <Text style={s.miss}>{d === null ? 'Details unavailable offline' : 'Loading ingredients…'}</Text>}
            </View>
          </Pressable>
        );
      }}
    />
  );
}
const s = StyleSheet.create({
  h1: { fontSize: 32, fontWeight: '800', color: C.ink },
  sub: { fontSize: 14, color: C.sub, marginTop: 4, lineHeight: 20, textAlign: 'left' },
  link: { color: C.primary, fontWeight: '700', marginTop: 8 },
  who: { fontSize: 12, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  eat: { borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, marginBottom: 6 },
  eatOn: { backgroundColor: C.primary, borderColor: C.primary },
  eatT: { fontWeight: '700', color: C.ink, fontSize: 14 },
  note: { fontSize: 13, color: C.red, marginTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  card: { backgroundColor: C.card, borderRadius: 20, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  img: { width: '100%', height: 170, backgroundColor: C.graySoft },
  catTag: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  catT: { fontWeight: '700', color: C.ink, fontSize: 13 },
  actions: { position: 'absolute', top: 8, right: 8, flexDirection: 'row' },
  name: { flex: 1, fontSize: 18, fontWeight: '800', color: C.ink, marginRight: 8 },
  miss: { fontSize: 13, color: C.sub, marginLeft: 8, flexShrink: 1 },
});
