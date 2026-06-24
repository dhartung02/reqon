import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { fonts, useThemedStyles, type Palette } from '../theme';
import { requestScore } from '../sync/assist';
import type { Role } from '../model';

// AI re-score (P1.5): shows the server's grounded fit/prob/tier suggestion next to the current
// scores + a rationale. Apply persists fit/prob (tier + EV re-derive locally); never auto-applies.
export function ScoreModal({
  visible, role, onApply, onClose,
}: { visible: boolean; role: Role; onApply: (fit: number, prob: number) => void; onClose: () => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sug, setSug] = useState<{ fit: number; prob: number; tier?: string; rationale?: string } | null>(null);

  const load = async () => {
    setBusy(true); setError(null); setSug(null);
    const r = await requestScore({ company: role.company, role: role.role });
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setSug({ fit: r.fit ?? 0, prob: r.prob ?? 0, tier: r.tier, rationale: r.rationale });
  };
  useEffect(() => { if (visible) load(); }, [visible]);

  const cell = (label: string, now: number | string, next?: number | string) => (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellNow}>{now}{next != null ? <Text style={styles.cellNext}>{'  →  ' + next}</Text> : null}</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headRow}>
            <Text style={styles.title}>AI re-score</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text style={styles.cancel}>Done</Text></Pressable>
          </View>
          <Text style={styles.sub}>{role.role} · {role.company}</Text>

          {busy ? <ActivityIndicator color={c.emerald} style={{ marginVertical: 24 }} /> : null}
          {error ? <Text style={styles.err}>{error}</Text> : null}

          {sug ? (
            <>
              <View style={styles.grid}>
                {cell('Fit', role.fit, sug.fit)}
                {cell('Prob', role.prob, sug.prob)}
                {cell('Tier', role.tier, sug.tier ?? '–')}
              </View>
              {sug.rationale ? <Text style={styles.rationale} selectable>{sug.rationale}</Text> : null}
              <View style={styles.actions}>
                <Pressable style={styles.ghost} onPress={load}><Text style={styles.ghostText}>Re-run</Text></Pressable>
                <Pressable style={styles.apply} onPress={() => { onApply(sug.fit, sug.prob); onClose(); }}>
                  <Text style={styles.applyText}>Apply suggested scores</Text>
                </Pressable>
              </View>
              <Text style={styles.note}>Applies fit/prob · tier &amp; EV re-derive · review before relying on it.</Text>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.canvas, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderColor: c.element, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, gap: 12 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: c.textHigh },
  cancel: { fontFamily: fonts.sans, fontSize: 15, color: c.emerald, fontWeight: '500' },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: c.muted, marginTop: -6 },
  err: { fontFamily: fonts.sans, fontSize: 13, color: c.danger },
  grid: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1, backgroundColor: c.element, borderRadius: 10, padding: 12 },
  cellLabel: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: c.muted },
  cellNow: { fontFamily: fonts.sans, fontSize: 16, fontWeight: '700', color: c.textHigh, marginTop: 4 },
  cellNext: { color: c.emerald },
  rationale: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  ghost: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.element, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.textBase },
  apply: { flex: 1, backgroundColor: c.emerald, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  applyText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700', color: c.canvas },
  note: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
});
