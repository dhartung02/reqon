import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, alpha, fonts } from '../theme';
import { RoleCard } from '../components/RoleCard';
import type { Role } from '../model';

// The Today body: a scout-status strip + the scored pipeline (top actionable roles). The app shell
// (App.tsx) provides the brand bar + lane tabs; this is just the lane content.
export function TodayScreen({ roles, onPressRole }: { roles: Role[]; onPressRole: (r: Role) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.scoutStrip}>
        <View style={styles.pulse} />
        <Text style={styles.scoutText}>Reqon Scout active • {roles.length} roles tracked</Text>
      </View>

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
  scoutStrip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.emerald },
  scoutText: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
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
  list: { gap: 16 },
});
