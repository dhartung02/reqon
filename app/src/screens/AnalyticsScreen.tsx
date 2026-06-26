import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { alpha, fonts, tierColor, useThemedStyles, type Palette } from '../theme';
import { type Role, type Tier } from '../model';
import { pipelineMetrics } from '../analytics';
import { pipelineHealth, type HealthBand } from '../pipelineHealth';
import { fetchServerAnalytics, type ServerAnalytics } from '../sync/serverAnalytics';
import { useLayout } from '../useLayout';

const bandColor = (b: HealthBand, c: Palette) => (b === 'Good' ? c.emerald : b === 'Fair' ? c.amber : c.danger);

// Pipeline analytics: headline KPIs, funnel, conversion, tiers, source quality + distributions.
// Numbers come from the SERVER (/api/analytics) when a server is configured — so the app matches the
// web exactly — and fall back to the local pipelineMetrics/pipelineHealth helpers when standalone.
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
  const { wide } = useLayout();

  const m = useMemo(() => pipelineMetrics(roles), [roles]);
  const localHealth = useMemo(() => pipelineHealth(roles), [roles]);
  const [srv, setSrv] = useState<ServerAnalytics | null>(null);
  // Pull server analytics on mount + whenever the local set changes (a sync just happened).
  useEffect(() => {
    let alive = true;
    fetchServerAnalytics().then((r) => { if (alive) setSrv(r.data ?? null); });
    return () => { alive = false; };
  }, [roles, refreshing]);

  // Unified view model: server when available, else local.
  const view = srv ? {
    total: srv.metrics.total, tierA: srv.tiers.A, open: srv.metrics.notApplied, applied: srv.metrics.applied,
    interviewing: srv.outcomes.interview, offers: srv.metrics.offer, respRate: srv.metrics.responseRate,
    interviewToOffer: srv.metrics.recruiter ? Math.round((srv.metrics.offer / srv.metrics.recruiter) * 1000) / 10 : 0,
    funnel: srv.funnel.map((f) => ({ status: f.stage, count: f.count })), everApplied: srv.metrics.applied,
    tiers: srv.tiers, health: srv.health, source: 'server' as const,
  } : {
    total: m.total, tierA: m.tiers.A, open: m.open, applied: m.applied, interviewing: m.interviewing, offers: m.offers,
    respRate: m.respRate, interviewToOffer: m.interviewToOffer, funnel: m.funnel, everApplied: m.everApplied,
    tiers: m.tiers, health: localHealth, source: 'local' as const,
  };
  const health = view.health;
  const hm = health.metrics as Record<string, number | null>;
  const healthChips: [string, string | number][] = [
    ['apply-ready', hm.applyReady ?? 0], ['applied 7d', hm.appliedLast7 ?? 0],
    ['response', hm.responseRate != null ? `${hm.responseRate}%` : '—'], ['interviewing', hm.interviewing ?? 0],
    ['follow-ups due', hm.followupsOverdue ?? 0], ['aging 14d+', hm.agingApps ?? 0],
  ];

  const kpis: { label: string; value: string; accent?: string }[] = [
    { label: 'Total roles', value: String(view.total) },
    { label: 'Tier A', value: String(view.tierA), accent: c.emerald },
    { label: 'Open', value: String(view.open) },
    { label: 'Applied', value: String(view.applied) },
    { label: 'Interviewing', value: String(view.interviewing), accent: c.active },
    { label: 'Offers', value: String(view.offers), accent: c.emerald },
    { label: 'Response rate', value: `${view.respRate}%` },
    { label: 'Interview → offer', value: `${view.interviewToOffer}%` },
  ];

  const funnelMax = Math.max(1, ...view.funnel.map((s) => s.count));
  const tierTotal = view.tiers.A + view.tiers.B + view.tiers.C || 1;
  const distMax = (d: { count: number }[]) => Math.max(1, ...d.map((x) => x.count));

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, wide && styles.scrollWide]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.emerald} />}
    >
      <View style={styles.health}>
        <View style={styles.healthTop}>
          <Text style={[styles.healthBand, { color: bandColor(health.band, c) }]}>Pipeline health: {health.band}</Text>
          <Text style={styles.healthScore}>{health.score}/100</Text>
        </View>
        <Text style={styles.healthRisk}>⚠ {health.mainRisk}</Text>
        <View style={styles.healthChips}>
          {healthChips.map(([k, v]) => (
            <View key={k} style={styles.healthChip}><Text style={styles.healthChipK}>{k} </Text><Text style={styles.healthChipV}>{v}</Text></View>
          ))}
        </View>
        {health.recommendations.slice(0, 3).map((r) => (
          <Text key={r} style={styles.healthRec}>→ {r}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {kpis.map((k) => (
          <View key={k.label} style={[styles.kpi, wide && styles.kpiWide]}>
            <Text style={styles.kpiLabel}>{k.label}</Text>
            <Text style={[styles.kpiValue, k.accent ? { color: k.accent } : null]}>{k.value}</Text>
          </View>
        ))}
      </View>

      <View>
        <Text style={styles.sectionTitle}>APPLICATION FUNNEL</Text>
        <Text style={styles.caption}>Roles currently at each stage · {view.everApplied} ever applied · {view.source === 'server' ? 'live from server' : 'local (standalone)'}</Text>
      </View>
      {view.everApplied === 0 ? (
        <Text style={styles.legendText}>No applications yet — apply to a role to start the funnel.</Text>
      ) : (
        <View style={styles.funnel}>
          {view.funnel.map((s) => (
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
      <View
        style={styles.bar}
        accessibilityRole="image"
        accessibilityLabel={`Tier distribution: ${view.tiers.A} tier A, ${view.tiers.B} tier B, ${view.tiers.C} tier C`}
      >
        {(['A', 'B', 'C'] as Tier[]).map((t) =>
          view.tiers[t] ? (
            <View
              key={t}
              style={{ flex: view.tiers[t] / tierTotal, backgroundColor: tierColor(t, c), height: 10 }}
            />
          ) : null,
        )}
      </View>
      <View style={styles.legend}>
        {(['A', 'B', 'C'] as Tier[]).map((t) => (
          <View key={t} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: tierColor(t, c) }]} />
            <Text style={styles.legendText}>
              Tier {t} · {view.tiers[t]}
            </Text>
          </View>
        ))}
      </View>

      {srv ? (
        <>
          <Text style={styles.sectionTitle}>BY SECTOR</Text>
          <View style={styles.funnel}>
            {srv.distributions.sector.slice(0, 8).map((d) => (
              <View key={d.key} style={styles.funnelRow}>
                <Text style={styles.funnelLabel} numberOfLines={1}>{d.key}</Text>
                <View style={styles.funnelTrack}><View style={[styles.funnelFill, { width: `${(d.count / distMax(srv.distributions.sector)) * 100}%`, backgroundColor: c.emerald }]} /></View>
                <Text style={styles.funnelCount}>{d.count}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>SOURCE QUALITY</Text>
          <View style={styles.tbl}>
            <View style={styles.tblHead}>
              <Text style={[styles.th, styles.thSrc]}>Source</Text>
              <Text style={styles.th}>Roles</Text><Text style={styles.th}>A/B%</Text><Text style={styles.th}>Resp%</Text><Text style={styles.th}>Dup</Text>
            </View>
            {srv.sourceQuality.slice(0, 10).map((s) => (
              <View key={s.source} style={styles.tblRow}>
                <Text style={[styles.td, styles.thSrc]} numberOfLines={1}>{s.source}</Text>
                <Text style={styles.td}>{s.roles}</Text><Text style={styles.td}>{s.abPct}%</Text><Text style={styles.td}>{s.respPct}%</Text>
                <Text style={[styles.td, s.dup ? { color: c.danger } : null]}>{s.dup || '—'}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  scroll: { paddingTop: 16, paddingBottom: 32, gap: 18 },
  scrollWide: { maxWidth: 1040, width: '100%', alignSelf: 'center' },
  health: { backgroundColor: c.element, borderRadius: 12, padding: 14, gap: 8 },
  healthTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  healthBand: { fontFamily: fonts.sans, fontSize: 16, fontWeight: '700' },
  healthScore: { fontFamily: fonts.sans, fontSize: 13, color: c.muted },
  healthRisk: { fontFamily: fonts.sans, fontSize: 13, color: c.textBase, lineHeight: 19 },
  healthChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  healthChip: { flexDirection: 'row', backgroundColor: c.canvas, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  healthChipK: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  healthChipV: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '700', color: c.textHigh },
  healthRec: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.emerald },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiWide: { flexBasis: '23%', minWidth: 150 },
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
  tbl: { backgroundColor: c.element, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  tblHead: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderColor: alpha(c.muted, 0.2) },
  tblRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderColor: alpha(c.muted, 0.08) },
  th: { flex: 1, fontFamily: fonts.sans, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: c.muted, textAlign: 'right' },
  thSrc: { flex: 2, textAlign: 'left' },
  td: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: c.textBase, textAlign: 'right' },
});
