import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import type { Role, Lane } from '../model';
import { todayLanes, isApplyNext, type Tone } from '../today';
import { computeActions, groupActions, type Severity } from '../actionItems';
import { useLayout } from '../useLayout';

const sevColor = (c: Palette): Record<Severity, string> => ({ high: c.danger, medium: c.amber, low: c.active });

const toneColor = (c: Palette): Record<Tone, string> => ({
  accent: c.emerald,
  warning: c.amber,
  muted: c.muted,
  active: c.active,
  danger: c.danger,
});

// Today = the daily-loop command center (mirrors the web): scout strip + action cards + footer.
// The scored role lists live in the lane tabs.
export function TodayScreen({
  roles,
  onJump,
  onScout,
  onServerScout,
  scouting,
  scoutMsg,
  scoutEnabled,
  refreshing,
  onRefresh,
  serverConfigured,
  syncState,
  onOpenRole,
}: {
  roles: Role[];
  onJump: (l: Lane) => void;
  onScout: () => void;
  onServerScout: () => void;
  scouting: boolean;
  scoutMsg: string | null;
  scoutEnabled: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  serverConfigured: boolean;
  syncState: { at?: number; error?: boolean };
  onOpenRole?: (id: string) => void;
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  const { wide } = useLayout();
  const tone = toneColor(c);
  const sev = sevColor(c);
  const actionGroups = groupActions(computeActions(roles));
  const rel = (t: number) => {
    const s = (Date.now() - t) / 1000;
    return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
  };
  const lanes = todayLanes(roles);
  const tierA = roles.filter((r) => r.tier === 'A').length;
  const applyNext = roles.filter(isApplyNext).length;

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, wide && styles.scrollWide]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.emerald} />}
    >
      <View style={styles.scoutStrip}>
        <View style={styles.scoutLeft}>
          <View style={styles.pulse} />
          <Text style={styles.scoutText}>Reqon Scout • {roles.length} tracked</Text>
        </View>
        {scoutEnabled ? (
          <Pressable style={styles.scoutBtn} onPress={onScout} disabled={scouting}>
            {scouting ? (
              <ActivityIndicator size="small" color={c.emerald} />
            ) : (
              <Text style={styles.scoutBtnText}>Run Scout</Text>
            )}
          </Pressable>
        ) : serverConfigured ? (
          <View style={styles.serverCol}>
            <Pressable style={styles.scoutBtn} onPress={onServerScout} disabled={scouting}>
              {scouting ? <ActivityIndicator size="small" color={c.emerald} /> : <Text style={styles.scoutBtnText}>Run server scout</Text>}
            </Pressable>
            <Text style={[styles.serverScout, syncState.error && styles.syncErr]}>
              {syncState.error ? 'Sync failed' : syncState.at ? `Synced ${rel(syncState.at)}` : 'Server connected'}
            </Text>
          </View>
        ) : (
          <Text style={styles.serverScout}>Scout off</Text>
        )}
      </View>
      {scoutMsg ? <Text style={styles.scoutMsg}>{scoutMsg}</Text> : null}

      <Text style={styles.sectionTitle}>ACTION NEEDED — DISCOVER → VERIFY → APPLY → FOLLOW UP</Text>

      {actionGroups.length > 0 && (
        <View style={styles.actions}>
          {actionGroups.map((g) => (
            <View key={g.title} style={styles.actSec}>
              <Text style={styles.actSecTitle}>{g.title.toUpperCase()} · {g.items.length}</Text>
              {g.items.slice(0, 8).map((a) => (
                <Pressable key={a.id} style={styles.actItem} disabled={!onOpenRole} onPress={() => onOpenRole && onOpenRole(a.roleId)}>
                  <View style={[styles.actDot, { backgroundColor: sev[a.severity] }]} />
                  <View style={styles.actMain}>
                    <Text style={styles.actRole} numberOfLines={1}>{a.company}{a.role ? ` — ${a.role}` : ''}</Text>
                    <Text style={styles.actReason} numberOfLines={1}>{a.reason}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}

      <View style={styles.grid}>
        {lanes.map((l) => {
          const empty = l.count === 0;
          return (
            <Pressable
              key={l.key}
              style={[styles.card, wide && styles.cardWide, empty && styles.cardEmpty]}
              disabled={empty || !l.jump}
              onPress={() => l.jump && onJump(l.jump)}
            >
              <Text style={[styles.cardNum, { color: empty ? c.muted : tone[l.tone] }]}>{l.count}</Text>
              <Text style={styles.cardTitle}>{l.title}</Text>
              <Text style={styles.cardDesc}>{l.desc}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.foot}>
        {roles.length} roles tracked · Tier A: {tierA} · apply-next queue: {applyNext}
      </Text>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  scroll: { paddingTop: 16, paddingBottom: 32, gap: 16 },
  scrollWide: { maxWidth: 1040, width: '100%', alignSelf: 'center' },
  scoutStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoutLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.emerald },
  scoutText: { fontFamily: fonts.sans, fontSize: 13, color: c.muted },
  scoutBtn: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 8,
    backgroundColor: alpha(c.emerald, 0.1),
    borderWidth: 1,
    borderColor: alpha(c.emerald, 0.4),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
  },
  scoutBtnText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.emerald },
  serverCol: { alignItems: 'flex-end', gap: 4 },
  serverScout: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  syncErr: { color: c.danger },
  scoutMsg: { fontFamily: fonts.sans, fontSize: 12, color: c.textBase },
  sectionTitle: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '500', letterSpacing: 1.4, color: c.muted },
  actions: { backgroundColor: c.element, borderRadius: 12, padding: 12, gap: 4 },
  actSec: { marginTop: 6 },
  actSecTitle: { fontFamily: fonts.sans, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: c.muted, marginBottom: 4 },
  actItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  actDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  actMain: { flex: 1, minWidth: 0 },
  actRole: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.textHigh },
  actReason: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, marginTop: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    flexBasis: '47.5%',
    flexGrow: 1,
    backgroundColor: c.element,
    borderRadius: 12,
    padding: 14,
    gap: 2,
  },
  cardWide: { flexBasis: '23%', minWidth: 150 },
  cardEmpty: { opacity: 0.45 },
  cardNum: { fontFamily: fonts.serif, fontSize: 30, fontWeight: '700', lineHeight: 34 },
  cardTitle: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.textHigh, marginTop: 2 },
  cardDesc: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, lineHeight: 16 },
  foot: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, marginTop: 4 },
});
