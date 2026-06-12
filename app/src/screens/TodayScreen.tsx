import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import type { Role, Lane } from '../model';
import { todayLanes, isApplyNext, type Tone } from '../today';

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
  scouting,
  scoutMsg,
  scoutEnabled,
  refreshing,
  onRefresh,
  serverConfigured,
  syncState,
}: {
  roles: Role[];
  onJump: (l: Lane) => void;
  onScout: () => void;
  scouting: boolean;
  scoutMsg: string | null;
  scoutEnabled: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  serverConfigured: boolean;
  syncState: { at?: number; error?: boolean };
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  const tone = toneColor(c);
  const rel = (t: number) => {
    const s = (Date.now() - t) / 1000;
    return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
  };
  const lanes = todayLanes(roles);
  const tierA = roles.filter((r) => r.tier === 'A').length;
  const applyNext = roles.filter(isApplyNext).length;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
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
          <Text style={[styles.serverScout, syncState.error && styles.syncErr]}>
            {syncState.error ? 'Sync failed' : syncState.at ? `Synced ${rel(syncState.at)}` : 'Server scout'}
          </Text>
        ) : (
          <Text style={styles.serverScout}>Scout off</Text>
        )}
      </View>
      {scoutMsg ? <Text style={styles.scoutMsg}>{scoutMsg}</Text> : null}

      <Text style={styles.sectionTitle}>ACTION NEEDED — DISCOVER → VERIFY → APPLY → FOLLOW UP</Text>

      <View style={styles.grid}>
        {lanes.map((l) => {
          const empty = l.count === 0;
          return (
            <Pressable
              key={l.key}
              style={[styles.card, empty && styles.cardEmpty]}
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
  serverScout: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  syncErr: { color: c.danger },
  scoutMsg: { fontFamily: fonts.sans, fontSize: 12, color: c.textBase },
  sectionTitle: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '500', letterSpacing: 1.4, color: c.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    flexBasis: '47.5%',
    flexGrow: 1,
    backgroundColor: c.element,
    borderRadius: 12,
    padding: 14,
    gap: 2,
  },
  cardEmpty: { opacity: 0.45 },
  cardNum: { fontFamily: fonts.serif, fontSize: 30, fontWeight: '700', lineHeight: 34 },
  cardTitle: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.textHigh, marginTop: 2 },
  cardDesc: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, lineHeight: 16 },
  foot: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, marginTop: 4 },
});
