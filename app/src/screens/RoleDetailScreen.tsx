import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { colors, alpha, fonts, tierColor } from '../theme';
import { statusColor, type Role, type Status } from '../model';
import { DraftModal } from './DraftModal';

const STATUSES: Status[] = [
  'Not Applied',
  'Applied',
  'Recruiter Screen',
  'Hiring Manager',
  'Panel',
  'Offer',
  'Rejected',
  'Archived',
];

type EditablePatch = Partial<Pick<Role, 'next' | 'recruiter' | 'notes' | 'salary' | 'location'>>;

// Read-only fact row.
function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

// Editable tracking field — persists on blur via onSave.
function EditField({
  label,
  value,
  field,
  onSave,
  multiline,
}: {
  label: string;
  value?: string;
  field: keyof EditablePatch;
  onSave: (patch: EditablePatch) => void;
  multiline?: boolean;
}) {
  const [v, setV] = useState(value ?? '');
  return (
    <View style={styles.editRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={v}
        onChangeText={setV}
        onEndEditing={() => onSave({ [field]: v.trim() || undefined } as EditablePatch)}
        placeholder="—"
        placeholderTextColor={colors.muted}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

export function RoleDetailScreen({
  role,
  onBack,
  onStatusChange,
  onUpdate,
  onDelete,
  onOpenPosting,
}: {
  role: Role;
  onBack: () => void;
  onStatusChange: (s: Status) => void;
  onUpdate: (patch: EditablePatch) => void;
  onDelete: () => void;
  onOpenPosting: (url: string) => void;
}) {
  const c = tierColor(role.tier);
  const [showDraft, setShowDraft] = useState(false);
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} hitSlop={8} style={styles.back}>
        <Text style={styles.backText}>‹ Back</Text>
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

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SET STATUS</Text>
        <View style={styles.chips}>
          {STATUSES.map((s) => {
            const on = s === role.status;
            const sc = statusColor(s);
            return (
              <Pressable
                key={s}
                onPress={() => onStatusChange(s)}
                style={[styles.chip, on && { borderColor: sc, backgroundColor: alpha(sc, 0.12) }]}
              >
                <Text style={[styles.chipText, on && { color: sc }]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>TRACKING</Text>
        <View style={styles.card}>
          <EditField label="Recruiter" value={role.recruiter} field="recruiter" onSave={onUpdate} />
          <EditField label="Next action" value={role.next} field="next" onSave={onUpdate} />
          <EditField label="Notes" value={role.notes} field="notes" onSave={onUpdate} multiline />
        </View>
      </View>

      <View style={styles.card}>
        <Field label="Salary" value={role.salary} />
        <Field label="Location" value={role.location} />
        <Field label="Applied" value={role.applied} />
        <Field label="Added" value={role.age} />
      </View>

      {role.link ? (
        <Pressable style={styles.linkBtn} onPress={() => onOpenPosting(role.link as string)}>
          <Text style={styles.linkBtnText}>Open posting · apply-assist</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.draftBtn} onPress={() => setShowDraft(true)}>
        <Text style={styles.draftBtnText}>Draft application text · AI</Text>
      </Pressable>

      <Pressable style={styles.deleteBtn} onPress={onDelete}>
        <Text style={styles.deleteText}>Delete role</Text>
      </Pressable>

      <DraftModal visible={showDraft} company={role.company} role={role.role} onClose={() => setShowDraft(false)} />
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
  section: { gap: 8 },
  sectionLabel: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '500', letterSpacing: 2, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.element,
    borderWidth: 1,
    borderColor: colors.element,
  },
  chipText: { fontFamily: fonts.sans, fontSize: 12, color: colors.textBase },
  card: { backgroundColor: colors.element, borderRadius: 14, padding: 4 },
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
  editRow: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: alpha(colors.canvas, 0.5), gap: 4 },
  input: { fontFamily: fonts.sans, fontSize: 14, color: colors.textHigh, padding: 0 },
  inputMultiline: { minHeight: 54, textAlignVertical: 'top' },
  linkBtn: { backgroundColor: colors.emerald, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  linkBtnText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: colors.canvas },
  draftBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: alpha(colors.emerald, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.emerald, 0.4),
  },
  draftBtnText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.emerald },
  deleteBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: alpha(colors.danger, 0.4),
  },
  deleteText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '500', color: colors.danger },
});
