import React from 'react';
import { Pressable, Text, View, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { C } from './theme';
export function Chip({ label, on, onPress, color }: { label: string; on?: boolean; onPress?: () => void; color?: string }) {
  const c = color || C.primary;
  return <Pressable onPress={onPress} style={({ pressed }) => [s.chip, on && { backgroundColor: c, borderColor: c }, pressed && { opacity: 0.7 }]} hitSlop={4}>
    <Text style={[s.chipT, on && { color: '#fff' }]}>{label}</Text></Pressable>;
}
export function Btn({ label, onPress, kind = 'primary', style, small, disabled }: { label: string; onPress?: () => void; kind?: 'primary' | 'ghost' | 'danger' | 'soft'; style?: ViewStyle; small?: boolean; disabled?: boolean }) {
  const bg = kind === 'primary' ? C.primary : kind === 'danger' ? C.red : kind === 'soft' ? C.primarySoft : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? '#fff' : C.primary;
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: bg, borderColor: kind === 'ghost' ? C.line : bg }, (pressed || disabled) && { opacity: 0.6 }, style]}>
    <Text style={[s.btnT, small && { fontSize: 14 }, { color: fg }]}>{label}</Text></Pressable>;
}
export function Badge({ label, fg, bg, style }: { label: string; fg: string; bg: string; style?: ViewStyle }) {
  return <View style={[s.badge, { backgroundColor: bg }, style]}><Text style={[s.badgeT, { color: fg }]}>{label}</Text></View>;
}
export function IconBtn({ label, onPress, style, textStyle, a11y }: { label: string; onPress: () => void; style?: ViewStyle; textStyle?: TextStyle; a11y: string }) {
  return <Pressable accessibilityLabel={a11y} onPress={onPress} hitSlop={8} style={({ pressed }) => [s.icon, pressed && { opacity: 0.6 }, style]}><Text style={[{ fontSize: 18, color: C.ink }, textStyle]}>{label}</Text></Pressable>;
}
export const Card = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => <View style={[s.card, style]}>{children}</View>;
export const Label = ({ children }: { children: React.ReactNode }) => <Text style={s.label}>{children}</Text>;
const s: any = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, marginRight: 6, marginBottom: 6 },
  chipT: { fontSize: 14, color: C.ink, fontWeight: '600' },
  btn: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  btnT: { fontSize: 16, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  badgeT: { fontSize: 12, fontWeight: '700' },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  label: { fontSize: 13, fontWeight: '700', color: C.sub, marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
});

// ---------- simple calendar date picker (pure JS, no native module) ----------
import { Modal } from 'react-native';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const p2 = (n: number) => (n < 10 ? '0' : '') + n;
export function DatePickerModal({ visible, value, onPick, onClose, title }: { visible: boolean; value: string | null; onPick: (iso: string) => void; onClose: () => void; title?: string }) {
  const init = (() => { const m = (value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();
  const [ym, setYm] = React.useState(init);
  React.useEffect(() => { if (visible) setYm(init); }, [visible]); // eslint-disable-line
  const first = new Date(ym.y, ym.m, 1).getDay(); const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const now = new Date(); const todayS = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
  const move = (k: number) => setYm(({ y, m }) => { const d = new Date(y, m + k, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.dpBack} onPress={onClose}>
        <Pressable style={s.dpBox} onPress={() => {}}>
          {title ? <Text style={s.dpTitle}>{title}</Text> : null}
          <View style={s.dpHead}>
            <IconBtn label="‹" a11y="Previous month" onPress={() => move(-1)} />
            <Pressable onPress={() => move(12)} onLongPress={() => move(-12)}><Text style={s.dpMonth}>{MONTHS[ym.m]} {ym.y}</Text></Pressable>
            <IconBtn label="›" a11y="Next month" onPress={() => move(1)} />
          </View>
          <View style={s.dpRow}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={s.dpDow}>{d}</Text>)}</View>
          {Array.from({ length: cells.length / 7 }, (_, r) => (
            <View key={r} style={s.dpRow}>{cells.slice(r * 7, r * 7 + 7).map((d, i) => {
              if (!d) return <View key={i} style={s.dpCell} />;
              const iso = `${ym.y}-${p2(ym.m + 1)}-${p2(d)}`; const sel = iso === value; const tod = iso === todayS;
              return <Pressable key={i} onPress={() => { onPick(iso); onClose(); }} style={[s.dpCell, sel && { backgroundColor: C.primary }, !sel && tod && { borderWidth: 1, borderColor: C.primary }]}>
                <Text style={[s.dpDay, sel && { color: '#fff' }]}>{d}</Text></Pressable>;
            })}</View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <Btn label="Today" kind="soft" small onPress={() => { onPick(todayS); onClose(); }} />
            <Btn label="Cancel" kind="ghost" small onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const sDp = StyleSheet.create({
  dpBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dpBox: { backgroundColor: C.card, borderRadius: 20, padding: 16, width: '100%', maxWidth: 380 },
  dpTitle: { fontSize: 16, fontWeight: '800', color: C.ink, marginBottom: 8 },
  dpHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  dpMonth: { fontSize: 17, fontWeight: '800', color: C.ink },
  dpRow: { flexDirection: 'row' },
  dpDow: { flex: 1, textAlign: 'center', color: C.faint, fontWeight: '700', paddingVertical: 4 },
  dpCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999, margin: 1 },
  dpDay: { fontSize: 15, color: C.ink, fontWeight: '600' },
});
Object.assign(s, sDp);

/** "est." badge for estimated expiration dates: dashed outline instead of a solid pill */
export function EstBadge({ label, fg }: { label: string; fg: string }) {
  return <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: fg, alignSelf: 'flex-start' }}>
    <Text style={{ fontSize: 12, fontWeight: '700', color: fg }}>{label}</Text></View>;
}
/** checkbox */
export function Check({ on, onPress, size = 26 }: { on: boolean; onPress: () => void; size?: number }) {
  return <Pressable onPress={onPress} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
    style={{ width: size, height: size, borderRadius: 7, borderWidth: 2, borderColor: on ? C.primary : C.faint, backgroundColor: on ? C.primary : C.card, alignItems: 'center', justifyContent: 'center' }}>
    {on ? <Text style={{ color: '#fff', fontWeight: '900', fontSize: size * 0.6 }}>✓</Text> : null}</Pressable>;
}
