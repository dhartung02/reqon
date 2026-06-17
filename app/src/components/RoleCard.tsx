import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { alpha, fonts, tierColor, useThemedStyles, type Palette } from '../theme';
import { statusColor, type Role } from '../model';
import { remoteBadge, type RationaleTone } from '../scout/explain';

// Tier-scored pipeline card: left edge + badge in the tier color, score, title, company, and a
// status pill. Tappable → row detail (or toggles selection in bulk-select mode). Tier C is dimmed.
export function RoleCard({ role, onPress, selectable = false, selected = false }: { role: Role; onPress?: () => void; selectable?: boolean; selected?: boolean }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const accent = tierColor(role.tier, c);
  const sc = statusColor(role.status, c);
  const suppressed = role.tier === 'C';
  const remote = remoteBadge(role.location);
  const toneColor: Record<RationaleTone, string> = { good: c.emerald, bad: c.danger, neutral: c.muted };
  const salary = role.salary?.trim();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: accent },
        suppressed && styles.cardSuppressed,
        selected && styles.cardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
          {selectable ? (
            <View style={[styles.check, selected && styles.checkOn]}>
              {selected ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
          ) : null}
          <Text style={[styles.tierBadge, { color: accent, backgroundColor: alpha(accent, 0.1) }]}>TIER {role.tier}</Text>
          <Text style={styles.scoreText}>Score: {role.score.toFixed(1)}/10</Text>
        </View>
        <Text style={styles.age}>{role.age}</Text>
      </View>

      <Text style={[styles.title, suppressed && styles.titleSuppressed]}>{role.role}</Text>
      <Text style={[styles.company, suppressed && styles.companySuppressed]}>{role.company}</Text>

      {remote || salary ? (
        <View style={styles.meta}>
          {remote ? (
            <View style={[styles.remoteChip, { borderColor: alpha(toneColor[remote.tone], 0.4) }]}>
              <View style={[styles.dot, { backgroundColor: toneColor[remote.tone] }]} />
              <Text style={[styles.remoteText, { color: toneColor[remote.tone] }]}>{remote.label}</Text>
            </View>
          ) : null}
          {salary ? <Text style={styles.salary} numberOfLines={1}>{salary}</Text> : null}
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.statusWrap}>
          <View style={[styles.dot, { backgroundColor: sc }]} />
          <Text style={[styles.statusText, { color: sc }]}>{role.status}</Text>
        </View>
        <View style={styles.footerRight}>
          {role.link ? (
            <Pressable
              onPress={() => Linking.openURL(role.link as string)}
              hitSlop={8}
              style={({ pressed }) => [styles.openBtn, pressed && styles.pressed]}
              accessibilityLabel="Open the original listing"
            >
              <Text style={styles.openText}>Open ↗</Text>
            </Pressable>
          ) : null}
          <Text style={styles.chev}>›</Text>
        </View>
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  card: {
    backgroundColor: c.element,
    borderLeftWidth: 4,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardSuppressed: { backgroundColor: alpha(c.element, 0.4), opacity: 0.6 },
  cardSelected: { backgroundColor: alpha(c.emerald, 0.1) },
  pressed: { opacity: 0.85 },
  check: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: c.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { borderColor: c.emerald, backgroundColor: c.emerald },
  checkMark: { fontSize: 12, fontWeight: '700', color: c.canvas, lineHeight: 14 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tierBadge: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  scoreText: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  age: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  title: { fontFamily: fonts.sans, fontSize: 16, fontWeight: '500', color: c.textHigh, paddingTop: 3 },
  titleSuppressed: { color: c.textBase, textDecorationLine: 'line-through' },
  company: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase, marginTop: 2 },
  companySuppressed: { color: c.muted },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  remoteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  remoteText: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '600' },
  salary: { flex: 1, fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: alpha(c.canvas, 0.5),
  },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  openBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: alpha(c.muted, 0.5),
  },
  openText: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '600', color: c.textBase },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '500' },
  chev: { fontSize: 20, color: c.muted, lineHeight: 20 },
});
