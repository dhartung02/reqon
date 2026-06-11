import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { colors, alpha, fonts } from '../theme';
import { RoleCard } from '../components/RoleCard';
import type { Role } from '../model';

// The Today body: a scout strip (with a Run Scout action) + the scored pipeline. The app shell
// (App.tsx) provides the brand bar + lane tabs; this is just the lane content.
export function TodayScreen({
  roles,
  onPressRole,
  onScout,
  scouting,
  scoutMsg,
}: {
  roles: Role[];
  onPressRole: (r: Role) => void;
  onScout: () => void;
  scouting: boolean;
  scoutMsg: string | null;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.scoutStrip}>
        <View style={styles.scoutLeft}>
          <View style={styles.pulse} />
          <Text style={styles.scoutText}>Reqon Scout • {roles.length} tracked</Text>
        </View>
        <Pressable style={styles.scoutBtn} onPress={onScout} disabled={scouting}>
          {scouting ? (
            <ActivityIndicator size="small" color={colors.emerald} />
          ) : (
            <Text style={styles.scoutBtnText}>Run Scout</Text>
          )}
        </Pressable>
      </View>
      {scoutMsg ? <Text style={styles.scoutMsg}>{scoutMsg}</Text> : null}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>SCORED PIPELINE</Text>
        <Text style={styles.signal}>98% Signal</Text>
      </View>

      <View style={styles.list}>
        {roles.map((r) => (
          <RoleCard key={r.id} role={r} onPress={() => onPressRole(r)} />
        ))}
      </View>
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
  scoutMsg: { fontFamily: fonts.sans, fontSize: 12, color: colors.textBase },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 2.2,
    color: colors.muted,
  },
  signal: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: '500',
    color: colors.emerald,
    backgroundColor: alpha(colors.emerald, 0.1),
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  list: { gap: 10 },
});
