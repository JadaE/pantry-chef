// Cooking mode: ingredient checklist -> one big step per screen (swipe or Next/Back, screen kept awake, tap-to-start timers,
// optional read-aloud) -> "Used from pantry". Progress is saved, so leaving and coming back resumes at the same step.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, PanResponder, Modal, ToastAndroid } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import type { DB, RecipeDetail, CookProgress, IntakeEntry } from '../types';
import { buildShopping, eaters, newId, recipeCoverage, pantryNames, splitSteps } from '../logic';
import { mealForHour, servingsText } from '../intake';
import { applyUsed, clampStep, levelFor, LEVELS, stepSegments, usedFromPantry, UsedRow } from '../cooking';
import { startTimer } from '../timers';
import { C } from '../theme';
import { Btn, Check, IconBtn } from '../ui';
import TimerStrip from './TimerStrip';

type Props = { r: RecipeDetail; db: DB; update: (f: (d: DB) => DB) => void; onClose: () => void };
const toast = (m: string) => { try { ToastAndroid.show(m, ToastAndroid.SHORT); } catch {} };

export default function Cooking({ r, db, update, onClose }: Props) {
  const steps = useMemo(() => { const s = splitSteps(r.instructions); return s.length ? s : [r.instructions || 'No instructions were provided for this recipe.']; }, [r]);
  const cov = useMemo(() => recipeCoverage(r, pantryNames(db.items), db.settings.assumeStaples), [r.id]); // eslint-disable-line
  const saved = db.cookingProgress?.[r.id];
  const [phase, setPhase] = useState<'check' | 'steps' | 'used'>(saved?.started ? 'steps' : 'check');
  const [step, setStep] = useState(saved?.started ? clampStep(saved.step, steps.length) : 0);
  const [checked, setChecked] = useState<number[]>(saved?.checked ?? cov.marks.map((m, i) => (m.have ? i : -1)).filter(i => i >= 0));
  const [peek, setPeek] = useState(false);

  // keep the screen on for as long as cooking mode is open
  useEffect(() => { activateKeepAwakeAsync('cooking').catch(() => {}); return () => { deactivateKeepAwake('cooking').catch(() => {}); Speech.stop(); }; }, []);
  useEffect(() => { if (saved?.started) toast(`Back at step ${clampStep(saved.step, steps.length) + 1} of ${steps.length}`); }, []); // eslint-disable-line

  const save = (p: Partial<CookProgress>) => update(d => ({ ...d, cookingProgress: { ...(d.cookingProgress || {}), [r.id]: { step, started: phase !== 'check', checked, at: Date.now(), ...(d.cookingProgress?.[r.id] || {}), ...p, } } }));
  const toggleCheck = (i: number) => { const n = checked.includes(i) ? checked.filter(x => x !== i) : [...checked, i]; setChecked(n); if (saved) save({ checked: n }); };
  const start = () => { setPhase('steps'); setStep(0); save({ step: 0, started: true, checked }); };
  const goto = (n: number) => { Speech.stop(); setSpeaking(false); const c = clampStep(n, steps.length); setStep(c); save({ step: c, started: true, checked }); };
  const finish = () => { Speech.stop(); setSpeaking(false); setPhase('used'); };
  const startOver = () => { Speech.stop(); setSpeaking(false); setPeek(false); update(d => { const cp = { ...(d.cookingProgress || {}) }; delete cp[r.id]; return { ...d, cookingProgress: cp }; }); setPhase('check'); setStep(0); };
  const done = () => { update(d => { const cp = { ...(d.cookingProgress || {}) }; delete cp[r.id]; return { ...d, cookingProgress: cp }; }); onClose(); };

  // read aloud (on-device text-to-speech, no internet)
  const [speaking, setSpeaking] = useState(false);
  const speak = () => {
    if (speaking) { Speech.stop(); setSpeaking(false); return; }
    setSpeaking(true);
    try { Speech.speak(`Step ${step + 1}. ${steps[step]}`, { rate: 0.95, onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => setSpeaking(false) }); } catch { setSpeaking(false); }
  };

  // swipe left = next, swipe right = back (only for clearly horizontal drags, so vertical scrolling still works)
  const nav = useRef({ next: () => {}, back: () => {} });
  nav.current = { next: () => (step >= steps.length - 1 ? finish() : goto(step + 1)), back: () => goto(step - 1) };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onPanResponderRelease: (_e, g) => { if (g.dx < -60) nav.current.next(); else if (g.dx > 60 && nav.current) nav.current.back(); },
  }), []);

  const timers = db.timers || [];
  const missing = cov.marks.filter((m, i) => !m.have).length;
  const toShop = buildShopping([r], db.items, db.shopping, db.settings.assumeStaples);

  if (phase === 'used') return <Used r={r} db={db} update={update} onDone={done} onBack={() => setPhase('steps')} />;

  const IngredientList = ({ ticks }: { ticks: boolean }) => <View>
    {cov.marks.map((m, i) => (
      <Pressable key={i} onPress={() => ticks && toggleCheck(i)} style={s.ing} accessibilityRole={ticks ? 'checkbox' : undefined}>
        {ticks ? <Check on={checked.includes(i)} onPress={() => toggleCheck(i)} size={30} /> : <Text style={[s.mark, { color: checked.includes(i) || m.have ? C.primary : C.red }]}>{m.have ? '✓' : '✗'}</Text>}
        <Text style={[s.ingT, ticks && checked.includes(i) && { color: C.faint, textDecorationLine: 'line-through' }]}>{m.name}</Text>
        {!m.have && <Text style={s.miss}>not in pantry</Text>}
        <Text style={s.measure}>{m.measure}</Text>
      </Pressable>
    ))}
  </View>;

  if (phase === 'check') return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}><IconBtn a11y="Close" label="✕" onPress={onClose} /><Text style={s.topT} numberOfLines={1}>{r.name}</Text><View style={{ width: 38 }} /></View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <Text style={s.h1}>Get your ingredients out</Text>
        <Text style={s.sub}>Tick things off as you gather them. {steps.length} steps · the screen will stay on while you cook.</Text>
        <IngredientList ticks />
        {missing > 0 && toShop.length > 0 && <Btn kind="soft" label={`🛒 Add ${toShop.length} missing to shopping list`} style={{ marginTop: 14 }}
          onPress={() => { update(d => ({ ...d, shopping: [...d.shopping, ...toShop.map(a => ({ ...a, id: newId() + Math.random().toString(36).slice(2, 4), checked: false, addedAt: Date.now() }))] })); toast(`Added ${toShop.length} to your shopping list`); }} />}
      </ScrollView>
      <View style={s.bar}><Btn label="👩‍🍳 Start cooking" onPress={start} style={{ flex: 1, paddingVertical: 18 }} /></View>
    </View>
  );

  const text = steps[step];
  const segs = stepSegments(text);
  const times = segs.filter(x => x.time).map(x => x.time!);
  const begin = (t: { label: string; seconds: number }) => { startTimer(update, { recipeId: r.id, recipeName: r.name, step, label: t.label, seconds: t.seconds }); toast(`${t.label} timer started`); };
  const last = step >= steps.length - 1;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <IconBtn a11y="Close cooking mode (your place is saved)" label="✕" onPress={onClose} />
        <Text style={s.topT}>Step {step + 1} of {steps.length}</Text>
        <View style={{ flexDirection: 'row' }}>
          <IconBtn a11y={speaking ? 'Stop reading' : 'Read this step aloud'} label={speaking ? '⏹' : '🔊'} onPress={speak} style={{ marginRight: 8 }} />
          <IconBtn a11y="Ingredients" label="🥕" onPress={() => setPeek(true)} />
        </View>
      </View>
      <View style={s.track}><View style={[s.fill, { width: `${((step + 1) / steps.length) * 100}%` }]} /></View>
      <TimerStrip timers={timers} update={update} showRecipe />
      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 30, flexGrow: 1, justifyContent: 'center' }}>
          <Text style={s.step} selectable={false}>
            {segs.map((g, i) => g.time
              ? <Text key={i} style={s.time} onPress={() => begin(g.time!)}>{g.text}</Text>
              : <Text key={i}>{g.text}</Text>)}
          </Text>
          {times.length > 0 && <View style={{ marginTop: 22 }}>
            {times.map((t, i) => <Btn key={i} kind="soft" label={`⏱ Start ${t.label} timer`} onPress={() => begin(t)} style={{ marginBottom: 10, paddingVertical: 16 }} />)}
            <Text style={s.hint}>Timers keep running when you change steps, and ring with a notification when time is up.</Text>
          </View>}
        </ScrollView>
      </View>
      <View style={s.bar}>
        <Btn kind="ghost" label="← Back" onPress={() => goto(step - 1)} disabled={step === 0} style={{ flex: 1, paddingVertical: 18 }} />
        <Btn label={last ? 'Finish 🎉' : 'Next →'} onPress={() => nav.current.next()} style={{ flex: 2, marginLeft: 10, paddingVertical: 18 }} />
      </View>
      <Modal visible={peek} transparent animationType="slide" onRequestClose={() => setPeek(false)}>
        <Pressable style={s.scrim} onPress={() => setPeek(false)} />
        <View style={s.sheet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}><Text style={[s.h1, { flex: 1, fontSize: 20, marginBottom: 0 }]}>Ingredients</Text><IconBtn a11y="Close" label="✕" onPress={() => setPeek(false)} /></View>
          <ScrollView style={{ maxHeight: 420 }}><IngredientList ticks /></ScrollView>
          <Btn kind="ghost" small label="↺ Start over from step 1" onPress={startOver} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
        </View>
      </Modal>
    </View>
  );
}

