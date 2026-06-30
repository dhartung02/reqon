import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import { LANES, type Lane } from '../model';

// Horizontal lane pills (Today · Open · Applied · Interviewing · Closed) with counts — mirrors the
// board's top tabs. Active pill gets an emerald ring.
export function TabBar({
  active,
  counts,
  onChange,
  lanes = LANES,
}: {
  active: Lane;
  counts: Record<Lane, number>;
  onChange: (l: Lane) => void;
  lanes?: { key: Lane; label: string }[];
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={styles.row}
    >
      {lanes.map(({ key, label }) => {
        const on = key === active;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[styles.pill, on && styles.pillOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label}, ${counts[key] ?? 0} roles`}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{label}</Text>
            <Text style={[styles.count, on && styles.countOn]}>{counts[key] ?? 0}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  bar: { flexGrow: 0, flexShrink: 0 },
  row: { gap: 8, paddingVertical: 2, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: c.element,
    borderWidth: 1,
    borderColor: c.element,
  },
  pillOn: { borderColor: alpha(c.emerald, 0.5), backgroundColor: alpha(c.emerald, 0.08) },
  label: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '500', color: c.textBase },
  labelOn: { color: c.textHigh },
  count: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  countOn: { color: c.emerald },
});
