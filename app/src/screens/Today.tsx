// Today: per person, calories + progress bars for added sugars, total sugars, sodium and saturated fat against their limits and active
// dated goals (gentle notes at 80% and 100%). Week view, and a simple total for each goal's date range / the calendar month.
// Entries: swipe left to edit or delete (or just tap). All data stays on the phone.
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Animated, PanResponder, Modal, TextInput, ToastAndroid } from 'react-native';
import type { DB, IntakeEntry, Meal, Profile } from '../types';
import { dayOf, dayTotals, fmtQty, limitsOn, MEAL_ICON, monthRange, pctOf, progressFor, Progress, rangeSummary, rescaleEntry, TRACKED, totalsFor, weekDays, whoIs, withNutritionFrom } from '../intake';
import { addDays, parseISO, todayISO } from '../logic';
import { draftFromName, draftToItem } from '../drafts';
import { C } from '../theme';
import { Btn, Card, Chip, IconBtn } from '../ui';
import LabelScan, { LabelResult } from './LabelScan';

type Props = { db: DB; update: (f: (d: DB) => DB) => void; onLog: () => void };
const toast = (m: string) => { try { ToastAndroid.show(m, ToastAndroid.SHORT); } catch {} };
const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayLabel = (iso: string) => { const t = todayISO(); if (iso === t) return 'Today'; if (iso === addDays(t, -1)) return 'Yesterday'; const d = parseISO(iso)!; return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`; };
const shortDay = (iso: string) => { const d = parseISO(iso)!; return `${MON[d.getMonth()]} ${d.getDate()}`; };
const num = (v: number) => (Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
const levelColor = (l: Progress['level']) => (l === 'over' ? C.red : l === 'near' ? C.orange : C.primary);
const levelSoft = (l: Progress['level']) => (l === 'over' ? C.redSoft : l === 'near' ? C.orangeSoft : C.primarySoft);

function note(p: Progress): string | null {
  if (p.pct == null) return null;
  const what = p.source === 'goal' ? `${p.label.toLowerCase()} goal (${p.goalLabel})` : `${p.label.toLowerCase()} limit`;
  if (p.level === 'over') return p.pct >= 150 ? `Well over the ${what}: ${p.pct}%.` : `Over the ${what}: ${p.pct}%.`;
  if (p.level === 'near') return `Getting close to the ${what}: ${p.pct}%.`;
  return null;
}
function Bar({ p }: { p: Progress }) {
  const n = note(p);
  return (
    <View style={{ marginTop: 12 }} accessible accessibilityLabel={`${p.label} ${num(p.amount)} ${p.unit}${p.limit ? ` of ${p.limit}, ${p.pct} percent` : ''}${n ? '. ' + n : ''}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={s.barL}>{p.label}{p.source === 'goal' ? ' · goal' : ''}</Text>
        <Text style={s.barV}>{num(p.amount)}{p.limit ? ` / ${p.limit}` : ''} {p.unit}{p.pct != null ? `  ${p.pct}%` : ''}</Text>
      </View>
      {p.limit ? <View style={s.track}><View style={[s.fill, { width: `${Math.min(100, p.pct ?? 0)}%`, backgroundColor: levelColor(p.level) }]} />
        <View style={s.tick} /></View> : <Text style={s.tiny}>no limit set</Text>}
      {n && <Text style={[s.note, { color: levelColor(p.level), backgroundColor: levelSoft(p.level) }]}>{p.level === 'over' ? '⚠️ ' : ''}{n}</Text>}
    </View>
  );
}

