import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, BackHandler, AppState, ActivityIndicator, ToastAndroid, Keyboard } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar, setStatusBarHidden, setStatusBarStyle } from 'expo-status-bar';
import type { DB, Item, RecipeDetail } from './src/types';
import type { Draft } from './src/drafts';
import { draftToItem, draftFromName } from './src/drafts';
import { downloadPhoto } from './src/photos';
import ReceiptScan from './src/screens/ReceiptScan';
import BarcodeScan from './src/screens/BarcodeScan';
import ImportReview from './src/screens/ImportReview';
import Shopping from './src/screens/Shopping';
import { loadDB, saveDB, flushDB } from './src/store';
import { deletePhoto } from './src/photos';
import { checkForUpdate, dismiss, dismissed, openDownload, UpdateInfo } from './src/update';
import { C } from './src/theme';
import Pantry from './src/screens/Pantry';
import ItemEditor from './src/screens/ItemEditor';
import LabelScan, { LabelResult, LabelTarget } from './src/screens/LabelScan';
import Recipes from './src/screens/Recipes';
import RecipeView from './src/screens/RecipeView';
import Cooking from './src/screens/Cooking';
import TimerStrip from './src/screens/TimerStrip';
import { initNotifications, pruneTimers } from './src/timers';
import Saved from './src/screens/Saved';
import About from './src/screens/About';
import Household from './src/screens/Household';
import Today from './src/screens/Today';
import LogFood from './src/screens/LogFood';

// v0.0.6: Saved moved to a ⭐ button on Recipes, About to an ⓘ button on Pantry (both open as full-screen pages).
type Tab = 'pantry' | 'recipes' | 'shop' | 'today' | 'people';
const TABS: { k: Tab; icon: string; label: string }[] = [
  { k: 'pantry', icon: '🧺', label: 'Pantry' }, { k: 'recipes', icon: '🍳', label: 'Recipes' }, { k: 'shop', icon: '🛒', label: 'Shopping' }, { k: 'today', icon: '📊', label: 'Intake' }, { k: 'people', icon: '👥', label: 'People' },
];
type Page = 'saved' | 'about';
const PAGE_TITLE: Record<Page, string> = { saved: '⭐ Saved recipes', about: 'About & settings' };