// ---------- Used from pantry ----------
function Used({ r, db, update, onDone, onBack }: { r: RecipeDetail; db: DB; update: Props['update']; onDone: () => void; onBack: () => void }) {
  const [rows, setRows] = useState<UsedRow[]>(() => usedFromPantry(r, db.items));
  const n = rows.filter(x => x.ticked).length;
  const set = (i: number, p: Partial<UsedRow>) => setRows(rs => rs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  // "Log this meal": the selected eaters (same selection as on Recipes) share the servings eaten, split evenly. Recipes carry no nutrition data.
  const who = useMemo(() => eaters(db.profiles, db.eatingIds), []); // eslint-disable-line
  const [eaten, setEaten] = useState(Math.max(1, who.length));
  const [logged, setLogged] = useState(false);
  const logMeal = () => {
    const per = Math.round((eaten / Math.max(1, who.length)) * 100) / 100; const at = Date.now(); const meal = mealForHour(new Date().getHours());
    const es: IntakeEntry[] = (who.length ? who : [undefined]).map(p => ({ id: newId() + Math.random().toString(36).slice(2, 5), at, profileId: p?.id, recipeId: r.id, label: r.name, servings: per, amountText: servingsText(per), meal, calories: null, noNutrition: true }));
    update(d => ({ ...d, intake: [...es, ...d.intake], logPeopleIds: who.length ? who.map(p => p.id) : d.logPeopleIds })); setLogged(true);
    toast(`Logged ${r.name}${who.length > 1 ? ` for ${who.length} people` : ''}`);
  };
  const apply = () => { update(d => ({ ...d, items: applyUsed(d.items, rows) })); toast(n ? `Updated ${n} pantry item${n === 1 ? '' : 's'}` : 'Pantry unchanged'); onDone(); };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}><IconBtn a11y="Back to the steps" label="←" onPress={onBack} /><Text style={s.topT}>All done 🎉</Text><View style={{ width: 38 }} /></View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <View style={s.logCard}>
          <Text style={s.uname}>🍽 Log this meal</Text>
          <Text style={s.usub}>{who.length ? `For ${who.map(p => p.name).join(', ')}` : 'No people are selected, so it is logged without a person'} · servings are split evenly · no nutrition data for recipes</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
            <IconBtn label="−" a11y="Fewer servings eaten" onPress={() => setEaten(Math.max(0.5, eaten - 0.5))} />
            <Text style={s.logN}>{eaten}</Text>
            <IconBtn label="＋" a11y="More servings eaten" onPress={() => setEaten(eaten + 0.5)} />
            <Text style={[s.usub, { flex: 1, marginLeft: 10 }]}>servings eaten in total</Text>
            <Btn label={logged ? '✓ Logged' : 'Log it'} onPress={logMeal} disabled={logged} small />
          </View>
        </View>
        <Text style={s.h1}>Used from your pantry</Text>
        {rows.length ? <Text style={s.sub}>Ticked items are updated. Tap how much is left. Untick anything you didn't actually use.</Text>
          : <Text style={s.sub}>None of the ingredients matched something in your pantry, so there's nothing to update.</Text>}
        {rows.map((x, i) => {
          const lv = levelFor(x.newPct).key;
          return (
            <View key={x.itemId} style={[s.urow, !x.ticked && { opacity: 0.55 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Check on={x.ticked} onPress={() => set(i, { ticked: !x.ticked })} size={30} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.uname} numberOfLines={2}>{x.itemName}</Text>
                  <Text style={s.usub}>for {x.ingredient}{x.measure ? ` · ${x.measure}` : ''} · now {levelFor(x.currentPct).label.toLowerCase()}</Text>
                </View>
              </View>
              <View style={s.lv}>
                {LEVELS.map(l => (
                  <Pressable key={l.key} onPress={() => set(i, { newPct: l.pct, ticked: true })} style={[s.lvB, lv === l.key && x.ticked && s.lvOn]}>
                    <Text style={[s.lvT, lv === l.key && x.ticked && { color: '#fff' }]}>{l.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
      <View style={s.bar}>
        {rows.length ? <><Btn kind="ghost" label="Skip" onPress={onDone} style={{ flex: 1, paddingVertical: 18 }} /><Btn label={`Update pantry (${n})`} onPress={apply} style={{ flex: 2, marginLeft: 10, paddingVertical: 18 }} disabled={!n} /></>
          : <Btn label="Done" onPress={onDone} style={{ flex: 1, paddingVertical: 18 }} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line },
  topT: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: C.ink, marginHorizontal: 8 },
  track: { height: 5, backgroundColor: C.graySoft }, fill: { height: 5, backgroundColor: C.primary },
  h1: { fontSize: 24, fontWeight: '800', color: C.ink, marginBottom: 6 },
  sub: { fontSize: 15, color: C.sub, marginBottom: 14, lineHeight: 21 },
  ing: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  mark: { width: 30, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  ingT: { flex: 1, fontSize: 18, color: C.ink, fontWeight: '600', marginLeft: 12 },
  miss: { fontSize: 12, color: C.red, fontWeight: '700', marginLeft: 6 },
  measure: { fontSize: 14, color: C.faint, marginLeft: 8, maxWidth: '34%', textAlign: 'right' },
  step: { fontSize: 28, lineHeight: 40, color: C.ink, fontWeight: '500' },
  time: { color: C.primary, fontWeight: '800', textDecorationLine: 'underline' },
  hint: { fontSize: 13, color: C.faint, textAlign: 'center', marginTop: 4 },
  bar: { flexDirection: 'row', padding: 12, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 24 },
  logCard: { backgroundColor: C.accentSoft, borderRadius: 16, padding: 14, marginBottom: 16 }, logN: { fontSize: 22, fontWeight: '800', color: C.ink, minWidth: 40, textAlign: 'center' },
  urow: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 10 },
  uname: { fontSize: 17, fontWeight: '800', color: C.ink }, usub: { fontSize: 13, color: C.sub, marginTop: 2 },
  lv: { flexDirection: 'row', marginTop: 10 },
  lvB: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg, alignItems: 'center', marginRight: 6 },
  lvOn: { backgroundColor: C.primary, borderColor: C.primary }, lvT: { fontSize: 15, fontWeight: '800', color: C.ink },
});
