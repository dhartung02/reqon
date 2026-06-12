import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { colors, alpha, fonts } from '../theme';
import { pullCriteria, pushCriteria, EMPTY_CRITERIA, type SearchCriteria } from '../sync/searchCriteria';

const linesToArr = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const fmtSalary = (n: number) => (n > 0 ? `$${n.toLocaleString('en-US')}` : '');

export function SearchCriteriaScreen({ onBack }: { onBack: () => void }) {
  const [c, setC] = useState<SearchCriteria>(EMPTY_CRITERIA);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    pullCriteria().then((crit) => { setC(crit); setLoading(false); });
  }, []);

  const save = async () => {
    setBusy(true);
    setStatus(null);
    const r = await pushCriteria(c);
    setBusy(false);
    setStatus(r.ok ? { ok: true, text: 'Saved' } : { ok: false, text: r.error || 'Save failed' });
  };

  if (loading) {
    return (
      <View style={[styles.wrap, styles.center]}>
        <ActivityIndicator color={colors.emerald} />
      </View>
    );
  }

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
      <Text style={styles.title}>Search criteria</Text>
      <Text style={styles.intro}>What the scout looks for. When a server is connected these sync with its watchlist; otherwise they tune the on-device scout.</Text>
      {status ? <Text style={[styles.status, { color: status.ok ? colors.emerald : colors.danger }]}>{status.text}</Text> : null}

      <Section title="MINIMUM FIT">
        <Text style={styles.help}>Only surface roles scoring at or above this (0–10).</Text>
        <View style={styles.stepRow}>
          <Stepper value={c.minFit} onChange={(v) => setC((s) => ({ ...s, minFit: clamp(v, 0, 10) }))} step={0.5} />
          <Text style={styles.bigVal}>{c.minFit.toFixed(1)}</Text>
        </View>
      </Section>

      <Section title="SALARY FLOOR">
        <Text style={styles.help}>Skip roles whose posted pay is clearly below this. Roles with no listed salary are kept (most boards omit it). Best-effort on device; the server scout applies it too.</Text>
        <TextInput
          value={c.salaryFloor ? String(c.salaryFloor) : ''}
          onChangeText={(t) => setC((s) => ({ ...s, salaryFloor: Math.max(0, parseInt(t.replace(/[^0-9]/g, ''), 10) || 0) }))}
          keyboardType="number-pad"
          placeholder="0 (no floor)"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        {c.salaryFloor > 0 ? <Text style={styles.salaryEcho}>{fmtSalary(c.salaryFloor)} / yr</Text> : null}
      </Section>

      <Section title="REMOTE">
        <View style={styles.seg}>
          {([true, false] as const).map((v) => (
            <Pressable key={String(v)} style={[styles.segBtn, c.remoteOnly === v && styles.segBtnOn]} onPress={() => setC((s) => ({ ...s, remoteOnly: v }))}>
              <Text style={[styles.segText, c.remoteOnly === v && styles.segTextOn]}>{v ? 'Remote / flex only' : 'Include on-site'}</Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <ListSection title="ROLE TITLES" hint="Seniority / titles to target — one per line (e.g. Principal Product Manager)." value={c.titles} onChange={(arr) => setC((s) => ({ ...s, titles: arr }))} />
      <ListSection title="KEYWORDS" hint="Domain terms that define a match — one per line (e.g. CDP, data platform, LLM)." value={c.keywords} onChange={(arr) => setC((s) => ({ ...s, keywords: arr }))} />
      <ListSection title="NEGATIVE KEYWORDS" hint="Skip any posting whose title or description contains these — one per line." value={c.negativeKeywords} onChange={(arr) => setC((s) => ({ ...s, negativeKeywords: arr }))} />
    </ScrollView>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n * 10) / 10));

function Stepper({ value, onChange, step }: { value: number; onChange: (v: number) => void; step: number }) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepBtn} onPress={() => onChange(value - step)} hitSlop={8}>
        <Text style={styles.stepTxt}>−</Text>
      </Pressable>
      <Pressable style={styles.stepBtn} onPress={() => onChange(value + step)} hitSlop={8}>
        <Text style={styles.stepTxt}>+</Text>
      </Pressable>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ListSection({ title, hint, value, onChange }: { title: string; hint: string; value: string[]; onChange: (a: string[]) => void }) {
  return (
    <Section title={title}>
      <Text style={styles.help}>{hint}</Text>
      <TextInput
        value={value.join('\n')}
        onChangeText={(t) => onChange(linesToArr(t))}
        placeholder="One per line"
        placeholderTextColor={colors.muted}
        multiline
        autoCapitalize="none"
        style={[styles.input, styles.multi]}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.canvas },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 24, gap: 18, paddingBottom: 48 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: colors.emerald },
  save: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700', color: colors.emerald },
  title: { fontFamily: fonts.serif, fontSize: 26, fontWeight: '600', color: colors.textHigh, marginTop: -8 },
  intro: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: -8 },
  status: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500' },
  section: { gap: 8 },
  sectionTitle: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '500', letterSpacing: 1.6, color: colors.muted },
  help: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, lineHeight: 17 },
  input: { backgroundColor: colors.element, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: colors.textHigh, fontFamily: fonts.sans, fontSize: 15 },
  multi: { minHeight: 90, textAlignVertical: 'top' },
  salaryEcho: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.emerald },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bigVal: { fontFamily: fonts.serif, fontSize: 28, fontWeight: '600', color: colors.textHigh },
  stepper: { flexDirection: 'row', gap: 10 },
  stepBtn: { width: 44, height: 44, borderRadius: 11, backgroundColor: colors.element, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontFamily: fonts.sans, fontSize: 24, color: colors.emerald, lineHeight: 26 },
  seg: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, backgroundColor: colors.element, borderWidth: 1, borderColor: colors.element, alignItems: 'center' },
  segBtnOn: { borderColor: alpha(colors.emerald, 0.5), backgroundColor: alpha(colors.emerald, 0.1) },
  segText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500', color: colors.textBase },
  segTextOn: { color: colors.emerald },
});
