import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Linking, Alert } from 'react-native';
import { alpha, fonts, tierColor, useThemedStyles, type Palette } from '../theme';
import { statusColor, tierWord, SECTORS, REMOTE_MODES, type Role, type Status } from '../model';
import { explainScore, remoteBadge, type RationaleTone } from '../scout/explain';
import { ScoreCircle } from '../components/ScoreCircle';
import { useEntitlements } from '../entitlements';
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

type EditablePatch = Partial<Pick<Role,
  | 'next' | 'recruiter' | 'notes' | 'salary' | 'location' | 'fit' | 'prob'
  | 'interview' | 'followup' | 'thankYouSent' | 'cover' | 'resume' | 'referral'
  | 'recruiterEmail' | 'sector' | 'remote' | 'rejectionStage' | 'rejectionReason' | 'rejectionFeedback'>>;

const todayIso = () => new Date().toISOString().slice(0, 10);

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
  placeholder,
}: {
  label: string;
  value?: string;
  field: keyof EditablePatch;
  onSave: (patch: EditablePatch) => void;
  multiline?: boolean;
  placeholder?: string;
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
        placeholder={placeholder ?? '—'}
        placeholderTextColor={c.muted}
        multiline={multiline}
        autoCapitalize={field === 'recruiterEmail' ? 'none' : 'sentences'}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

// Enum picker (sector / remote) — tap a chip to set, tap the active one to clear.
function ChipPicker({
  label,
  value,
  field,
  options,
  onSave,
}: {
  label: string;
  value?: string;
  field: keyof EditablePatch;
  options: readonly string[];
  onSave: (patch: EditablePatch) => void;
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.pickRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pickChips}>
        {options.map((o) => {
          const on = (value || '').toLowerCase() === o.toLowerCase();
          return (
            <Pressable
              key={o}
              onPress={() => onSave({ [field]: on ? undefined : o } as EditablePatch)}
              style={[styles.pick, on && { borderColor: c.active, backgroundColor: alpha(c.active, 0.12) }]}
            >
              <Text style={[styles.pickText, on && { color: c.active }]}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Thank-you-sent toggle — stamps today's date when checked (suppresses the thank-you action item),
// clears it when unchecked. Mirrors the web board's checkbox + date stamp.
function ThankYouToggle({ value, onSave }: { value?: string; onSave: (patch: EditablePatch) => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const sent = !!value;
  return (
    <Pressable style={styles.editRow} onPress={() => onSave({ thankYouSent: sent ? undefined : todayIso() })}>
      <Text style={styles.fieldLabel}>Thank-you sent</Text>
      <View style={styles.toggleRow}>
        <View style={[styles.checkbox, sent && { backgroundColor: c.emerald, borderColor: c.emerald }]}>
          {sent ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.toggleText}>{sent ? `Sent ${value}` : 'Not sent — tap to stamp today'}</Text>
      </View>
    </Pressable>
  );
}

// Saved → Applied → Interviewing → Offer stepper. Current node is emerald + glow, completed
// nodes/segments emerald, upcoming dimmed. Rejected/Archived have no active node (idx -1).
const TRACK_STEPS = ['Saved', 'Applied', 'Interviewing', 'Offer'];
function ProgressTrack({ status }: { status: Status }) {
  const { styles } = useThemedStyles(makeStyles);
  const idx =
    status === 'Not Applied' ? 0 : status === 'Applied' ? 1 : INTERVIEW_STATUSES.includes(status) && status !== 'Offer' ? 2 : status === 'Offer' ? 3 : -1;
  return (
    <View style={styles.track}>
      {TRACK_STEPS.map((label, i) => {
        const done = idx >= 0 && i <= idx;
        return (
          <View key={label} style={styles.trackCol}>
            <View style={styles.nodeRow}>
              {i > 0 ? <View style={[styles.seg, done && styles.segOn]} /> : <View style={styles.segSpacer} />}
              <View style={[styles.node, done && styles.nodeOn, i === idx && styles.nodeCurrent]} />
              {i < TRACK_STEPS.length - 1 ? <View style={[styles.seg, idx >= 0 && i < idx && styles.segOn]} /> : <View style={styles.segSpacer} />}
            </View>
            <Text style={[styles.trackLabel, done && styles.trackLabelOn]} numberOfLines={1}>{label}</Text>
          </View>
        );
      })}
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
  const remote = remoteBadge(role.location)?.label;
  const salary = role.salary?.trim();
  const ent = useEntitlements();
  const [showDraft, setShowDraft] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const toneColor: Record<RationaleTone, string> = { good: c.emerald, bad: c.danger, neutral: c.muted };
  // AI features are gated by the AI package; tap a locked one → an upgrade prompt instead.
  const gateAI = (feature: string, open: () => void) => () => {
    if (ent.has(feature)) open();
    else Alert.alert('AI package required', `This uses AI — available on the ${ent.requires(feature)} package. Upgrade in Settings.`);
  };
  const canScore = ent.has('ai_score');
  const canDraft = ent.has('ai_draft');
  const canGuide = ent.has('guide_generate');
  const lockTag = (ok: boolean) => (ok ? '' : ' 🔒');
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {embedded ? null : (
        <Pressable onPress={onBack} hitSlop={8} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
      )}

      <View style={styles.hero}>
        <ScoreCircle score={role.score} tier={role.tier} size={88} />
        <Text style={[styles.heroWord, { color: accent }]}>{tierWord(role.tier)} match</Text>
        <Text style={styles.role}>{role.role}</Text>
        <Text style={styles.company}>{role.company}{remote ? ` · ${remote}` : ''}</Text>
        <View style={styles.heroChips}>
          {salary ? <Text style={styles.heroChip}>{salary}</Text> : null}
          <View style={styles.statusChip}>
            <View style={[styles.dot, { backgroundColor: statusColor(role.status, c) }]} />
            <Text style={[styles.statusText, { color: statusColor(role.status, c) }]}>{role.status}</Text>
          </View>
        </View>
      </View>

      <ProgressTrack status={role.status} />

      {role.next ? (
        <View style={styles.nextCard}>
          <Text style={styles.nextLabel}>NEXT</Text>
          <Text style={styles.nextText}>{role.next}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.scoreHead}>
          <Text style={styles.h3}>Why it fits</Text>
          <Pressable onPress={gateAI('ai_score', () => setShowScore(true))} hitSlop={8}><Text style={[styles.rescore, !canScore && styles.lockedText]}>Re-score · AI{lockTag(canScore)}</Text></Pressable>
        </View>
        <View style={styles.whyCard}>
          {explainScore(role).map((line) => (
            <View key={line.text} style={styles.whyRow}>
              <View style={[styles.whyDot, { backgroundColor: toneColor[line.tone] }]} />
              <Text style={styles.whyText}>{line.text}</Text>
            </View>
          ))}
        </View>
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
          <EditField label="Recruiter email" value={role.recruiterEmail} field="recruiterEmail" onSave={onUpdate} />
          <EditField label="Referral" value={role.referral} field="referral" onSave={onUpdate} />
          <EditField label="Next action" value={role.next} field="next" onSave={onUpdate} />
          <EditField label="Notes" value={role.notes} field="notes" onSave={onUpdate} multiline />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>DATES</Text>
        <View style={styles.card}>
          <EditField label="Follow-up due" value={role.followup} field="followup" onSave={onUpdate} placeholder="YYYY-MM-DD" />
          <EditField label="Interview date" value={role.interview} field="interview" onSave={onUpdate} placeholder="YYYY-MM-DD" />
          {INTERVIEW_STATUSES.includes(role.status) ? <ThankYouToggle value={role.thankYouSent} onSave={onUpdate} /> : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>DETAILS</Text>
        <View style={styles.card}>
          <ChipPicker label="Sector" value={role.sector} field="sector" options={SECTORS} onSave={onUpdate} />
          <ChipPicker label="Remote" value={role.remote} field="remote" options={REMOTE_MODES} onSave={onUpdate} />
          <EditField label="Cover letter" value={role.cover} field="cover" onSave={onUpdate} />
          <EditField label="Résumé version" value={role.resume} field="resume" onSave={onUpdate} />
          <EditField label="Salary" value={role.salary} field="salary" onSave={onUpdate} />
          <EditField label="Location" value={role.location} field="location" onSave={onUpdate} />
        </View>
      </View>

      {role.status === 'Rejected' ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>REJECTION FEEDBACK</Text>
          <View style={styles.card}>
            <EditField label="Stage" value={role.rejectionStage} field="rejectionStage" onSave={onUpdate} />
            <EditField label="Reason" value={role.rejectionReason} field="rejectionReason" onSave={onUpdate} />
            <EditField label="Feedback" value={role.rejectionFeedback} field="rejectionFeedback" onSave={onUpdate} multiline />
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
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

      <Pressable style={[styles.draftBtn, !canDraft && styles.draftBtnLocked]} onPress={gateAI('ai_draft', () => setShowDraft(true))}>
        <Text style={styles.draftBtnText}>Draft application text · AI{lockTag(canDraft)}</Text>
      </Pressable>

      {INTERVIEW_STATUSES.includes(role.status) ? (
        <Pressable style={[styles.draftBtn, !canGuide && styles.draftBtnLocked]} onPress={gateAI('guide_generate', () => setShowGuide(true))}>
          <Text style={styles.draftBtnText}>Interview prep guide · AI{lockTag(canGuide)}</Text>
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
  hero: { alignItems: 'center', gap: 8, paddingVertical: 6 },
  heroWord: { fontFamily: fonts.sans, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  role: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: c.textHigh, textAlign: 'center' },
  company: { fontFamily: fonts.sans, fontSize: 15, color: c.textBase, textAlign: 'center' },
  heroChips: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  heroChip: { fontFamily: fonts.sans, fontSize: 12, color: c.textBase, backgroundColor: c.element, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.element, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500' },
  // progress track: Saved → Applied → Interviewing → Offer
  track: { flexDirection: 'row' },
  trackCol: { flex: 1, alignItems: 'center', gap: 6 },
  nodeRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  seg: { flex: 1, height: 2, backgroundColor: alpha(c.textBase, 0.25) },
  segSpacer: { flex: 1, height: 2 },
  segOn: { backgroundColor: c.emerald },
  node: { width: 12, height: 12, borderRadius: 6, backgroundColor: alpha(c.textBase, 0.25) },
  nodeOn: { backgroundColor: c.emerald },
  nodeCurrent: { shadowColor: c.emerald, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  trackLabel: { fontFamily: fonts.sans, fontSize: 11, color: c.muted },
  trackLabelOn: { color: c.textHigh, fontWeight: '600' },
  // next card + section headings + why card
  nextCard: { backgroundColor: c.element, borderRadius: 14, padding: 14, borderLeftWidth: 3, borderLeftColor: c.emerald, gap: 3 },
  nextLabel: { fontFamily: fonts.sans, fontSize: 10, fontWeight: '700', letterSpacing: 1, color: c.emerald },
  nextText: { fontFamily: fonts.sans, fontSize: 15, color: c.textHigh, lineHeight: 21 },
  h3: { fontFamily: fonts.serif, fontSize: 17, fontWeight: '600', color: c.textHigh },
  whyCard: { backgroundColor: c.element, borderRadius: 14, padding: 14, gap: 10 },
  section: { gap: 8 },
  sectionLabel: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '500', letterSpacing: 2, color: c.muted },
  scoreHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rescore: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.emerald },
  lockedText: { color: c.muted },
  draftBtnLocked: { opacity: 0.5 },
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
  pickRow: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: alpha(c.canvas, 0.5), gap: 8 },
  pickChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pick: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: c.canvas, borderWidth: 1, borderColor: c.element },
  pickText: { fontFamily: fonts.sans, fontSize: 12, color: c.textBase },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: c.muted, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: c.canvas, fontSize: 13, fontWeight: '800' },
  toggleText: { fontFamily: fonts.sans, fontSize: 13, color: c.textBase, flexShrink: 1 },
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
