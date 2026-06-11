import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { colors, alpha, fonts, tierColor } from '../theme';
import { statusColor, type Role } from '../model';

// Row detail: all tracking fields for a role. Read-only in M2; inline editing + status changes
// (writing through to the local store) land with M3.
function Field({ label, value, accent }: { label: string; value?: string; accent?: string }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

export function RoleDetailScreen({ role, onBack }: { role: Role; onBack: () => void }) {
  const c = tierColor(role.tier);
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.back}>
        <Text style={styles.backText}>‹ Pipeline</Text>
      </Pressable>

      <View style={styles.head}>
        <View style={styles.badgeRow}>
          <Text style={[styles.tierBadge, { color: c, backgroundColor: alpha(c, 0.1) }]}>TIER {role.tier}</Text>
          <Text style={styles.score}>EV {role.score.toFixed(1)} · fit {role.fit} / prob {role.prob}</Text>
        </View>
        <Text style={styles.role}>{role.role}</Text>
        <Text style={styles.company}>{role.company}</Text>
        <View style={styles.statusWrap}>
          <View style={[styles.dot, { backgroundColor: statusColor(role.status) }]} />
          <Text style={[styles.statusText, { color: statusColor(role.status) }]}>{role.status}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Field label="Salary" value={role.salary} />
        <Field label="Location" value={role.location} />
        <Field label="Applied" value={role.applied} />
        <Field label="Recruiter" value={role.recruiter} />
        <Field label="Next action" value={role.next} accent={colors.emerald} />
        <Field label="Notes" value={role.notes} />
        <Field label="Added" value={role.age} />
      </View>

      {role.link ? (
        <Pressable style={styles.linkBtn} onPress={() => Linking.openURL(role.link as string)}>
          <Text style={styles.linkBtnText}>Open posting</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 24, gap: 18 },
  back: { paddingVertical: 4 },
  backText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: colors.emerald },
  head: { gap: 6 },
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
  score: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  role: { fontFamily: fonts.serif, fontSize: 24, fontWeight: '600', color: colors.textHigh, marginTop: 2 },
  company: { fontFamily: fonts.sans, fontSize: 15, color: colors.textBase },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500' },
  card: {
    backgroundColor: colors.element,
    borderRadius: 14,
    padding: 4,
  },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.canvas, 0.5),
  },
  fieldLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  fieldValue: { fontFamily: fonts.sans, fontSize: 14, color: colors.textHigh, flexShrink: 1, textAlign: 'right' },
  linkBtn: {
    backgroundColor: colors.emerald,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  linkBtnText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: colors.canvas },
});
