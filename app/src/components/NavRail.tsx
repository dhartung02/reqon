import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import { ReqonGlyph } from './ReqonGlyph';
import { SettingsIcon } from './SettingsIcon';
import { LANES, type Lane } from '../model';

// Persistent left rail for the wide (iPad) layout — the vertical counterpart to the phone's
// top TabBar. Brand + lanes (with counts) + Add / Settings.
export function NavRail({
  active,
  counts,
  onChange,
  onAdd,
  onSettings,
}: {
  active: Lane;
  counts: Record<Lane, number>;
  onChange: (l: Lane) => void;
  onAdd: () => void;
  onSettings: () => void;
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.rail}>
      <View style={styles.brand}>
        <ReqonGlyph size={22} />
        <Text style={styles.word}>REQON</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.nav}>
        {LANES.map(({ key, label }) => {
          const on = key === active;
          return (
            <Pressable key={key} onPress={() => onChange(key)} style={[styles.item, on && styles.itemOn]}>
              <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>{label}</Text>
              <Text style={[styles.count, on && styles.labelOn]}>{counts[key] ?? 0}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.foot}>
        <Pressable style={styles.addBtn} onPress={onAdd}>
          <Text style={styles.addText}>+ Add role</Text>
        </Pressable>
        <Pressable style={styles.settingsRow} onPress={onSettings} hitSlop={10} accessibilityLabel="Settings & sync">
          <SettingsIcon size={16} color={c.textBase} />
          <Text style={styles.settings}>Settings</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  rail: { width: 150, backgroundColor: c.element, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingHorizontal: 4 },
  word: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '600', letterSpacing: 2.4, color: c.emerald },
  nav: { gap: 2 },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 9 },
  itemOn: { backgroundColor: alpha(c.emerald, 0.12) },
  label: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase },
  labelOn: { color: c.emerald, fontWeight: '600' },
  count: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  foot: { gap: 10, marginTop: 12 },
  addBtn: { borderWidth: 1, borderColor: alpha(c.emerald, 0.45), borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  addText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.emerald },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6 },
  settings: { fontFamily: fonts.sans, fontSize: 13, color: c.textBase },
});
