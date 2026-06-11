import { View, TextInput, Pressable, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, alpha, fonts } from '../theme';
import { SORTS, type SortKey } from '../model';

// Search box + sort pills for the lane lists.
export function ControlBar({
  query,
  onQuery,
  sort,
  onSort,
}: {
  query: string;
  onQuery: (s: string) => void;
  sort: SortKey;
  onSort: (k: SortKey) => void;
}) {
  return (
    <View style={styles.wrap}>
      <TextInput
        value={query}
        onChangeText={onQuery}
        placeholder="Search company, role, recruiter…"
        placeholderTextColor={colors.muted}
        style={styles.input}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
        {SORTS.map(({ key, label }) => {
          const on = key === sort;
          return (
            <Pressable key={key} onPress={() => onSort(key)} style={[styles.pill, on && styles.pillOn]}>
              <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingTop: 14 },
  input: {
    backgroundColor: colors.element,
    borderWidth: 1,
    borderColor: colors.element,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    color: colors.textHigh,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  sorts: { gap: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.element,
    borderWidth: 1,
    borderColor: colors.element,
  },
  pillOn: { borderColor: alpha(colors.emerald, 0.5), backgroundColor: alpha(colors.emerald, 0.08) },
  pillText: { fontFamily: fonts.sans, fontSize: 12, color: colors.textBase },
  pillTextOn: { color: colors.emerald },
});
