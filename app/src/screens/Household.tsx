import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Switch, Alert, Pressable } from 'react-native';
import type { DB, Profile, Goal, GoalNutrient, NutrientLimits } from '../types';
import { FDA_DEFAULT_LIMITS } from '../types';
import { addDislike, newProfile, RESTRICTION_RULES, ruleKey, newId, todayISO, addDays, isValidISO } from '../logic';
import { C } from '../theme';
import { Btn, Card, Chip, DatePickerModal } from '../ui';

export default function Household({ db, update }: { db: DB; update: (f: (d: DB) => DB) => void }) {
  const [newName, setNewName] = useState('');
  const setP = (id: string, f: (p: Profile) => Profile) => update(d => ({ ...d, profiles: d.profiles.map(p => (p.id === id ? f(p) : p)) }));
  const add = (guest: boolean) => {
    const n = newName.trim(); if (!n) return Alert.alert('Name needed', 'Type a name first.');
    if (db.profiles.some(p => p.name.toLowerCase() === n.toLowerCase())) return Alert.alert('Already added', `${n} is already on your list.`);
    // a new household member joins the current "Who's eating" selection; guests don't until picked
    update(d => { const p = newProfile(n, guest); return { ...d, profiles: [...d.profiles, p], eatingIds: d.eatingIds && !guest ? [...d.eatingIds, p.id] : d.eatingIds }; }); setNewName('');
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96 }} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>Household</Text>
      <Text style={s.sub}>Add the people you cook for, and guests you sometimes host. Pick who's eating on the Recipes tab; suggestions skip anything those people can't have or don't like.</Text>
      <View style={s.addRow}>
        <TextInput value={newName} onChangeText={setNewName} placeholder="Name" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} onSubmitEditing={() => add(false)} returnKeyType="done" autoCapitalize="words" />
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <Btn label="＋ Household member" small onPress={() => add(false)} style={{ flex: 1, marginRight: 8 }} />
        <Btn label="＋ Guest" kind="soft" small onPress={() => add(true)} style={{ flex: 1 }} />
      </View>
      {db.profiles.length === 0 && <Card><Text style={s.body}>No one added yet. Recipe suggestions use everything until you add people and their dislikes.</Text></Card>}
      {db.profiles.map(p => <ProfileCard key={p.id} p={p} setP={f => setP(p.id, f)} others={db.profiles.filter(x => x.id !== p.id).map(x => x.name.toLowerCase())}
        onDelete={() => Alert.alert('Remove person?', `Remove ${p.name} and their dislikes?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => update(d => ({ ...d, profiles: d.profiles.filter(x => x.id !== p.id), eatingIds: d.eatingIds ? d.eatingIds.filter(i => i !== p.id) : null })) }])} />)}
    </ScrollView>
  );
}

function ProfileCard({ p, setP, onDelete, others }: { p: Profile; setP: (f: (p: Profile) => Profile) => void; onDelete: () => void; others: string[] }) {
  const [name, setName] = useState(p.name);
  const [dis, setDis] = useState('');
  const [editing, setEditing] = useState(false);
  const commitName = () => {
    const n = name.trim();
    if (!n || others.includes(n.toLowerCase())) { setName(p.name); if (n) Alert.alert('Name taken', 'Someone in the household already has that name.'); }
    else setP(x => ({ ...x, name: n }));
    setEditing(false);
  };
  const [res, setRes] = useState('');
  const addD = () => { if (!dis.trim()) return; setP(x => ({ ...x, dislikes: addDislike(x.dislikes, dis) })); setDis(''); };
  const addR = (v: string) => { if (!v.trim()) return; setP(x => ({ ...x, restrictions: addDislike(x.restrictions, v) })); setRes(''); };
  return (
    <Card style={p.guest ? { borderColor: C.accent, borderStyle: 'dashed' } : undefined}>
      <View style={s.head}>
        {editing ? <TextInput value={name} onChangeText={setName} onBlur={commitName} onSubmitEditing={commitName} autoFocus style={[s.input, { flex: 1, fontSize: 18 }]} />
          : <Pressable style={{ flex: 1 }} onPress={() => setEditing(true)}><Text style={s.name}>{p.guest ? '🧳' : '👤'} {p.name} <Text style={s.edit}>✎ rename</Text></Text></Pressable>}
        <View style={{ alignItems: 'center', marginLeft: 8 }}>
          <Switch value={p.guest} onValueChange={v => setP(x => ({ ...x, guest: v }))} trackColor={{ true: C.accent }} />
          <Text style={s.tiny}>Guest</Text>
        </View>
      </View>
      <Text style={[s.lbl, { color: C.red }]}>Can't have (allergy / diet)</Text>
      <View style={s.wrap}>
        {p.restrictions.length === 0 && <Text style={s.tinyL}>None</Text>}
        {p.restrictions.map(d => (
          <Pressable key={d} onPress={() => setP(x => ({ ...x, restrictions: x.restrictions.filter(y => y !== d) }))} style={[s.tag, { backgroundColor: C.red }]} accessibilityLabel={`Remove ${d}`}>
            <Text style={[s.tagT, { color: '#fff' }]}>⛔ {ruleKey(d) ? RESTRICTION_RULES[ruleKey(d)!].label : d}  ✕</Text>
          </Pressable>
        ))}
      </View>
      <View style={[s.wrap, { marginTop: 4 }]}>
        {Object.keys(RESTRICTION_RULES).filter(k => !p.restrictions.some(r => ruleKey(r) === k)).map(k => (
          <Pressable key={k} onPress={() => addR(k)} style={s.sugg}><Text style={s.suggT}>+ {RESTRICTION_RULES[k].label}</Text></Pressable>
        ))}
      </View>
      <View style={s.addRow}>
        <TextInput value={res} onChangeText={setRes} placeholder="Other, e.g. mushrooms, celery" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} onSubmitEditing={() => addR(res)} returnKeyType="done" autoCapitalize="none" />
        <Btn label="Add" kind="soft" small onPress={() => addR(res)} style={{ marginLeft: 8 }} />
      </View>
      <Text style={s.lbl}>Doesn't like / don't suggest</Text>
      <View style={s.wrap}>
        {p.dislikes.length === 0 && <Text style={s.tinyL}>Nothing yet</Text>}
        {p.dislikes.map(d => (
          <Pressable key={d} onPress={() => setP(x => ({ ...x, dislikes: x.dislikes.filter(y => y !== d) }))} style={s.tag} accessibilityLabel={`Remove ${d}`}>
            <Text style={s.tagT}>{d}  ✕</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.addRow}>
        <TextInput value={dis} onChangeText={setDis} placeholder="e.g. mushrooms, olives" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} onSubmitEditing={addD} returnKeyType="done" autoCapitalize="none" />
        <Btn label="Add" kind="soft" small onPress={addD} style={{ marginLeft: 8 }} />
      </View>
      <LimitsEditor p={p} setP={setP} />
      <Btn label="Remove person" kind="ghost" small onPress={onDelete} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
    </Card>
  );
}
const LIMIT_FIELDS: { k: GoalNutrient; label: string; unit: string; fda: string }[] = [
  { k: 'addedSugarsG', label: 'Added sugars', unit: 'g', fda: 'FDA Daily Value 50 g' },
  { k: 'sodiumMg', label: 'Sodium', unit: 'mg', fda: 'FDA Daily Value 2,300 mg' },
  { k: 'totalSugarsG', label: 'Total sugars', unit: 'g', fda: 'no FDA value — your choice' },
  { k: 'saturatedFatG', label: 'Saturated fat', unit: 'g', fda: 'FDA Daily Value 20 g' },
  { k: 'caloriesKcal', label: 'Calories', unit: 'kcal', fda: 'FDA reference 2,000 kcal' },
];
const fmt = (v: number | null | undefined) => (v == null ? '' : String(v));
const numOrNull = (t: string) => { const n = Number(t.replace(',', '.')); return t.trim() === '' || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 10) / 10; };

/** Per-person daily limits (FDA defaults) and optional dated goals. Used by the Intake tab and the warnings when you log food. */
function LimitsEditor({ p, setP }: { p: Profile; setP: (f: (p: Profile) => Profile) => void }) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState<Record<string, string>>(() => Object.fromEntries(LIMIT_FIELDS.map(f => [f.k, fmt(p.limits[f.k])])));
  const [pick, setPick] = useState<{ id: string; f: 'startOn' | 'endOn' } | null>(null);
  const setLimit = (k: GoalNutrient, t: string) => { setTxt(x => ({ ...x, [k]: t })); setP(x => ({ ...x, limits: { ...x.limits, [k]: numOrNull(t) } })); };
  const setGoal = (id: string, f: (g: Goal) => Goal) => setP(x => ({ ...x, goals: x.goals.map(g => (g.id === id ? f(g) : g)) }));
  const summary = `added sugars ${p.limits.addedSugarsG ?? '–'} g · sodium ${p.limits.sodiumMg ?? '–'} mg${p.goals.filter(g => g.active).length ? ` · ${p.goals.filter(g => g.active).length} goal(s)` : ''}`;
  const goalVal = pick ? p.goals.find(g => g.id === pick.id)?.[pick.f] ?? null : null;
  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} style={{ marginTop: 12 }}>
        <Text style={[s.lbl, { marginTop: 0 }]}>{open ? '▾' : '▸'} Daily limits & goals</Text>
        {!open && <Text style={s.tinyL}>{summary}</Text>}
      </Pressable>
      {open && <View>
        <Text style={s.tinyL}>Used by the Intake tab and the warnings when you log food. A dated goal that is stricter than the limit takes over while it is active. Leave a box empty for no limit.</Text>
        {LIMIT_FIELDS.map(f => (
          <View key={f.k} style={s.limRow}>
            <View style={{ flex: 1 }}><Text style={s.limL}>{f.label}</Text><Text style={s.tiny}>{f.fda}</Text></View>
            <TextInput value={txt[f.k]} onChangeText={t => setLimit(f.k, t)} keyboardType="decimal-pad" placeholder="none" placeholderTextColor={C.faint} style={[s.input, { width: 90, textAlign: 'right' }]} />
            <Text style={[s.tiny, { width: 34, marginLeft: 6 }]}>{f.unit}</Text>
          </View>
        ))}
        <Btn label="Reset to FDA defaults" kind="ghost" small style={{ alignSelf: 'flex-start', marginTop: 4 }} onPress={() => { setP(x => ({ ...x, limits: { ...FDA_DEFAULT_LIMITS } })); setTxt(Object.fromEntries(LIMIT_FIELDS.map(f => [f.k, fmt((FDA_DEFAULT_LIMITS as NutrientLimits)[f.k])]))); }} />
        <Text style={[s.lbl, { marginTop: 14 }]}>Goals</Text>
        {p.goals.length === 0 && <Text style={s.tinyL}>Optional, e.g. "Cut added sugar to 25 g this month".</Text>}
        {p.goals.map(g => (
          <View key={g.id} style={s.goal}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput value={g.label} onChangeText={t => setGoal(g.id, x => ({ ...x, label: t }))} placeholder="Goal name" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} />
              <Switch value={g.active} onValueChange={v => setGoal(g.id, x => ({ ...x, active: v }))} trackColor={{ true: C.primary }} />
            </View>
            <View style={[s.wrap, { marginTop: 8 }]}>{LIMIT_FIELDS.map(f => <Chip key={f.k} label={f.label} on={g.nutrient === f.k} onPress={() => setGoal(g.id, x => ({ ...x, nutrient: x.nutrient === f.k ? undefined : f.k }))} />)}</View>
            {g.nutrient && <View style={s.limRow}>
              <Text style={[s.limL, { flex: 1 }]}>Daily limit while active</Text>
              <TextInput defaultValue={fmt(g.dailyLimit)} onChangeText={t => setGoal(g.id, x => ({ ...x, dailyLimit: numOrNull(t) }))} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={C.faint} style={[s.input, { width: 90, textAlign: 'right' }]} />
              <Text style={[s.tiny, { width: 34, marginLeft: 6 }]}>{LIMIT_FIELDS.find(f => f.k === g.nutrient)?.unit}</Text>
            </View>}
            <View style={[s.wrap, { marginTop: 8, alignItems: 'center' }]}>
              <Chip label={`From ${g.startOn || 'any time'}`} onPress={() => setPick({ id: g.id, f: 'startOn' })} color={C.accent} />
              <Chip label={`To ${g.endOn || 'no end'}`} onPress={() => setPick({ id: g.id, f: 'endOn' })} color={C.accent} />
              {(g.startOn || g.endOn) ? <Pressable onPress={() => setGoal(g.id, x => ({ ...x, startOn: null, endOn: null }))}><Text style={s.edit}>clear dates</Text></Pressable> : null}
            </View>
            {g.startOn && g.endOn && isValidISO(g.startOn) && isValidISO(g.endOn) && g.endOn < g.startOn ? <Text style={[s.tiny, { color: C.red }]}>End date is before the start date.</Text> : null}
            <Pressable onPress={() => setP(x => ({ ...x, goals: x.goals.filter(y => y.id !== g.id) }))}><Text style={[s.edit, { marginTop: 6 }]}>Delete goal</Text></Pressable>
          </View>
        ))}
        <Btn label="＋ Add goal" kind="soft" small style={{ alignSelf: 'flex-start', marginTop: 6 }} onPress={() => setP(x => ({ ...x, goals: [...x.goals, { id: newId(), label: '', nutrient: 'addedSugarsG', dailyLimit: null, startOn: todayISO(), endOn: addDays(todayISO(), 30), active: true }] }))} />
      </View>}
      <DatePickerModal visible={!!pick} value={goalVal} title={pick?.f === 'startOn' ? 'Goal starts' : 'Goal ends'} onClose={() => setPick(null)} onPick={iso => pick && setGoal(pick.id, x => ({ ...x, [pick.f]: iso }))} />
    </View>
  );
}

const s = StyleSheet.create({
  limRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  limL: { fontSize: 15, fontWeight: '600', color: C.ink },
  goal: { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 10, marginTop: 8, backgroundColor: C.bg },
  h1: { fontSize: 32, fontWeight: '800', color: C.ink },
  sub: { fontSize: 14, color: C.sub, marginTop: 4, lineHeight: 20 },
  body: { fontSize: 14, color: C.ink, lineHeight: 20 },
  addRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  input: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 9, fontSize: 16, color: C.ink },
  head: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 19, fontWeight: '800', color: C.ink },
  edit: { fontSize: 13, color: C.faint, fontWeight: '600' },
  tiny: { fontSize: 11, color: C.sub },
  tinyL: { fontSize: 12, color: C.faint, marginBottom: 4 },
  lbl: { fontSize: 12, fontWeight: '700', color: C.sub, marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: { backgroundColor: C.redSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, marginBottom: 6 },
  sugg: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginRight: 6, marginBottom: 6, backgroundColor: C.card },
  suggT: { fontSize: 13, color: C.sub, fontWeight: '600' },
  tagT: { color: C.red, fontWeight: '700', fontSize: 14 },
});
