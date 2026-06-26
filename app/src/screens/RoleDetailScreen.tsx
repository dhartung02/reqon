import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Linking } from 'react-native';
import { alpha, fonts, tierColor, useThemedStyles, type Palette } from '../theme';
import { statusColor, type Role, type Status } from '../model';
import { explainScore, type RationaleTone } from '../scout/explain';
import { DraftModal } from './DraftModal';
import { GuideModal } from './GuideModal';
import { ScoreModal } from './ScoreModal';

const INTERVIEW_STATUSES = ['Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer'];

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

type EditablePatch = Partial<Pick<Role, 'next' | 'recruiter' | 'notes' | 'salary' | 'location' | 'fit' | 'prob'>>;

// Read-only fact row.
function Field({ label, value }: { label: string; value?: string }) {
  const { styles } = useThemedStyles(makeStyles);
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
  const { c, styles } = useThemedStyles(makeStyles);
  const [v, setV] = useState(value ?? '');
  return (
    <View style={styles.editRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={v}
        onChangeText={setV}
        onEndEditing={() => onSave({ [field]: v.trim() || undefined } as EditablePatch)}
        placeholder="—"
        placeholderTextColor={c.muted}
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
  onBuildCv,
  embedded = false,
}: {
  role: Role;
  onBack: () => void;
  onStatusChange: (s: Status) => void;
  onUpdate: (patch: EditablePatch) => void;
  onDelete: () => void;
  onOpenPosting: (url: string) => void;
  onBuildCv: (role: Role) => void;
  embedded?: boolean;
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  const accent = tierColor(role.tier, c);
  const [showDraft, setShowDraft] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const toneColor: Record<RationaleTone, string> = { good: c.emerald, bad: c.danger, neutral: c.muted };
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {embedded ? null : (
        <Pressable onPress={onBack} hitSlop={8} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
      )}

      <View style={styles.head}>
        <View style={styles.badgeRow}>
          <Text style={[styles.tierBadge, { color: accent, backgroundColor: alpha(accent, 0.1) }]}>TIER {role.tier}</Text>
          <Text style={styles.score}>EV {role.score.toFixed(1)} · fit {role.fit} / prob {role.prob}</Text>
        </View>
        <Text style={styles.role}>{role.role}</Text>
        <Text style={styles.company}>{role.company}</Text>
        <View style={styles.statusWrap}>
          <View style={[styles.dot, { backgroundColor: statusColor(role.status, c) }]} />
          <Text style={[styles.statusText, { color: statusColor(role.status, c) }]}>{role.status}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.scoreHead}>
          <Text style={styles.sectionLabel}>WHY THIS SCORE</Text>
          <Pressable onPress={() => setShowScore(true)} hitSlop={8}><Text style={styles.rescore}>Re-score · AI</Text></Pressable>
        </View>
        {explainScore(role).map((line) => (
          <View key={line.text} style={styles.whyRow}>
            <View style={[styles.whyDot, { backgroundColor: toneColor[line.tone] }]} />
            <Text style={styles.whyText}>{line.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SET STATUS</Text>
        <View style={styles.chips}>
          {STATUSES.map((s) => {
            const on = s === role.status;
            const sc = statusColor(s, c);
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
        <>
          <Pressable style={styles.linkBtn} onPress={() => onOpenPosting(role.link as string)}>
            <Text style={styles.linkBtnText}>Open posting · apply-assist</Text>
          </Pressable>
          <Pressable style={styles.draftBtn} onPress={() => Linking.openURL(role.link as string)}>
            <Text style={styles.draftBtnText}>Open in browser ↗</Text>
          </Pressable>
        </>
      ) : null}

      <Pressable style={styles.draftBtn} onPress={() => setShowDraft(true)}>
        <Text style={styles.draftBtnText}>Draft application text · AI</Text>
      </Pressable>

      {INTERVIEW_STATUSES.includes(role.status) ? (
        <Pressable style={styles.draftBtn} onPress={() => setShowGuide(true)}>
          <Text style={styles.draftBtnText}>Interview prep guide · AI</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.draftBtn} onPress={() => onBuildCv(role)}>
        <Text style={styles.draftBtnText}>Build CV tailored to this role</Text>
      </Pressable>

      <Pressable style={styles.deleteBtn} onPress={onDelete}>
        <Text style={styles.deleteText}>Delete role</Text>
      </Pressable>

      <DraftModal visible={showDraft} company={role.company} role={role.role} onClose={() => setShowDraft(false)} />
      <GuideModal visible={showGuide} company={role.company} role={role.role} onClose={() => setShowGuide(false)} />
      <ScoreModal visible={showScore} role={role} onApply={(fit, prob) => onUpdate({ fit, prob })} onClose={() => setShowScore(false)} />
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  scroll: { padding: 24, gap: 18 },
  back: { paddingVertical: 4 },
  backText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: c.emerald },
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
  score: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  role: { fontFamily: fonts.serif, fontSize: 24, fontWeight: '600', color: c.textHigh, marginTop: 2 },
  company: { fontFamily: fonts.sans, fontSize: 15, color: c.textBase },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500' },
  section: { gap: 8 },
  sectionLabel: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '500', letterSpacing: 2, color: c.muted },
  scoreHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rescore: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.emerald },
  whyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  whyDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  whyText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: c.textBase, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: c.element,
    borderWidth: 1,
    borderColor: c.element,
  },
  chipText: { fontFamily: fonts.sans, fontSize: 12, color: c.textBase },
  card: { backgroundColor: c.element, borderRadius: 14, padding: 4 },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: alpha(c.canvas, 0.5),
  },
  fieldLabel: { fontFamily: fonts.sans, fontSize: 13, color: c.muted },
  fieldValue: { fontFamily: fonts.sans, fontSize: 14, color: c.textHigh, flexShrink: 1, textAlign: 'right' },
  editRow: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: alpha(c.canvas, 0.5), gap: 4 },
  input: { fontFamily: fonts.sans, fontSize: 14, color: c.textHigh, padding: 0 },
  inputMultiline: { minHeight: 54, textAlignVertical: 'top' },
  linkBtn: { backgroundColor: c.emerald, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  linkBtnText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: c.canvas },
  draftBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: alpha(c.emerald, 0.1),
    borderWidth: 1,
    borderColor: alpha(c.emerald, 0.4),
  },
  draftBtnText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.emerald },
  deleteBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: alpha(c.danger, 0.4),
  },
  deleteText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '500', color: c.danger },
});
