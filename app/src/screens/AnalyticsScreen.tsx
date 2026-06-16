import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { alpha, fonts, tierColor, useThemedStyles, type Palette } from '../theme';
import { type Role, type Tier } from '../model';
import { pipelineMetrics } from '../analytics';

// Pipeline analytics: headline KPIs, application funnel + conversion, and tier distribution.
// All metrics come from the pure pipelineMetrics() helper.
export function AnalyticsScreen({
  roles,
  refreshing,
  onRefresh,
}: {
  roles: Role[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { c, styles } = useThemedStyles(makeStyles);

  const m = useMemo(() => pipelineMetrics(roles), [roles]);

  const kpis: { label: string; value: string; accent?: string }[] = [
    { label: 'Total roles', value: String(m.total) },
    { label: 'Tier A', value: String(m.tiers.A), accent: c.emerald },
    { label: 'Open', value: String(m.open) },
    { label: 'Applied', value: String(m.applied) },
    { label: 'Interviewing', value: String(m.interviewing), accent: c.active },
    { label: 'Offers', value: String(m.offers), accent: c.emerald },
    { label: 'Response rate', value: `${m.respRate}%` },
    { label: 'Interview → offer', value: `${m.interviewToOffer}%` },
  ];

  const funnelMax = Math.max(1, ...m.funnel.map((s) => s.count));
  const tierTotal = m.tiers.A + m.tiers.B + m.tiers.C || 1;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.emerald} />}
    >
      <View style={styles.grid}>
        {kpis.map((k) => (
          <View key={k.label} style={styles.kpi}>
            <Text style={styles.kpiLabel}>{k.label}</Text>
            <Text style={[styles.kpiValue, k.accent ? { color: k.accent } : null]}>{k.value}</Text>
          </View>
        ))}
      </View>

      <View>
        <Text style={styles.sectionTitle}>APPLICATION FUNNEL</Text>
        <Text style={styles.caption}>Roles currently at each stage · {m.everApplied} ever applied</Text>
      </View>
      {m.everApplied === 0 ? (
        <Text style={styles.legendText}>No applications yet — apply to a role to start the funnel.</Text>
      ) : (
        <View style={styles.funnel}>
          {m.funnel.map((s) => (
            <View key={s.status} style={styles.funnelRow}>
              <Text style={styles.funnelLabel}>{s.status}</Text>
              <View style={styles.funnelTrack}>
                <View style={[styles.funnelFill, { width: `${(s.count / funnelMax) * 100}%` }]} />
              </View>
              <Text style={styles.funnelCount}>{s.count}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>TIER DISTRIBUTION</Text>
      <View style={styles.bar}>
        {(['A', 'B', 'C'] as Tier[]).map((t) =>
          m.tiers[t] ? (
            <View
              key={t}
              style={{ flex: m.tiers[t] / tierTotal, backgroundColor: tierColor(t, c), height: 10 }}
            />
          ) : null,
        )}
      </View>
      <View style={styles.legend}>
        {(['A', 'B', 'C'] as Tier[]).map((t) => (
          <View key={t} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: tierColor(t, c) }]} />
            <Text style={styles.legendText}>
              Tier {t} · {m.tiers[t]}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  scroll: { paddingTop: 16, paddingBottom: 32, gap: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: c.element,
    borderRadius: 12,
    padding: 14,
  },
  kpiLabel: { fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: c.muted },
  kpiValue: { fontFamily: fonts.serif, fontSize: 26, fontWeight: '600', color: c.textHigh, marginTop: 4 },
  sectionTitle: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '500', letterSpacing: 2, color: c.muted, marginTop: 4 },
  caption: { fontFamily: fonts.sans, fontSize: 11, color: c.muted, marginTop: 3 },
  funnel: { gap: 8 },
  funnelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  funnelLabel: { fontFamily: fonts.sans, fontSize: 12, color: c.textBase, width: 104 },
  funnelTrack: { flex: 1, height: 16, borderRadius: 5, overflow: 'hidden', backgroundColor: alpha(c.muted, 0.18) },
  funnelFill: { height: 16, borderRadius: 5, backgroundColor: c.active, minWidth: 2 },
  funnelCount: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '600', color: c.textHigh, width: 24, textAlign: 'right' },
  bar: { flexDirection: 'row', borderRadius: 5, overflow: 'hidden', backgroundColor: alpha(c.muted, 0.2) },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: fonts.sans, fontSize: 12, color: c.textBase },
});
