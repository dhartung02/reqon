import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { fonts, useThemedStyles, type Palette } from '../theme';
import { RoleCard } from '../components/RoleCard';
import {
  rolesInLane,
  matchesQuery,
  sortRoles,
  applyFilters,
  activeFilterCount,
  type StatusLane,
  type Role,
  type Tier,
  type SortKey,
  type RoleFilter,
} from '../model';

// A lane list (Open/Applied/Interviewing/Closed): roles filtered by search, grouped by tier
// (A→B→C), sorted within each group. Tapping a card opens the detail.
const TIER_ORDER: Tier[] = ['A', 'B', 'C'];
const TIER_LABEL: Record<Tier, string> = { A: 'Tier A', B: 'Tier B', C: 'Tier C' };

export function PipelineScreen({
  lane,
  roles,
  query,
  sort,
  filter,
  onPressRole,
  refreshing,
  onRefresh,
}: {
  lane: StatusLane;
  roles: Role[];
  query: string;
  sort: SortKey;
  filter: RoleFilter;
  onPressRole: (r: Role) => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  const groups = useMemo(() => {
    const inLane = applyFilters(rolesInLane(roles, lane).filter((r) => matchesQuery(r, query)), filter);
    return TIER_ORDER.map((tier) => ({
      tier,
      rows: sortRoles(
        inLane.filter((r) => r.tier === tier),
        sort,
      ),
    })).filter((g) => g.rows.length > 0);
  }, [roles, lane, query, sort, filter]);

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  if (total === 0) {
    const filtered = activeFilterCount(filter) > 0;
    const msg = query.trim()
      ? 'No roles match your search.'
      : filtered
        ? 'No roles match your filters.'
        : 'No roles in this lane.';
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{msg}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.emerald} />}
    >
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

const makeStyles = (c: Palette) => StyleSheet.create({
  scroll: { paddingTop: 16, paddingBottom: 32, gap: 18 },
  group: { gap: 10 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupTitle: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: c.muted,
  },
  groupCount: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  list: { gap: 12 },
  empty: { paddingTop: 64, alignItems: 'center' },
  emptyText: { fontFamily: fonts.sans, fontSize: 14, color: c.muted },
});
