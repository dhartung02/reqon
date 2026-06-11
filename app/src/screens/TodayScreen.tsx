import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { colors, alpha, fonts } from '../theme';
import type { Role, Lane } from '../model';
import { todayLanes, isApplyNext, type Tone } from '../today';

const toneColor: Record<Tone, string> = {
  accent: colors.emerald,
  warning: colors.amber,
  muted: colors.muted,
  active: colors.active,
  danger: colors.danger,
};

// Today = the daily-loop command center (mirrors the web): scout strip + action cards + footer.
// The scored role lists live in the lane tabs.
export function TodayScreen({
  roles,
  onJump,
  onScout,
  scouting,
  scoutMsg,
  scoutEnabled,
}: {
  roles: Role[];
  onJump: (l: Lane) => void;
  onScout: () => void;
  scouting: boolean;
  scoutMsg: string | null;
  scoutEnabled: boolean;
}) {
  const lanes = todayLanes(roles);
  const tierA = roles.filter((r) => r.tier === 'A').length;
  const applyNext = roles.filter(isApplyNext).length;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.scoutStrip}>
        <View style={styles.scoutLeft}>
          <View style={styles.pulse} />
          <Text style={styles.scoutText}>Reqon Scout • {roles.length} tracked</Text>
        </View>
        {scoutEnabled ? (
          <Pressable style={styles.scoutBtn} onPress={onScout} disabled={scouting}>
            {scouting ? (
              <ActivityIndicator size="small" color={colors.emerald} />
            ) : (
              <Text style={styles.scoutBtnText}>Run Scout</Text>
            )}
          </Pressable>
        ) : (
          <Text style={styles.serverScout}>Server scout · synced</Text>
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
              <Text style={[styles.cardNum, { color: empty ? colors.muted : toneColor[l.tone] }]}>{l.count}</Text>
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

const styles = StyleSheet.create({
  scroll: { paddingTop: 16, paddingBottom: 32, gap: 16 },
  scoutStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoutLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.emerald },
  scoutText: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  scoutBtn: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 8,
    backgroundColor: alpha(colors.emerald, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.emerald, 0.4),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
  },
  scoutBtnText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.emerald },
  serverScout: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  scoutMsg: { fontFamily: fonts.sans, fontSize: 12, color: colors.textBase },
  sectionTitle: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '500', letterSpacing: 1.4, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    flexBasis: '47.5%',
    flexGrow: 1,
    backgroundColor: colors.element,
    borderRadius: 12,
    padding: 14,
    gap: 2,
  },
  cardEmpty: { opacity: 0.45 },
  cardNum: { fontFamily: fonts.serif, fontSize: 30, fontWeight: '700', lineHeight: 34 },
  cardTitle: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.textHigh, marginTop: 2 },
  cardDesc: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, lineHeight: 16 },
  foot: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 4 },
});
