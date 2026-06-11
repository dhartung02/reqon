import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { colors, alpha, fonts, tierColor } from '../theme';
import { rolesInLane, type Role, type Tier } from '../model';

// Pipeline analytics: headline KPIs + tier distribution. Computed from the same roles the lists use.
export function AnalyticsScreen({
  roles,
  refreshing,
  onRefresh,
}: {
  roles: Role[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const m = useMemo(() => {
    const applied = rolesInLane(roles, 'applied').length;
    const interviewing = rolesInLane(roles, 'interviewing').length;
    const closed = rolesInLane(roles, 'closed').length;
    const open = rolesInLane(roles, 'open').length;
    const offers = roles.filter((r) => r.status === 'Offer').length;
    const rejected = roles.filter((r) => r.status === 'Rejected').length;
    const advanced = roles.filter((r) =>
      ['Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer'].includes(r.status),
    ).length;
    const appliedTotal = applied + interviewing + closed; // ever-applied
    const respRate = appliedTotal ? Math.round((advanced / appliedTotal) * 100) : 0;
    const tiers: Record<Tier, number> = {
      A: roles.filter((r) => r.tier === 'A').length,
      B: roles.filter((r) => r.tier === 'B').length,
      C: roles.filter((r) => r.tier === 'C').length,
    };
    return { total: roles.length, open, applied, interviewing, offers, rejected, respRate, tiers };
  }, [roles]);

  const kpis: { label: string; value: string; accent?: string }[] = [
    { label: 'Total roles', value: String(m.total) },
    { label: 'Tier A', value: String(m.tiers.A), accent: colors.emerald },
    { label: 'Open', value: String(m.open) },
    { label: 'Applied', value: String(m.applied) },
    { label: 'Interviewing', value: String(m.interviewing), accent: colors.active },
    { label: 'Offers', value: String(m.offers), accent: colors.emerald },
    { label: 'Rejected', value: String(m.rejected), accent: colors.danger },
    { label: 'Response rate', value: `${m.respRate}%` },
  ];

  const tierTotal = m.tiers.A + m.tiers.B + m.tiers.C || 1;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />}
    >
      <View style={styles.grid}>
        {kpis.map((k) => (
          <View key={k.label} style={styles.kpi}>
            <Text style={styles.kpiLabel}>{k.label}</Text>
            <Text style={[styles.kpiValue, k.accent ? { color: k.accent } : null]}>{k.value}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>TIER DISTRIBUTION</Text>
      <View style={styles.bar}>
        {(['A', 'B', 'C'] as Tier[]).map((t) =>
          m.tiers[t] ? (
            <View
              key={t}
              style={{ flex: m.tiers[t] / tierTotal, backgroundColor: tierColor(t), height: 10 }}
            />
          ) : null,
        )}
      </View>
      <View style={styles.legend}>
        {(['A', 'B', 'C'] as Tier[]).map((t) => (
          <View key={t} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: tierColor(t) }]} />
            <Text style={styles.legendText}>
              Tier {t} · {m.tiers[t]}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 16, paddingBottom: 32, gap: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.element,
    borderRadius: 12,
    padding: 14,
  },
  kpiLabel: { fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.muted },
  kpiValue: { fontFamily: fonts.serif, fontSize: 26, fontWeight: '600', color: colors.textHigh, marginTop: 4 },
  sectionTitle: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '500', letterSpacing: 2, color: colors.muted, marginTop: 4 },
  bar: { flexDirection: 'row', borderRadius: 5, overflow: 'hidden', backgroundColor: alpha(colors.muted, 0.2) },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: fonts.sans, fontSize: 12, color: colors.textBase },
});
