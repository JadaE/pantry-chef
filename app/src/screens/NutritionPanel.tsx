// Item page card: nutrition summary, ingredients and the first-pass warnings. Pure display; scanning happens in LabelScan.
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { NutritionFacts, Profile, Settings } from '../types';
import { itemWarnings, servingNutrients, Warning } from '../warnings';
import { C } from '../theme';
import { Btn } from '../ui';

const LV = { high: { fg: C.red, bg: C.redSoft, icon: '⚠️' }, caution: { fg: C.orange, bg: C.orangeSoft, icon: '⚡' }, good: { fg: C.green, bg: C.greenSoft, icon: '✓' } } as const;
const SHOW: [string, string][] = [['fat', 'Fat'], ['saturatedFat', 'Sat fat'], ['sodium', 'Sodium'], ['carbs', 'Carbs'], ['sugars', 'Sugars'], ['addedSugars', 'Added sugar'], ['fiber', 'Fiber'], ['protein', 'Protein']];
const SRC: Record<string, string> = { ocr: 'from your label photo', openfoodfacts: 'from Open Food Facts', manual: 'entered by hand' };

export function WarningList({ warnings }: { warnings: Warning[] }) {
  return <View>{warnings.map(w => { const l = LV[w.level]; return (
    <View key={w.id} style={[s.warn, { backgroundColor: l.bg, borderLeftColor: l.fg }]}>
      <Text style={[s.wt, { color: l.fg }]}>{l.icon} {w.title}</Text><Text style={s.wd}>{w.detail}</Text>
    </View>); })}</View>;
}

type Props = { nutrition: NutritionFacts | null; ingredientsText: string | null; settings: Settings; profiles: Profile[]; onScan: () => void; onClear: () => void };
export default function NutritionPanel({ nutrition, ingredientsText, settings, profiles, onScan, onClear }: Props) {
  const [more, setMore] = useState(false);
  const warnings = itemWarnings({ nutrition, ingredientsText }, settings, profiles);
  const sn = nutrition ? servingNutrients(nutrition) : null;
  const cal = sn?.calories?.amount ?? nutrition?.calories ?? null;
  const has = !!(nutrition || ingredientsText);
  return (
    <View style={s.card}>
      <Text style={s.h}>🏷️ Nutrition &amp; ingredients</Text>
      {!has && <Text style={s.p}>Photograph the Nutrition Facts panel (and the ingredients) to see warnings for you and your household.</Text>}
      {nutrition && <View style={{ marginTop: 6 }}>
        <Text style={s.sub}>{[nutrition.servingSize ? `Per ${nutrition.servingSize}` : sn ? 'Per serving' : 'Per 100 g', nutrition.servingsPerContainer ? `${nutrition.servingsPerContainer} servings` : null, cal != null ? `${Math.round(cal)} calories` : null].filter(Boolean).join(' · ')}</Text>
        {sn && <View style={s.grid}>{SHOW.filter(([k]) => sn[k]?.amount != null).map(([k, label]) => <View key={k} style={s.cell}><Text style={s.cv}>{sn[k].amount}{sn[k].unit}</Text><Text style={s.cl}>{label}{sn[k].dv != null ? ` · ${sn[k].dv}%` : ''}</Text></View>)}</View>}
        <Text style={s.src}>{SRC[nutrition.source] || nutrition.source}</Text>
      </View>}
      {!!ingredientsText && <View style={{ marginTop: 8 }}>
        <Text style={s.sub}>Ingredients</Text>
        <Text style={s.p} numberOfLines={more ? undefined : 3}>{ingredientsText}</Text>
        {ingredientsText.length > 140 && <Pressable onPress={() => setMore(!more)} hitSlop={6}><Text style={s.link}>{more ? 'Show less' : 'Show more'}</Text></Pressable>}
      </View>}
      {warnings.length > 0 && <View style={{ marginTop: 10 }}><WarningList warnings={warnings} /></View>}
      {has && !warnings.length && <Text style={[s.p, { marginTop: 8 }]}>✓ Nothing flagged.</Text>}
      <View style={{ flexDirection: 'row', marginTop: 10 }}>
        <Btn label={has ? '📷 Scan / edit label' : '📷 Scan nutrition label'} kind="soft" small onPress={onScan} />
        {has && <Btn label="Remove" kind="ghost" small onPress={onClear} style={{ marginLeft: 8 }} />}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, marginTop: 16 },
  h: { fontSize: 16, fontWeight: '800', color: C.ink },
  p: { fontSize: 14, color: C.sub, lineHeight: 20 },
  sub: { fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 4 },
  src: { fontSize: 12, color: C.faint, marginTop: 6 },
  link: { fontSize: 13, fontWeight: '700', color: C.primary, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6, marginBottom: 6 },
  cv: { fontSize: 15, fontWeight: '800', color: C.ink }, cl: { fontSize: 11, color: C.sub },
  warn: { borderLeftWidth: 4, borderRadius: 10, padding: 10, marginBottom: 6 },
  wt: { fontSize: 14, fontWeight: '800' }, wd: { fontSize: 13, color: C.ink, lineHeight: 19, marginTop: 2 },
});