export default function Today({ db, update, onLog }: Props) {
  const regular = db.profiles;
  const unassigned = db.intake.some(e => !e.profileId || !db.profiles.some(p => p.id === e.profileId));
  const [pid, setPid] = useState<string | null>(() => (db.logPeopleIds || []).find(id => regular.some(p => p.id === id)) ?? regular.find(p => !p.guest)?.id ?? regular[0]?.id ?? null);
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [day, setDay] = useState(todayISO());
  const [metric, setMetric] = useState('calories');
  const [edit, setEdit] = useState<IntakeEntry | null>(null);
  const [labelFor, setLabelFor] = useState<IntakeEntry | null>(null);
  const [undo, setUndo] = useState<IntakeEntry | null>(null);
  const undoTimer = useRef<any>(null);

  const person: Profile | undefined = db.profiles.find(p => p.id === pid);
  const who = useMemo(() => (pid && person ? whoIs(pid) : (e: IntakeEntry) => !e.profileId || !db.profiles.some(p => p.id === e.profileId)), [pid, person, db.profiles]);
  const base = person ?? ({ limits: { addedSugarsG: null, sodiumMg: null, totalSugarsG: null, saturatedFatG: null, caloriesKcal: null }, goals: [] } as Pick<Profile, 'limits' | 'goals'>);
  const entries = db.intake;
  const totals = dayTotals(entries, who, day);
  const prog = progressFor(base, totals, day);
  const cal = prog.find(p => p.key === 'calories')!;
  const list = entries.filter(e => who(e) && dayOf(e.at) === day).sort((a, b) => b.at - a.at);

  const remove = (e: IntakeEntry) => { update(d => ({ ...d, intake: d.intake.filter(x => x.id !== e.id) })); setUndo(e); clearTimeout(undoTimer.current); undoTimer.current = setTimeout(() => setUndo(null), 6000); setEdit(null); };
  const restore = () => { if (!undo) return; const e = undo; update(d => ({ ...d, intake: [e, ...d.intake] })); setUndo(null); };
  const save = (e: IntakeEntry) => { update(d => ({ ...d, intake: d.intake.map(x => (x.id === e.id ? e : x)) })); setEdit(null); };

  const applyLabel = (e: IntakeEntry, res: LabelResult) => {
    setLabelFor(null); if (!res.nutrition) return;
    const nutrition = res.nutrition;
    const have = e.itemId ? db.items.find(i => i.id === e.itemId) : undefined;
    let item = have ? { ...have, nutrition, ingredientsText: res.ingredientsText ?? have.ingredientsText ?? null, updatedAt: Date.now() } : draftToItem(draftFromName(e.label, 'manual', { nutrition, ingredientsText: res.ingredientsText }), null);
    update(d => ({ ...d, items: have ? d.items.map(x => (x.id === item.id ? item : x)) : [item, ...d.items], intake: d.intake.map(x => (x.id === e.id ? withNutritionFrom(x, item) : x)) }));
    toast(have ? `Saved the label for ${item.name}` : `Saved ${item.name} to your pantry with its label`);
  };
  if (labelFor) return <LabelScan items={db.items} ctx={{ name: labelFor.label, nutrition: db.items.find(i => i.id === labelFor.itemId)?.nutrition }} onDone={r => applyLabel(labelFor, r)} onClose={() => setLabelFor(null)} />;

  const nav = (k: number) => setDay(d => (view === 'month' ? (() => { const x = parseISO(d)!; return `${new Date(x.getFullYear(), x.getMonth() + k, 1).getFullYear()}-${String(new Date(x.getFullYear(), x.getMonth() + k, 1).getMonth() + 1).padStart(2, '0')}-01`; })() : addDays(d, k * (view === 'week' ? 7 : 1))));
  const title = view === 'day' ? dayLabel(day) : view === 'week' ? `${shortDay(addDays(day, -6))} – ${shortDay(day)}` : (() => { const d = parseISO(day)!; return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()]} ${d.getFullYear()}`; })();
  const isNow = view === 'month' ? day.slice(0, 7) === todayISO().slice(0, 7) : day === todayISO();

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Text style={s.h1}>Intake</Text>
        {(regular.length > 0 || unassigned) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {regular.map(p => <Chip key={p.id} label={p.name} on={pid === p.id} onPress={() => setPid(p.id)} />)}
            {(unassigned || regular.length === 0) && <Chip label="No person" on={pid == null || !person} onPress={() => setPid(null)} />}
          </View>
        )}
        {regular.length === 0 && <Text style={s.tiny}>Add people on the People tab to keep separate totals and limits.</Text>}
        <View style={s.seg}>{(['day', 'week', 'month'] as const).map(v => <Pressable key={v} onPress={() => { setView(v); }} style={[s.segB, view === v && s.segOn]}><Text style={[s.segT, view === v && { color: '#fff' }]}>{cap(v)}</Text></Pressable>)}</View>
        <View style={s.navRow}>
          <IconBtn label="‹" a11y="Earlier" onPress={() => nav(-1)} /><Pressable onPress={() => setDay(view === 'month' ? todayISO() : todayISO())}><Text style={s.navT}>{title}</Text>{!isNow && <Text style={[s.tiny, { textAlign: 'center' }]}>tap for today</Text>}</Pressable><IconBtn label="›" a11y="Later" onPress={() => nav(1)} />
        </View>

        {view === 'day' && <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}><Text style={s.big}>{totals.calories}</Text><Text style={s.bigU}> cal{cal.limit ? ` of ${cal.limit}` : ''}</Text></View>
            {cal.limit ? <View style={s.track}><View style={[s.fill, { width: `${Math.min(100, cal.pct ?? 0)}%`, backgroundColor: levelColor(cal.level) }]} /></View> : null}
            {note(cal) && <Text style={[s.note, { color: levelColor(cal.level), backgroundColor: levelSoft(cal.level) }]}>{note(cal)}</Text>}
            {prog.filter(p => p.key !== 'calories').map(p => <Bar key={p.key} p={p} />)}
            {totals.noData > 0 && <Text style={s.nodata}>{totals.noData} {totals.noData === 1 ? 'entry has' : 'entries have'} no nutrition data and {totals.noData === 1 ? "isn't" : "aren't"} counted above.</Text>}
          </Card>
          {list.length === 0 && <View style={{ alignItems: 'center', marginTop: 10 }}><Text style={s.empty}>Nothing logged {day === todayISO() ? 'today' : 'this day'} yet.</Text>{day === todayISO() && <Btn label="🍽 Log food" onPress={onLog} style={{ marginTop: 12 }} />}</View>}
          {list.map(e => <Swipe key={e.id} e={e} onOpen={() => setEdit(e)} onDelete={() => remove(e)} onLabel={() => setLabelFor(e)} />)}
          {list.length > 0 && <Text style={s.tiny}>Swipe an entry left to edit or delete it, or tap it.</Text>}
        </>}

        {view === 'week' && <WeekView db={db} who={who} base={base} day={day} metric={metric} setMetric={setMetric} onDay={d => { setDay(d); setView('day'); }} />}
        {view === 'month' && <MonthView db={db} who={who} person={person} base={base} day={day} metric={metric} setMetric={setMetric} />}
      </ScrollView>
      {undo && <View style={s.undo}><Text style={s.undoT} numberOfLines={1}>Deleted {undo.label}</Text><Pressable onPress={restore} hitSlop={8}><Text style={s.undoB}>Undo</Text></Pressable></View>}
      {edit && <EditSheet e={edit} profiles={db.profiles} onClose={() => setEdit(null)} onSave={save} onDelete={() => remove(edit)} />}
    </View>
  );
}

// ---------- week ----------
function MetricChips({ metric, setMetric }: { metric: string; setMetric: (m: string) => void }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>{TRACKED.map(t => <Chip key={t.key} label={t.label} on={metric === t.key} onPress={() => setMetric(t.key)} />)}</View>;
}
function WeekView({ db, who, base, day, metric, setMetric, onDay }: { db: DB; who: (e: IntakeEntry) => boolean; base: Pick<Profile, 'limits' | 'goals'>; day: string; metric: string; setMetric: (m: string) => void; onDay: (d: string) => void }) {
  const days = weekDays(db.intake, who, day);
  const val = (t: { calories: number; nutrients: Record<string, number> }) => (metric === 'calories' ? t.calories : t.nutrients[metric] || 0);
  const vals = days.map(d => val(d.totals)); const limits = days.map(d => limitsOn(base, d.day).find(l => l.key === metric)?.limit ?? null);
  const max = Math.max(1, ...vals, ...limits.map(l => l || 0)); const unit = TRACKED.find(t => t.key === metric)!.unit;
  const total = Math.round(vals.reduce((a, b) => a + b, 0) * 10) / 10; const logged = days.filter(d => d.totals.entries > 0).length;
  const noData = days.reduce((a, d) => a + d.totals.noData, 0);
  return (
    <View>
      <MetricChips metric={metric} setMetric={setMetric} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140 }}>
          {days.map((d, i) => {
            const lim = limits[i]; const pct = lim ? pctOf(vals[i], lim) : null; const lvl = pct == null ? 'ok' : pct >= 100 ? 'over' : pct >= 80 ? 'near' : 'ok';
            return (
              <Pressable key={d.day} onPress={() => onDay(d.day)} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 140 }} accessibilityLabel={`${dayLabel(d.day)}: ${num(vals[i])} ${unit}${pct != null ? `, ${pct} percent of limit` : ''}`}>
                <Text style={s.barTop}>{vals[i] ? num(vals[i]) : ''}</Text>
                <View style={{ width: '60%', height: Math.max(vals[i] ? 4 : 0, (vals[i] / max) * 96), backgroundColor: levelColor(lvl as any), borderRadius: 6 }} />
                {lim ? <View pointerEvents="none" style={{ position: 'absolute', left: 2, right: 2, bottom: 20 + (lim / max) * 96, height: 1.5, backgroundColor: C.faint }} /> : null}
                <Text style={[s.dow, d.day === todayISO() && { color: C.primary, fontWeight: '800' }]}>{DOW[parseISO(d.day)!.getDay()][0]}{parseISO(d.day)!.getDate()}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.tiny}>{limits.some(Boolean) ? 'Grey line = daily limit or goal. ' : 'No limit set for this one. '}Tap a day to open it.</Text>
      </Card>
      <Card>
        <Text style={s.barL}>Last 7 days · {TRACKED.find(t => t.key === metric)!.label}</Text>
        <Text style={s.big}>{num(total)} <Text style={s.bigU}>{unit}</Text></Text>
        <Text style={s.tiny}>{logged ? `${num(total / logged)} ${unit} per day on the ${logged} day${logged === 1 ? '' : 's'} you logged` : 'Nothing logged in this week yet'}{noData ? ` · ${noData} entr${noData === 1 ? 'y has' : 'ies have'} no nutrition data` : ''}</Text>
      </Card>
    </View>
  );
}

// ---------- month + goal ranges ----------
function MonthView({ db, who, person, base, day, metric, setMetric }: { db: DB; who: (e: IntakeEntry) => boolean; person?: Profile; base: Pick<Profile, 'limits' | 'goals'>; day: string; metric: string; setMetric: (m: string) => void }) {
  const mr = monthRange(day); const t = TRACKED.find(x => x.key === metric)!;
  const lim = limitsOn(base, todayISO()).find(l => l.key === metric)?.limit ?? null;
  const m = rangeSummary(db.intake, who, metric, mr.from, mr.to, lim);
  const goals = (person?.goals || []).filter(g => g.active && g.nutrient && g.dailyLimit && g.dailyLimit > 0);
  return (
    <View>
      {goals.length > 0 && <Text style={s.sec}>Goals</Text>}
      {goals.map(g => {
        const tr = TRACKED.find(x => x.limitKey === g.nutrient)!; const from = g.startOn || addDays(todayISO(), -30); const to = g.endOn || todayISO();
        const r = rangeSummary(db.intake, who, tr.key, from, to, g.dailyLimit ?? null);
        const upcoming = g.startOn && g.startOn > todayISO();
        return (
          <Card key={g.id}>
            <Text style={s.barL}>{g.label || tr.label + ' goal'}</Text>
            <Text style={s.tiny}>{tr.label} under {g.dailyLimit} {tr.unit} a day · {g.startOn ? shortDay(g.startOn) : 'any time'} – {g.endOn ? shortDay(g.endOn) : 'ongoing'}</Text>
            {upcoming ? <Text style={s.note2}>Starts {shortDay(g.startOn!)}.</Text> : <>
              <Text style={s.big}>{num(r.total)} <Text style={s.bigU}>{r.unit} so far</Text></Text>
              <Text style={s.tiny}>{r.loggedDays} of {r.days} day{r.days === 1 ? '' : 's'} logged{r.loggedDays ? ` · ${num(r.avgPerLoggedDay)} ${r.unit} per logged day` : ''}</Text>
              {r.loggedDays > 0 && <Text style={[s.note, r.daysOver ? { color: C.red, backgroundColor: C.redSoft } : { color: C.primary, backgroundColor: C.primarySoft }]}>{r.daysOver ? `Over the daily limit on ${r.daysOver} day${r.daysOver === 1 ? '' : 's'}.` : 'Under the daily limit every logged day. 🎉'}</Text>}
            </>}
          </Card>
        );
      })}
      <Text style={s.sec}>This month</Text>
      <MetricChips metric={metric} setMetric={setMetric} />
      <Card>
        <Text style={s.big}>{num(m.total)} <Text style={s.bigU}>{t.unit} in {shortDay(m.from)} – {shortDay(m.to)}</Text></Text>
        <Text style={s.tiny}>{m.loggedDays ? `${m.loggedDays} day${m.loggedDays === 1 ? '' : 's'} logged · ${num(m.avgPerLoggedDay)} ${t.unit} per logged day` : 'Nothing logged this month yet'}{m.limit && m.loggedDays ? ` · over the ${m.limit} ${t.unit} limit on ${m.daysOver} day${m.daysOver === 1 ? '' : 's'}` : ''}</Text>
      </Card>
    </View>
  );
}

// ---------- one entry, swipeable ----------
const OPEN = -156;
function Swipe({ e, onOpen, onDelete, onLabel }: { e: IntakeEntry; onOpen: () => void; onDelete: () => void; onLabel: () => void }) {
  const x = useRef(new Animated.Value(0)).current; const cur = useRef(0);
  const snap = (to: number) => { cur.current = to; Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0 }).start(); };
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderMove: (_, g) => x.setValue(Math.max(OPEN - 30, Math.min(0, cur.current + g.dx))),
    onPanResponderRelease: (_, g) => snap(cur.current + g.dx < OPEN / 2 ? OPEN : 0),
    onPanResponderTerminate: () => snap(0),
  })).current;
  const when = new Date(e.at); const hh = when.getHours() % 12 || 12; const tm = `${hh}:${String(when.getMinutes()).padStart(2, '0')} ${when.getHours() < 12 ? 'am' : 'pm'}`;
  return (
    <View style={s.swWrap}>
      <View style={s.swActs}>
        <Pressable onPress={() => { snap(0); onOpen(); }} style={[s.swB, { backgroundColor: C.primary }]} accessibilityLabel={`Edit ${e.label}`}><Text style={s.swT}>Edit</Text></Pressable>
        <Pressable onPress={onDelete} style={[s.swB, { backgroundColor: C.red }]} accessibilityLabel={`Delete ${e.label}`}><Text style={s.swT}>Delete</Text></Pressable>
      </View>
      <Animated.View {...pan.panHandlers} style={[s.swRow, { transform: [{ translateX: x }] }]}>
        <Pressable onPress={() => (cur.current ? snap(0) : onOpen())} style={{ flexDirection: 'row', alignItems: 'center' }} accessibilityHint="Opens the entry to edit">
          <Text style={{ fontSize: 22, marginRight: 10 }}>{MEAL_ICON[e.meal || 'snack']}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.eName} numberOfLines={2}>{e.label}</Text>
            <Text style={s.eSub}>{e.amountText || `${fmtQty(e.servings)} serving${e.servings === 1 ? '' : 's'}`} · {tm}{e.meal ? ` · ${cap(e.meal)}` : ''}</Text>
            {(e.noNutrition || (e.calories == null && !e.nutrients)) && <Pressable onPress={onLabel} hitSlop={6}><Text style={s.eNo}>no nutrition data · 📷 scan the label</Text></Pressable>}
          </View>
          {e.calories != null && <Text style={s.eCal}>{e.calories}<Text style={s.eUnit}> cal</Text></Text>}
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ---------- edit ----------
function EditSheet({ e, profiles, onClose, onSave, onDelete }: { e: IntakeEntry; profiles: Profile[]; onClose: () => void; onSave: (e: IntakeEntry) => void; onDelete: () => void }) {
  const [sv, setSv] = useState(e.servings); const [txt, setTxt] = useState(String(e.servings)); const [meal, setMeal] = useState<Meal>(e.meal || 'snack'); const [pid, setPid] = useState(e.profileId);
  const set = (n: number) => { const v = Math.max(0, Math.round(n * 100) / 100); setSv(v); setTxt(String(v)); };
  const preview = rescaleEntry(e, sv);
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} />
      <View style={s.sheet}>
        <Text style={s.sheetT} numberOfLines={2}>{e.label}</Text>
        <Text style={s.eSub}>Servings</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 8 }}>
          <IconBtn label="−" a11y="Fewer servings" onPress={() => set(sv - 0.5)} style={s.step} textStyle={{ fontSize: 24 }} />
          <TextInput value={txt} onChangeText={t => { setTxt(t); const n = Number(t.replace(',', '.')); if (Number.isFinite(n) && n >= 0) setSv(n); }} keyboardType="decimal-pad" style={s.stepIn} selectTextOnFocus />
          <IconBtn label="＋" a11y="More servings" onPress={() => set(sv + 0.5)} style={s.step} textStyle={{ fontSize: 24 }} />
          <Text style={[s.eCal, { marginLeft: 12 }]}>{preview.calories != null ? `${preview.calories} cal` : 'no nutrition data'}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{MEALS.map(m => <Chip key={m} label={`${MEAL_ICON[m]} ${cap(m)}`} on={meal === m} onPress={() => setMeal(m)} />)}</View>
        {profiles.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>{profiles.map(p => <Chip key={p.id} label={p.name} on={pid === p.id} onPress={() => setPid(p.id)} />)}</View>}
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <Btn kind="danger" label="Delete" onPress={onDelete} style={{ flex: 1 }} />
          <Btn label="Save" onPress={() => onSave({ ...preview, meal, profileId: pid })} style={{ flex: 2, marginLeft: 10 }} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: '800', color: C.ink },
  tiny: { fontSize: 12, color: C.faint, marginTop: 4 },
  sec: { fontSize: 13, fontWeight: '700', color: C.sub, marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  seg: { flexDirection: 'row', backgroundColor: C.graySoft, borderRadius: 12, padding: 3, marginTop: 10 },
  segB: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 }, segOn: { backgroundColor: C.primary }, segT: { fontWeight: '800', color: C.ink },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 12 }, navT: { fontSize: 17, fontWeight: '800', color: C.ink, textAlign: 'center' },
  big: { fontSize: 34, fontWeight: '800', color: C.ink }, bigU: { fontSize: 15, fontWeight: '600', color: C.sub },
  barL: { fontSize: 15, fontWeight: '700', color: C.ink }, barV: { fontSize: 13, fontWeight: '700', color: C.sub },
  track: { height: 12, backgroundColor: C.graySoft, borderRadius: 6, marginTop: 6, overflow: 'hidden' }, fill: { height: 12, borderRadius: 6 },
  tick: { position: 'absolute', left: '80%', top: 0, bottom: 0, width: 1.5, backgroundColor: 'rgba(0,0,0,0.18)' },
  note: { fontSize: 13, fontWeight: '700', marginTop: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, overflow: 'hidden' }, note2: { fontSize: 14, color: C.sub, marginTop: 6 },
  nodata: { fontSize: 13, color: C.sub, marginTop: 14, backgroundColor: C.graySoft, padding: 8, borderRadius: 10 },
  empty: { fontSize: 15, color: C.sub, marginTop: 6 },
  swWrap: { marginTop: 8, borderRadius: 16, overflow: 'hidden' },
  swActs: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 156, flexDirection: 'row' },
  swB: { flex: 1, alignItems: 'center', justifyContent: 'center' }, swT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  swRow: { backgroundColor: C.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: C.line },
  eName: { fontSize: 16, fontWeight: '700', color: C.ink }, eSub: { fontSize: 13, color: C.sub, marginTop: 2 }, eNo: { fontSize: 12, color: C.orange, fontWeight: '700', marginTop: 3 },
  eCal: { fontSize: 18, fontWeight: '800', color: C.ink }, eUnit: { fontSize: 12, fontWeight: '600', color: C.sub },
  barTop: { fontSize: 10, color: C.sub, fontWeight: '700', marginBottom: 2 }, dow: { fontSize: 11, color: C.faint, marginTop: 4, height: 14 },
  undo: { position: 'absolute', left: 16, right: 16, bottom: 82, backgroundColor: '#26332C', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  undoT: { color: '#fff', fontWeight: '600', flex: 1, marginRight: 12 }, undoB: { color: '#9be0b8', fontWeight: '800', fontSize: 15 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 24 }, sheetT: { fontSize: 20, fontWeight: '800', color: C.ink, marginBottom: 6 },
  step: { width: 46, height: 46, borderRadius: 23 }, stepIn: { width: 80, textAlign: 'center', fontSize: 22, fontWeight: '800', color: C.ink, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, marginHorizontal: 8, paddingVertical: 8 },
});
