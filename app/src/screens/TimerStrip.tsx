import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Vibration } from 'react-native';
import type { CookTimer, DB } from '../types';
import { fmtClock, timerRemaining } from '../cooking';
import { cancelTimer } from '../timers';
import { C } from '../theme';

/** Running / finished cooking timers. Ticks once a second while any exist. */
export default function TimerStrip({ timers, update, showRecipe }: { timers: CookTimer[]; update: (f: (d: DB) => DB) => void; showRecipe?: boolean }) {
  const [now, setNow] = useState(Date.now());
  const buzzed = useRef<Set<string>>(new Set());
  useEffect(() => { if (!timers.length) return; const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, [timers.length]);
  useEffect(() => {
    for (const t of timers) if (t.endsAt <= now && !buzzed.current.has(t.id)) { buzzed.current.add(t.id); if (now - t.endsAt < 15000) Vibration.vibrate([0, 500, 250, 500, 250, 500]); }
  }, [now, timers]);
  if (!timers.length) return null;
  return (
    <View style={s.wrap}>
      {timers.map(t => {
        const left = timerRemaining(t, now), done = left <= 0;
        return (
          <View key={t.id} style={[s.row, done && s.rowDone]}>
            <Text style={[s.clock, done && { color: C.red }]}>{done ? '⏰ Done' : fmtClock(left)}</Text>
            <Text style={s.label} numberOfLines={1}>{t.label}{showRecipe ? ` · ${t.recipeName}` : ''} · step {t.step + 1}</Text>
            <Pressable onPress={() => cancelTimer(update, t)} hitSlop={10} style={s.x} accessibilityLabel={done ? 'Dismiss timer' : 'Cancel timer'}><Text style={s.xT}>{done ? 'OK' : '✕'}</Text></Pressable>
          </View>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: 12, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rowDone: { backgroundColor: C.redSoft, borderRadius: 10, paddingHorizontal: 8 },
  clock: { fontSize: 22, fontWeight: '800', color: C.primary, width: 92, fontVariant: ['tabular-nums'] },
  label: { flex: 1, fontSize: 14, color: C.sub, fontWeight: '600' },
  x: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, backgroundColor: C.graySoft, marginLeft: 8 },
  xT: { fontSize: 14, fontWeight: '800', color: C.ink },
});
