import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import type { Tier } from '@reqon/core';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import { pullRules, pushRules, DEFAULT_RULES, type Rules } from '../sync/rules';

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(10, round1(n)));

export function TiersRulesScreen({ onBack }: { onBack: () => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const [r, setR] = useState<Rules>(DEFAULT_RULES);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    pullRules().then((rules) => { setR(rules); setLoading(false); });
  }, []);

  const setThr = (k: keyof Rules['tierThresholds'], v: number) =>
    setR((s) => ({ ...s, tierThresholds: { ...s.tierThresholds, [k]: clamp(v) } }));

  const save = async () => {
    setBusy(true);
    setStatus(null);
    const res = await pushRules(r);
    setBusy(false);
    setStatus(res.ok ? { ok: true, text: 'Saved' } : { ok: false, text: res.error || 'Save failed' });
  };

  const reset = () => setR((s) => ({ ...s, tierThresholds: { ...DEFAULT_RULES.tierThresholds } }));

  if (loading) {
    return (
      <View style={[styles.wrap, styles.center]}>
        <ActivityIndicator color={c.emerald} />
      </View>
    );
  }

  const t = r.tierThresholds;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.headRow}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹ Settings</Text>
        </Pressable>
        <Pressable onPress={save} hitSlop={10} disabled={busy}>
          <Text style={styles.save}>{busy ? '…' : 'Save'}</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>Ranking & rules</Text>
      <Text style={styles.intro}>How Strong / Possible / Long shot are defined and how selective Reqon is when it adds jobs. Expected value (EV) = fit × prob ÷ 10. Synced with the server when connected.</Text>
      {status ? <Text style={[styles.status, { color: status.ok ? c.emerald : c.danger }]}>{status.text}</Text> : null}

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>STRONG — needs all three</Text>
          <Pressable onPress={reset} hitSlop={8}><Text style={styles.reset}>Reset defaults</Text></Pressable>
        </View>
        <Stepper label="Min expected value" value={t.aEv} step={0.1} onChange={(v) => setThr('aEv', v)} />
        <Stepper label="Min fit" value={t.aFit} step={0.5} onChange={(v) => setThr('aFit', v)} />
        <Stepper label="Min interview prob." value={t.aProb} step={0.5} onChange={(v) => setThr('aProb', v)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>POSSIBLE — by expected value</Text>
        <Stepper label="Min expected value" value={t.bEv} step={0.1} onChange={(v) => setThr('bEv', v)} />
        <Text style={styles.help}>Anything below Possible is a Long shot.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AUTO-ADD</Text>
        <Text style={styles.help}>Lowest match strength Reqon will add to your pipeline.</Text>
        <View style={styles.seg}>
          {([
            ['A', 'Strong only'],
            ['B', 'Strong & Possible'],
            ['C', 'Everything'],
          ] as [Tier, string][]).map(([m, label]) => (
            <Pressable key={m} style={[styles.segBtn, r.minTierToMerge === m && styles.segBtnOn]} onPress={() => setR((s) => ({ ...s, minTierToMerge: m }))}>
              <Text style={[styles.segText, r.minTierToMerge === m && styles.segTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>FOLLOW-UP REMINDER</Text>
        <Text style={styles.help}>Days of silence before an active application shows in Today's "Follow-up due".</Text>
        <Stepper label="Days" value={r.followupDays} step={1} min={0} max={120} integer onChange={(v) => setR((s) => ({ ...s, followupDays: Math.max(0, Math.min(120, Math.round(v))) }))} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI DRAFT ASSISTANT</Text>
        <Text style={styles.help}>Server feature — generates grounded cover-note / screening drafts. Applies when a server is connected.</Text>
        <View style={styles.seg}>
          {([true, false] as const).map((v) => (
            <Pressable key={String(v)} style={[styles.segBtn, r.assistEnabled === v && styles.segBtnOn]} onPress={() => setR((s) => ({ ...s, assistEnabled: v }))}>
              <Text style={[styles.segText, r.assistEnabled === v && styles.segTextOn]}>{v ? 'Enabled' : 'Disabled'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function Stepper({ label, value, onChange, step, min = 0, max = 10, integer }: { label: string; value: number; onChange: (v: number) => void; step: number; min?: number; max?: number; integer?: boolean }) {
  const { styles } = useThemedStyles(makeStyles);
  const show = integer ? String(Math.round(value)) : value.toFixed(1);
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepControls}>
        <Pressable style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - step))} hitSlop={8}>
          <Text style={styles.stepTxt}>−</Text>
        </Pressable>
        <Text style={styles.stepVal}>{show}</Text>
        <Pressable style={styles.stepBtn} onPress={() => onChange(Math.min(max, value + step))} hitSlop={8}>
          <Text style={styles.stepTxt}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.canvas },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 24, gap: 20, paddingBottom: 48 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: c.emerald },
  save: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700', color: c.emerald },
  title: { fontFamily: fonts.serif, fontSize: 26, fontWeight: '600', color: c.textHigh, marginTop: -8 },
  intro: { fontFamily: fonts.sans, fontSize: 13, color: c.muted, lineHeight: 19, marginTop: -8 },
  status: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500' },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '500', letterSpacing: 1.6, color: c.muted },
  reset: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '600', color: c.emerald },
  help: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, lineHeight: 17 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepLabel: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase, flex: 1 },
  stepControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: c.element, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontFamily: fonts.sans, fontSize: 22, color: c.emerald, lineHeight: 24 },
  stepVal: { fontFamily: fonts.serif, fontSize: 18, fontWeight: '600', color: c.textHigh, minWidth: 38, textAlign: 'center' },
  seg: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, backgroundColor: c.element, borderWidth: 1, borderColor: c.element, alignItems: 'center' },
  segBtnOn: { borderColor: alpha(c.emerald, 0.5), backgroundColor: alpha(c.emerald, 0.1) },
  segText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500', color: c.textBase },
  segTextOn: { color: c.emerald },
});