export default function App() {
  const [db, setDb] = useState<DB | null>(null);
  const [tab, setTab] = useState<Tab>('pantry');
  const [editing, setEditing] = useState<Item | null | 'new'>(null);
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [upd, setUpd] = useState<UpdateInfo | null>(null);
  const [bulk, setBulk] = useState<'receipt' | 'barcode' | 'label' | null>(null);
  const [cooking, setCooking] = useState(false);
  const [logging, setLogging] = useState<null | 'text' | 'scan'>(null);
  const [kb, setKb] = useState(false);
  const [shopReview, setShopReview] = useState<{ drafts: Draft[]; ids: string[] } | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  /** a screen that needs to clean up before closing (camera screens) can take over the Android back button */
  const backOverride = useRef<null | (() => void)>(null);
  // Make sure the status bar is visible with dark icons whenever we're back on the main screens (v0.0.6).
  const restoreBars = useCallback(() => { try { setStatusBarHidden(false, 'none'); setStatusBarStyle('dark'); } catch {} }, []);
  useEffect(() => { if (!bulk && !logging) restoreBars(); }, [bulk, logging, restoreBars]);
  const dbRef = useRef<DB | null>(null);

  useEffect(() => { loadDB().then(d => { dbRef.current = d; setDb(d); }); initNotifications(); }, []);
  const update = useCallback((f: (d: DB) => DB) => { const cur = dbRef.current; if (!cur) return; const n = f(cur); dbRef.current = n; setDb(n); saveDB(n); }, []);

  useEffect(() => { if (db) pruneTimers(update); }, [!!db]); // eslint-disable-line
  useEffect(() => { const a = Keyboard.addListener('keyboardDidShow', () => setKb(true)), b = Keyboard.addListener('keyboardDidHide', () => setKb(false)); return () => { a.remove(); b.remove(); }; }, []);

  // update check on launch (throttled to every 6h inside checkForUpdate) and when the app comes back to the foreground
  useEffect(() => {
    const run = async () => { const r = await checkForUpdate(false); if (r.info && r.info.versionCode > (await dismissed())) setUpd(r.info); };
    run();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') run(); else flushDB(); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (backOverride.current && (bulk || logging) && !editing) { backOverride.current(); return true; }
      if (logging) { setLogging(null); return true; }
      if (cooking) { setCooking(false); return true; }
      if (editing) { setEditing(null); return true; }
      if (bulk) { setBulk(null); return true; }
      if (shopReview) { setShopReview(null); return true; }
      if (recipe) { setRecipe(null); return true; }
      if (page) { setPage(null); return true; }
      if (tab !== 'pantry') { setTab('pantry'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [editing, recipe, tab, bulk, shopReview, cooking, logging, page]);

  if (!db) return <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={C.primary} size="large" /></View>;

  const saveItem = (it: Item) => { update(d => ({ ...d, items: d.items.some(x => x.id === it.id) ? d.items.map(x => (x.id === it.id ? it : x)) : [it, ...d.items] })); setEditing(null); };
  // bulk add from receipt / barcode / shopping review. Product images (barcode) are saved locally in the background.
  const addDrafts = (ds: Draft[], shoppingIds: string[] = []) => {
    const items = ds.map(d => draftToItem(d, null));
    update(d => ({ ...d, items: [...items, ...d.items], shopping: shoppingIds.length ? d.shopping.filter(x => !shoppingIds.includes(x.id)) : d.shopping }));
    setBulk(null); setShopReview(null); setTab('pantry');
    try { ToastAndroid.show(`Added ${items.length} item${items.length === 1 ? '' : 's'}`, ToastAndroid.SHORT); } catch {}
    ds.forEach((d, i) => { if (d.imageUrl) downloadPhoto(d.imageUrl).then(uri => { if (uri) update(db => ({ ...db, items: db.items.map(x => (x.id === items[i].id && !x.photoUri ? { ...x, photoUri: uri } : x)) })); }); });
  };
  // standalone "Scan label": attach nutrition/ingredients to the chosen pantry item, or make a new item for it
  const saveLabel = (r: LabelResult, target: LabelTarget) => {
    if (!target) return setBulk(null);
    if ('id' in target) update(d => ({ ...d, items: d.items.map(x => (x.id === target.id ? { ...x, nutrition: r.nutrition ?? x.nutrition ?? null, ingredientsText: r.ingredientsText ?? x.ingredientsText ?? null, updatedAt: Date.now() } : x)) }));
    else { const it = draftToItem(draftFromName(target.newName, 'manual', { nutrition: r.nutrition, ingredientsText: r.ingredientsText }), null); update(d => ({ ...d, items: [it, ...d.items] })); }
    setBulk(null); setTab('pantry');
    try { ToastAndroid.show('Nutrition saved', ToastAndroid.SHORT); } catch {}
  };
  const deleteItem = (it: Item) => { deletePhoto(it.photoUri); update(d => ({ ...d, items: d.items.filter(x => x.id !== it.id) })); setEditing(null); };

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" hidden={false} />
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        {upd && !editing && !recipe && (
          <View style={s.upd}>
            <Text style={s.updT}>🎉 Pantry Chef {upd.versionName} is available</Text>
            <View style={{ flexDirection: 'row' }}>
              <Pressable onPress={() => openDownload(upd)} hitSlop={6}><Text style={s.updB}>Download</Text></Pressable>
              <Pressable onPress={() => { dismiss(upd.versionCode); setUpd(null); }} hitSlop={6}><Text style={[s.updB, { color: '#d6eadf', marginLeft: 16 }]}>Later</Text></Pressable>
            </View>
          </View>
        )}
        {!!db.timers?.length && <TimerStrip timers={db.timers} update={update} showRecipe />}
        <View style={{ flex: 1 }}>
          <View style={[{ flex: 1 }, tab !== 'pantry' && s.hidden]}><Pantry db={db} onOpen={it => setEditing(it)} onAdd={() => setEditing('new')} onReceipt={() => setBulk('receipt')} onBarcode={() => setBulk('barcode')} onLabel={() => setBulk('label')} onAbout={() => setPage('about')} updateReady={!!upd} /></View>
          <View style={[{ flex: 1 }, tab !== 'recipes' && s.hidden]}><Recipes db={db} update={update} onOpen={setRecipe} active={tab === 'recipes'} onSaved={() => setPage('saved')} /></View>
          {tab === 'shop' && <Shopping db={db} update={update} onToPantry={(drafts, ids) => setShopReview({ drafts, ids })} />}
          {tab === 'today' && <Today db={db} update={update} onLog={() => setLogging('text')} />}
          {tab === 'people' && <Household db={db} update={update} />}
          {!kb && !editing && !bulk && !shopReview && !recipe && !logging && !page && (
            <Pressable onPress={() => setLogging('text')} style={({ pressed }) => [s.fab, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel="Log food">
              <Text style={s.fabT}>🍽  Log food</Text>
            </Pressable>
          )}
        </View>
        <View style={s.tabs}>
          {TABS.map(t => (
            <Pressable key={t.k} onPress={() => { setPage(null); setTab(t.k); }} style={s.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === t.k }}>
              <Text style={[s.tabI, tab === t.k && { color: C.primary }]}>{t.icon}</Text>
              <Text style={[s.tabL, tab === t.k && { color: C.primary }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        {page && <View style={StyleSheet.absoluteFill}><SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
          <View style={s.pageTop}>
            <Pressable onPress={() => setPage(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={s.pageBack}><Text style={{ fontSize: 20, color: C.ink }}>←</Text></Pressable>
            <Text style={s.pageT}>{PAGE_TITLE[page]}</Text><View style={{ width: 38 }} />
          </View>
          {page === 'saved' ? <Saved db={db} update={update} onOpen={setRecipe} /> : <About db={db} update={update} onUpdateFound={setUpd} />}
        </SafeAreaView></View>}
        {editing && <View style={StyleSheet.absoluteFill}><SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
          <ItemEditor item={editing === 'new' ? null : editing} soonDays={db.settings.soonDays} settings={db.settings} profiles={db.profiles} onSave={saveItem} onDelete={deleteItem} onClose={() => setEditing(null)} />
        </SafeAreaView></View>}
        {bulk && !editing && <View style={StyleSheet.absoluteFill}><SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
          {bulk === 'receipt' ? <ReceiptScan soonDays={db.settings.soonDays} onAdd={ds => addDrafts(ds)} onClose={() => setBulk(null)} />
            : bulk === 'label' ? <LabelScan items={db.items} ctx={null} onDone={saveLabel} onClose={() => setBulk(null)} />
            : <BarcodeScan soonDays={db.settings.soonDays} onAdd={ds => addDrafts(ds)} onClose={() => setBulk(null)} backRef={backOverride} />}
        </SafeAreaView></View>}
        {shopReview && !editing && <View style={StyleSheet.absoluteFill}><SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
          <ImportReview title="Add to pantry" subtitle="From your shopping list" drafts={shopReview.drafts} soonDays={db.settings.soonDays} onAdd={ds => addDrafts(ds, shopReview.ids)} onClose={() => setShopReview(null)} />
        </SafeAreaView></View>}
        {logging && !editing && <View style={StyleSheet.absoluteFill}><SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
          <LogFood db={db} update={update} startScan={logging === 'scan'} onClose={() => setLogging(null)} backRef={backOverride} />
        </SafeAreaView></View>}
        {recipe && !editing && <View style={StyleSheet.absoluteFill}><SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
          <RecipeView r={recipe} db={db} update={update} onClose={() => { setCooking(false); setRecipe(null); }} onCook={() => setCooking(true)} />
        </SafeAreaView></View>}
        {recipe && cooking && !editing && <View style={StyleSheet.absoluteFill}><SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
          <Cooking r={recipe} db={db} update={update} onClose={() => setCooking(false)} />
        </SafeAreaView></View>}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  hidden: { display: 'none' },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.card, paddingBottom: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabI: { fontSize: 20, color: C.faint },
  tabL: { fontSize: 10, fontWeight: '700', color: C.faint, marginTop: 2 },
  fab: { position: 'absolute', left: 16, bottom: 16, backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  fabT: { color: '#fff', fontWeight: '800', fontSize: 16 },
  pageTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.card },
  pageBack: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  pageT: { fontSize: 18, fontWeight: '800', color: C.ink },
  upd: { backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 10 },
  updT: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 4 },
  updB: { color: '#fff', fontWeight: '800', fontSize: 15, textDecorationLine: 'underline' },
});
