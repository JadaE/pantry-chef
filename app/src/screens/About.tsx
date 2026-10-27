import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, Alert } from 'react-native';
import type { DB } from '../types';
import { VERSION_NAME, VERSION_CODE } from '../version';
import { checkForUpdate, openDownload, UpdateInfo } from '../update';
import { clearCaches } from '../store';
import { estimateExpiry } from '../groceries';
import { todayISO, isValidISO } from '../logic';
import { C } from '../theme';
import { Btn, Card, Chip, Label } from '../ui';

export default function About({ db, update, onUpdateFound }: { db: DB; update: (f: (d: DB) => DB) => void; onUpdateFound: (u: UpdateInfo | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [found, setFound] = useState<UpdateInfo | null>(null);
  const check = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await checkForUpdate(true);
      setFound(r.info); onUpdateFound(r.info);
      setMsg(r.info ? `Version ${r.info.versionName} is available.` : `You're up to date (latest is ${r.latest?.versionName ?? VERSION_NAME}).`);
    } catch { setMsg("Couldn't check right now. Check your internet connection and try again."); }
    finally { setBusy(false); }
  };
  const setS = (patch: Partial<DB['settings']>) => update(d => ({ ...d, settings: { ...d.settings, ...patch } }));
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={s.h1}>About</Text>
      <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
        <Text style={{ fontSize: 48 }}>🥕</Text>
        <Text style={s.app}>Pantry Chef</Text>
        <Text style={s.ver}>Version {VERSION_NAME} (build {VERSION_CODE})</Text>
        <Btn label={busy ? 'Checking…' : 'Check for updates'} onPress={check} disabled={busy} style={{ marginTop: 16, alignSelf: 'stretch' }} />
        {msg && <Text style={s.msg}>{msg}</Text>}
        {found && <>
          {found.notes ? <Text style={s.notes}>{found.notes}</Text> : null}
          <Btn label={`Download v${found.versionName}`} kind="soft" onPress={() => openDownload(found)} style={{ marginTop: 10, alignSelf: 'stretch' }} />
          <Text style={s.small}>Opens the download in your browser. Install it over this app (don't uninstall first) and your pantry stays.</Text>
        </>}
      </Card>

      <Label>Expiring soon means within</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{[2, 3, 5, 7, 10].map(n => <Chip key={n} label={`${n} days`} on={db.settings.soonDays === n} onPress={() => setS({ soonDays: n })} />)}</View>

      <Label>Recipes</Label>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 15, color: C.ink }}>Count salt, pepper, oil and water as always on hand</Text>
          <Switch value={db.settings.assumeStaples} onValueChange={v => setS({ assumeStaples: v })} trackColor={{ true: C.primary }} />
        </View>
        <Btn label="Clear recipe cache" kind="ghost" small style={{ marginTop: 12 }} onPress={async () => { const n = await clearCaches(); Alert.alert('Cache cleared', `${n} cached entries removed. Recipes reload next time you open the tab.`); }} />
      </Card>

      <Label>Expiration dates</Label>
      <Card>
        <Text style={s.body}>Items without a date can get an estimate from typical shelf life (e.g. milk 7 days, bread 5, fresh meat 2–3, canned food a year or more). Estimates show a dashed "est." badge until you confirm or change them.</Text>
        {(() => {
          const todo = db.items.filter(i => !i.expiresOn && i.expiryEstimated !== false && estimateExpiry(i.name, i.category, isValidISO(i.purchasedOn ?? '') ? i.purchasedOn! : todayISO()));
          return <Btn label={todo.length ? `Estimate missing dates (${todo.length})` : 'No items need an estimate'} kind="soft" small disabled={!todo.length} style={{ marginTop: 8, alignSelf: 'flex-start' }} onPress={() => update(d => ({ ...d, items: d.items.map(i => {
            if (i.expiresOn || i.expiryEstimated === false) return i;
            const e = estimateExpiry(i.name, i.category, isValidISO(i.purchasedOn ?? '') ? i.purchasedOn! : todayISO());
            return e ? { ...i, expiresOn: e.date, expiryEstimated: true, updatedAt: Date.now() } : i;
          }) }))} />;
        })()}
      </Card>

      <Label>Privacy</Label>
      <Card>
        <Text style={s.body}>Your pantry, photos and notes stay on this phone. No account, no ads, no tracking.</Text>
        <Text style={s.body}>The app only goes online to fetch recipe ideas from TheMealDB (free public recipe database; only ingredient names are sent), to look up scanned barcodes on Open Food Facts (free, open product database; only the barcode number is sent) and to check this app's own download page for updates.</Text>
        <Text style={s.body}>Receipt reading happens entirely on the phone (Google ML Kit text recognition, offline). Receipt photos never leave the phone.</Text>
      </Card>
      <Text style={s.small}>{db.items.length} items · {db.bookmarks.length} bookmarks · {db.shopping.length} on shopping list · data format v{db.schema}</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  h1: { fontSize: 32, fontWeight: '800', color: C.ink, marginBottom: 12 },
  app: { fontSize: 24, fontWeight: '800', color: C.ink, marginTop: 6 },
  ver: { fontSize: 15, color: C.sub, marginTop: 2 },
  msg: { fontSize: 15, color: C.ink, marginTop: 12, textAlign: 'center' },
  notes: { fontSize: 14, color: C.sub, marginTop: 8, textAlign: 'center' },
  body: { fontSize: 14, color: C.ink, lineHeight: 21, marginBottom: 8 },
  small: { fontSize: 12, color: C.faint, marginTop: 10, textAlign: 'center' },
});
