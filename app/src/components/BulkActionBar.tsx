import { View, Text, Pressable, StyleSheet } from 'react-native';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import type { Status } from '../model';

// Bottom bar shown in bulk-select mode: applies one status to all selected roles.
const ACTIONS: { status: Status; label: string }[] = [
  { status: 'Applied', label: 'Applied' },
  { status: 'Rejected', label: 'Rejected' },
  { status: 'Archived', label: 'Archive' },
];

export function BulkActionBar({ count, onStatus }: { count: number; onStatus: (s: Status) => void }) {
  const { styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.bar}>
      <Text style={styles.count}>{count} selected</Text>
      <View style={styles.actions}>
        {ACTIONS.map((a) => (
          <Pressable key={a.status} style={styles.action} onPress={() => onStatus(a.status)} disabled={count === 0}>
            <Text style={[styles.actionText, count === 0 && styles.actionDisabled]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: c.element,
    borderTopWidth: 1,
    borderTopColor: alpha(c.muted, 0.25),
  },
  count: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.textHigh },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: alpha(c.active, 0.12),
    borderWidth: 1,
    borderColor: alpha(c.active, 0.5),
  },
  actionText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.active },
  actionDisabled: { color: c.muted },
});
