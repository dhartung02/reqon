import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SectionList, Pressable, RefreshControl } from 'react-native';
import { fonts, useThemedStyles, type Palette } from '../theme';
import { RoleCard } from '../components/RoleCard';
import { BulkActionBar } from '../components/BulkActionBar';
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
  type Status,
} from '../model';

// A lane list (Open/Applied/Interviewing/Closed): roles filtered by search, grouped by tier
// (A→B→C), sorted within each group. Tap a card to open detail, or enter Select mode to
// bulk-change status on many at once.
const TIER_ORDER: Tier[] = ['A', 'B', 'C'];
const TIER_LABEL: Record<Tier, string> = { A: 'Strong', B: 'Possible', C: 'Long shot' };

export function PipelineScreen({
  lane,
  roles,
  query,
  sort,
  filter,
  onPressRole,
  onBulkStatus,
  refreshing,
  onRefresh,
  activeId = null,
}: {
  lane: StatusLane;
  roles: Role[];
  query: string;
  sort: SortKey;
  filter: RoleFilter;
  onPressRole: (r: Role) => void;
  onBulkStatus: (ids: string[], status: Status) => void;
  refreshing: boolean;
  onRefresh: () => void;
  activeId?: string | null;
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

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
  const allIds = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.id)), [groups]);
  // SectionList sections (one per tier) — virtualizes the list so ~150+ cards don't all mount.
  const sections = useMemo(() => groups.map((g) => ({ tier: g.tier, count: g.rows.length, data: g.rows })), [groups]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));

  const exitSelect = () => {
    setSelecting(false);
    setSelected([]);
  };
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const applyBulk = (status: Status) => {
    if (selected.length) onBulkStatus(selected, status);
    exitSelect();
  };

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
    <View style={styles.wrap}>
      <View style={styles.toolRow}>
        {selecting ? (
          <Pressable
            onPress={() => setSelected(allSelected ? [] : allIds)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={allSelected ? 'Clear selection' : 'Select all roles'}
          >
            <Text style={styles.tool}>{allSelected ? 'Clear' : 'Select all'}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable
          onPress={() => (selecting ? exitSelect() : setSelecting(true))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={selecting ? 'Cancel selection mode' : 'Enter selection mode'}
        >
          <Text style={styles.tool}>{selecting ? 'Cancel' : 'Select'}</Text>
        </Pressable>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.emerald} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.groupHead}>
            <Text style={styles.groupTitle}>{TIER_LABEL[section.tier]}</Text>
            <Text style={styles.groupCount}>{section.count}</Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.itemSep} />}
        renderItem={({ item }) => (
          <RoleCard
            role={item}
            selectable={selecting}
            selected={selected.includes(item.id)}
            active={!selecting && item.id === activeId}
            onPress={() => (selecting ? toggle(item.id) : onPressRole(item))}
          />
        )}
      />
      {selecting ? <BulkActionBar count={selected.length} onStatus={applyBulk} /> : null}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  wrap: { flex: 1 },
  toolRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, minHeight: 20 },
  tool: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.emerald },
  scroll: { paddingTop: 12, paddingBottom: 32 },
  // gap doesn't apply across virtualized rows — spacing is via header margins + ItemSeparator.
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 10 },
  groupTitle: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: c.muted,
  },
  groupCount: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  itemSep: { height: 12 },
  empty: { paddingTop: 64, alignItems: 'center' },
  emptyText: { fontFamily: fonts.sans, fontSize: 14, color: c.muted },
});
