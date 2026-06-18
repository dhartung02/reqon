import { View, TextInput, Pressable, Text, StyleSheet, ScrollView } from 'react-native';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import { SORTS, type SortKey, type RoleFilter } from '../model';

const FILTERS: { key: keyof RoleFilter; label: string }[] = [
  { key: 'noOnsite', label: 'No on-site' },
  { key: 'verifiedOnly', label: 'Verified' },
  { key: 'hideTierC', label: 'Hide Tier C' },
];

// Search box + sort pills + filter toggles for the lane lists.
export function ControlBar({
  query,
  onQuery,
  sort,
  onSort,
  filter,
  onFilter,
}: {
  query: string;
  onQuery: (s: string) => void;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  filter: RoleFilter;
  onFilter: (f: RoleFilter) => void;
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrap}>
      <TextInput
        value={query}
        onChangeText={onQuery}
        placeholder="Search company, role, recruiter…"
        placeholderTextColor={c.muted}
        style={styles.input}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {SORTS.map(({ key, label }) => {
          const on = key === sort;
          return (
            <Pressable
              key={key}
              onPress={() => onSort(key)}
              style={[styles.pill, on && styles.pillOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Sort by ${label}`}
            >
              <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {FILTERS.map(({ key, label }) => {
          const on = filter[key];
          return (
            <Pressable
              key={key}
              onPress={() => onFilter({ ...filter, [key]: !on })}
              style={[styles.filterPill, on && styles.filterPillOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Filter: ${label}${on ? ', on' : ''}`}
            >
              <Text style={[styles.pillText, on && styles.filterTextOn]}>{on ? '✓ ' : ''}{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  wrap: { gap: 10, paddingTop: 14 },
  input: {
    backgroundColor: c.element,
    borderWidth: 1,
    borderColor: c.element,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    color: c.textHigh,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  row: { gap: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: c.element,
    borderWidth: 1,
    borderColor: c.element,
  },
  pillOn: { borderColor: alpha(c.emerald, 0.5), backgroundColor: alpha(c.emerald, 0.08) },
  pillText: { fontFamily: fonts.sans, fontSize: 12, color: c.textBase },
  pillTextOn: { color: c.emerald },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: c.element,
    borderWidth: 1,
    borderColor: c.element,
  },
  filterPillOn: { borderColor: alpha(c.active, 0.6), backgroundColor: alpha(c.active, 0.12) },
  filterTextOn: { color: c.active, fontWeight: '600' },
});
