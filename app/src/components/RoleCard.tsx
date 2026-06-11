import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { Tier } from '@reqon/core';
import { colors, tierColor, alpha, tracking, fonts } from '../theme';

export interface PipelineRole {
  id: string;
  role: string;
  company: string;
  tier: Tier;
  score: number; // 0–10 (expected value)
  age: string; // e.g. "2h ago"
  status?: string; // footer status label
  action?: string; // footer action label
}

// Tier-scored pipeline card (BRAND "Today's Perimeter" design): left edge + badge in the tier
// color; Tier C is suppressed (dimmed, struck through, no footer) to keep the workspace clean.
export function RoleCard({ role }: { role: PipelineRole }) {
  const c = tierColor(role.tier);
  const suppressed = role.tier === 'C';

  return (
    <View style={[styles.card, { borderLeftColor: c }, suppressed && styles.cardSuppressed]}>
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
          <Text style={[styles.tierBadge, { color: c, backgroundColor: alpha(c, 0.1) }]}>
            TIER {role.tier}
          </Text>
          <Text style={styles.scoreText}>Score: {role.score.toFixed(1)}/10</Text>
        </View>
        <Text style={styles.age}>{role.age}</Text>
      </View>

      <Text style={[styles.title, suppressed && styles.titleSuppressed]}>{role.role}</Text>
      <Text style={[styles.company, suppressed && styles.companySuppressed]}>{role.company}</Text>

      {!suppressed && (role.status || role.action) ? (
        <View style={styles.footer}>
          {role.status ? (
            <View style={styles.statusWrap}>
              <View style={[styles.dot, { backgroundColor: c }]} />
              <Text style={styles.statusText}>{role.status}</Text>
            </View>
          ) : (
            <View />
          )}
          {role.action ? (
            <Pressable hitSlop={6}>
              <Text style={[styles.action, { color: c }]}>{role.action} →</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.element,
    borderLeftWidth: 4,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    padding: 20,
  },
  cardSuppressed: { backgroundColor: alpha(colors.element, 0.4), opacity: 0.6 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tierBadge: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  scoreText: { fontSize: 12, color: colors.muted },
  age: { fontSize: 12, color: colors.muted },
  title: { fontFamily: fonts.sans, fontSize: 18, fontWeight: '500', color: colors.textHigh, paddingTop: 6 },
  titleSuppressed: { color: colors.textBase, textDecorationLine: 'line-through' },
  company: { fontSize: 14, color: colors.textBase, marginTop: 2 },
  companySuppressed: { color: colors.muted },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: alpha(colors.canvas, 0.5),
  },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, color: colors.muted },
  action: { fontSize: 12, fontWeight: '500', letterSpacing: tracking.command * 0.15 },
});
