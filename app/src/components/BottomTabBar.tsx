import { View, Text, Pressable, StyleSheet } from 'react-native';
import { fonts, useThemedStyles, type Palette } from '../theme';

export type Section = 'today' | 'board' | 'insights' | 'settings';

const ITEMS: { key: Section; label: string; icon: string }[] = [
  { key: 'today', label: 'Today', icon: '◎' },
  { key: 'board', label: 'Board', icon: '▦' },
  { key: 'insights', label: 'Insights', icon: '◔' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
];

// Phone bottom navigation: the four top-level sections. Active item in emerald; extra bottom
// padding clears the home indicator. Board hosts the status-lane sub-row; Settings opens the modal.
export function BottomTabBar({ active, onChange }: { active: Section; onChange: (s: Section) => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.bar}>
      {ITEMS.map((it) => {
        const on = it.key === active;
        const color = on ? c.emerald : c.muted;
        return (
          <Pressable
            key={it.key}
            style={styles.item}
            onPress={() => onChange(it.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.label}
          >
            <Text style={[styles.icon, { color }]}>{it.icon}</Text>
            <Text style={[styles.label, { color }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    bar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.element, paddingTop: 8, paddingBottom: 26, backgroundColor: c.canvas },
    item: { flex: 1, alignItems: 'center', gap: 3 },
    icon: { fontSize: 20, lineHeight: 22 },
    label: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '600' },
  });
