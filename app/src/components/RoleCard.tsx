import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { alpha, fonts, tierColor, useThemedStyles, type Palette } from '../theme';
import { statusColor, tierWord, type Role } from '../model';
import { remoteBadge, type RationaleTone } from '../scout/explain';
import { ScoreCircle } from './ScoreCircle';

// Pipeline card: the fit dial (score circle + match-strength word) on the left, then company,
// role, a status pill, and the original link. Tappable → row detail (or toggles selection in
// bulk-select mode). Long-shot (tier C) rows are gently de-emphasized.
export function RoleCard({ role, onPress, selectable = false, selected = false, active = false }: { role: Role; onPress?: () => void; selectable?: boolean; selected?: boolean; active?: boolean }) {
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
      accessibilityRole="button"
      accessibilityLabel={`${role.role} at ${role.company}. ${tierWord(role.tier)} match, score ${role.score.toFixed(1)}, status ${role.status}.`}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: accent },
        suppressed && styles.cardSuppressed,
        active && styles.cardActive,
        selected && styles.cardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.row}>
        {selectable ? (
          <View style={[styles.check, selected && styles.checkOn]}>
            {selected ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
        ) : null}
        <ScoreCircle score={role.score} tier={role.tier} />
        <View style={styles.body}>
          <View style={styles.topRow}>
            <Text style={[styles.title, suppressed && styles.titleSuppressed]} numberOfLines={2}>{role.role}</Text>
            <Text style={styles.age}>{role.age}</Text>
          </View>
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
  cardSuppressed: { opacity: 0.82 },
  // master-detail: the row whose detail is currently open in the side pane (iPad)
  cardActive: { backgroundColor: alpha(c.emerald, 0.16), opacity: 1 },
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
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  body: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  age: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  title: { flex: 1, fontFamily: fonts.sans, fontSize: 16, fontWeight: '500', color: c.textHigh },
  titleSuppressed: { color: c.textBase },
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
