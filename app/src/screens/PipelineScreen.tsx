import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, fonts } from '../theme';
import { RoleCard } from '../components/RoleCard';
import { rolesInLane, type Lane, type Role, type Tier } from '../model';

// A lane list (Open/Applied/Interviewing/Closed): roles grouped by tier (A→B→C), sorted by score
// within each group. Tapping a card opens the detail.
const TIER_ORDER: Tier[] = ['A', 'B', 'C'];
const TIER_LABEL: Record<Tier, string> = { A: 'Tier A', B: 'Tier B', C: 'Tier C' };

export function PipelineScreen({
  lane,
  roles,
  onPressRole,
}: {
  lane: Exclude<Lane, 'today'>;
  roles: Role[];
  onPressRole: (r: Role) => void;
}) {
  const groups = useMemo(() => {
    const inLane = rolesInLane(roles, lane);
    return TIER_ORDER.map((tier) => ({
      tier,
      rows: inLane.filter((r) => r.tier === tier).sort((a, b) => b.score - a.score),
    })).filter((g) => g.rows.length > 0);
  }, [roles, lane]);

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  if (total === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No roles in this lane.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {groups.map((g) => (
        <View key={g.tier} style={styles.group}>
          <View style={styles.groupHead}>
            <Text style={styles.groupTitle}>{TIER_LABEL[g.tier]}</Text>
            <Text style={styles.groupCount}>{g.rows.length}</Text>
          </View>
          <View style={styles.list}>
            {g.rows.map((r) => (
              <RoleCard key={r.id} role={r} onPress={() => onPressRole(r)} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 16, paddingBottom: 32, gap: 22 },
  group: { gap: 12 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupTitle: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  groupCount: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  list: { gap: 12 },
  empty: { paddingTop: 64, alignItems: 'center' },
  emptyText: { fontFamily: fonts.sans, fontSize: 14, color: colors.muted },
});
