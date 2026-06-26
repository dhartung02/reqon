import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Modal } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import {
  pullProfile,
  pushProfile,
  uploadResume,
  draftSummary,
  EMPTY_PROFILE,
  EEO_OPTIONS,
  newAnswerId,
  type Profile,
  type EduEntry,
  type WorkEntry,
  type Narrative,
} from '../sync/profile';
import { NarrativeBuilderModal } from './NarrativeBuilderModal';

// Dropdown select (Modal-based; no extra deps). Used for the standard EEO self-ID answer sets.
function SelectField({ label, value, options, onChange }: { label: string; value?: string; options: readonly string[]; onChange: (v: string) => void }) {
  const { styles } = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const cur = value || '';
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.select} onPress={() => setOpen(true)}>
        <Text style={[styles.selectText, !cur && styles.selectPlaceholder]} numberOfLines={1}>{cur || 'Select…'}</Text>
        <Text style={styles.selectChev}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.optBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.optSheet}>
            <Text style={styles.optTitle}>{label}</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {['', ...options].map((opt) => (
                <Pressable key={opt || '(clear)'} style={styles.optRow} onPress={() => { onChange(opt); setOpen(false); }}>
                  <Text style={[styles.optText, opt === cur && styles.optTextOn]}>{opt || '— clear'}</Text>
                  {opt === cur ? <Text style={styles.optCheck}>✓</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// Field input helper.
function Field({ label, value, onChange, ...rest }: { label: string; value?: string; onChange: (v: string) => void } & Omit<Partial<React.ComponentProps<typeof TextInput>>, 'onChange' | 'value'>) {
  const { c, styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value ?? ''} onChangeText={onChange} placeholderTextColor={c.muted} style={styles.input} {...rest} />
    </View>
  );
}

const linesToArr = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export function ProfileScreen({ onBack }: { onBack: () => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const [p, setP] = useState<Profile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  const setNarrative = (i: number, k: keyof Narrative, v: string) =>
    setP((s) => ({ ...s, narratives: s.narratives.map((n, idx) => (idx === i ? { ...n, [k]: v } : n)) }));
  const addNarrative = (n: Narrative) => setP((s) => ({ ...s, narratives: [n, ...s.narratives] }));

  useEffect(() => {
    pullProfile().then((prof) => { setP(prof); setLoading(false); });
  }, []);

  const setApplicant = (k: keyof Profile['applicant'], v: string) => setP((s) => ({ ...s, applicant: { ...s.applicant, [k]: v } }));
  const setEeo = (k: keyof Profile['eeo'], v: string) => setP((s) => ({ ...s, eeo: { ...s.eeo, [k]: v } }));
  const setEdu = (i: number, k: keyof EduEntry, v: string) => setP((s) => ({ ...s, education: s.education.map((e, idx) => (idx === i ? { ...e, [k]: v } : e)) }));
  const setWork = (i: number, k: keyof WorkEntry, v: string) => setP((s) => ({ ...s, workHistory: s.workHistory.map((e, idx) => (idx === i ? { ...e, [k]: v } : e)) }));

  const save = async () => {
    setBusy(true);
    setStatus(null);
    const r = await pushProfile(p);
    setBusy(false);
    setStatus(r.ok ? { ok: true, text: 'Saved' } : { ok: false, text: r.error || 'Save failed' });
  };

  const runDraftSummary = async () => {
    setDrafting(true); setStatus(null);
    const r = await draftSummary();
    setDrafting(false);
    if (r.error) { setStatus({ ok: false, text: r.error }); return; }
    setP((s) => ({ ...s, summary: r.summary || '' }));
    setStatus({ ok: true, text: 'Summary drafted — review, then Save.' });
  };

  const pickResume = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setBusy(true);
    setStatus({ ok: true, text: `Parsing ${a.name}…` });
    const r = await uploadResume(a.uri, a.name);
    setBusy(false);
    if (r.ok && r.profile) { setP(r.profile); setStatus({ ok: true, text: 'Résumé parsed — review below.' }); }
    else setStatus({ ok: false, text: r.error || 'Parse failed' });
  };

  if (loading) {
    return (
      <View style={[styles.wrap, styles.center]}>
        <ActivityIndicator color={c.emerald} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.headRow}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹ Settings</Text>
        </Pressable>
        <Pressable onPress={save} hitSlop={10} disabled={busy}>
          <Text style={styles.save}>{busy ? '…' : 'Save'}</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>Profile</Text>

      <Pressable style={styles.resumeBtn} onPress={pickResume} disabled={busy}>
        <Text style={styles.resumeText}>Upload résumé · parse</Text>
      </Pressable>
      {status ? <Text style={[styles.status, { color: status.ok ? c.emerald : c.danger }]}>{status.text}</Text> : null}

      <Section title="BASICS">
        <Field label="Full name" value={p.applicant.name} onChange={(v) => setApplicant('name', v)} />
        <Field label="Email" value={p.applicant.email} onChange={(v) => setApplicant('email', v)} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Phone" value={p.applicant.phone} onChange={(v) => setApplicant('phone', v)} keyboardType="phone-pad" />
        <Field label="Location" value={p.applicant.location} onChange={(v) => setApplicant('location', v)} />
      </Section>

      <Section title="PROFESSIONAL SUMMARY">
        <Field label="Summary (top of CV · grounds AI)" value={p.summary} onChange={(v) => setP((s) => ({ ...s, summary: v }))} multiline style={[styles.input, styles.multi]} />
        <Pressable style={styles.draftBtn} onPress={runDraftSummary} disabled={drafting}>
          {drafting ? <ActivityIndicator size="small" color={c.emerald} /> : <Text style={styles.draftBtnText}>Draft from résumé · AI</Text>}
        </Pressable>
      </Section>

      <Section title="NARRATIVES" onAdd={() => addNarrative({ id: newAnswerId(), title: '', body: '', tags: [] })}>
        <Text style={styles.note}>Reusable proof-point stories the AI grounds cover notes, screening answers and tailoring in. Build them from your résumé, then reuse everywhere.</Text>
        <Pressable style={styles.draftBtn} onPress={() => setBuilderOpen(true)}>
          <Text style={styles.draftBtnText}>✨ Build from résumé · AI</Text>
        </Pressable>
        {p.narratives.map((n, i) => (
          <EntryCard key={n.id || i} onRemove={() => setP((s) => ({ ...s, narratives: s.narratives.filter((_, idx) => idx !== i) }))}>
            <Field label="Title" value={n.title} onChange={(v) => setNarrative(i, 'title', v)} />
            <Field label="Story" value={n.body} onChange={(v) => setNarrative(i, 'body', v)} multiline submitBehavior="newline" style={[styles.input, styles.multi]} />
          </EntryCard>
        ))}
      </Section>

      <ListSection title="SECTOR PREFERENCES" value={p.sectors} onChange={(a) => setP((s) => ({ ...s, sectors: a }))} />

      <Section title="LINKS">
        <Field label="LinkedIn URL" value={p.applicant.linkedin} onChange={(v) => setApplicant('linkedin', v)} autoCapitalize="none" />
        <Field label="GitHub URL" value={p.applicant.github} onChange={(v) => setApplicant('github', v)} autoCapitalize="none" />
        <Field label="Personal site / portfolio" value={p.applicant.website} onChange={(v) => setApplicant('website', v)} autoCapitalize="none" />
      </Section>

      <Section title="EDUCATION" onAdd={() => setP((s) => ({ ...s, education: [...s.education, {}] }))}>
        {p.education.map((e, i) => (
          <EntryCard key={i} onRemove={() => setP((s) => ({ ...s, education: s.education.filter((_, idx) => idx !== i) }))}>
            <Field label="University" value={e.school} onChange={(v) => setEdu(i, 'school', v)} />
            <Field label="Degree / level" value={e.level} onChange={(v) => setEdu(i, 'level', v)} />
            <Field label="Concentration / field" value={e.field} onChange={(v) => setEdu(i, 'field', v)} />
            <View style={styles.row2}>
              <Field label="Start" value={e.start} onChange={(v) => setEdu(i, 'start', v)} />
              <Field label="End" value={e.end} onChange={(v) => setEdu(i, 'end', v)} />
            </View>
          </EntryCard>
        ))}
      </Section>

      <Section title="WORK HISTORY" onAdd={() => setP((s) => ({ ...s, workHistory: [...s.workHistory, {}] }))}>
        {p.workHistory.map((w, i) => (
          <EntryCard key={i} onRemove={() => setP((s) => ({ ...s, workHistory: s.workHistory.filter((_, idx) => idx !== i) }))}>
            <Field label="Company" value={w.company} onChange={(v) => setWork(i, 'company', v)} />
            <Field label="Role" value={w.role} onChange={(v) => setWork(i, 'role', v)} />
            <Field label="Location" value={w.location} onChange={(v) => setWork(i, 'location', v)} />
            <View style={styles.row2}>
              <Field label="Start" value={w.start} onChange={(v) => setWork(i, 'start', v)} />
              <Field label="End" value={w.end} onChange={(v) => setWork(i, 'end', v)} />
            </View>
            <Field label="Description" value={w.description} onChange={(v) => setWork(i, 'description', v)} multiline submitBehavior="newline" />
          </EntryCard>
        ))}
      </Section>

      <ListSection title="AWARDS" value={p.awards} onChange={(arr) => setP((s) => ({ ...s, awards: arr }))} />
      <ListSection title="CERTIFICATIONS" value={p.certs} onChange={(arr) => setP((s) => ({ ...s, certs: arr }))} />
      <ListSection title="VOLUNTEER" value={p.volunteer} onChange={(arr) => setP((s) => ({ ...s, volunteer: arr }))} />

      <Section title="DEMOGRAPHICS (EEO)">
        <Text style={styles.note}>Stored privately for your reference. The apply-assist never auto-fills or submits these — you answer them yourself.</Text>
        <SelectField label="Pronouns" value={p.eeo.pronouns} options={EEO_OPTIONS.pronouns} onChange={(v) => setEeo('pronouns', v)} />
        <SelectField label="Gender" value={p.eeo.gender} options={EEO_OPTIONS.gender} onChange={(v) => setEeo('gender', v)} />
        <SelectField label="Race" value={p.eeo.race} options={EEO_OPTIONS.race} onChange={(v) => setEeo('race', v)} />
        <SelectField label="Ethnicity" value={p.eeo.ethnicity} options={EEO_OPTIONS.ethnicity} onChange={(v) => setEeo('ethnicity', v)} />
        <SelectField label="Veteran status" value={p.eeo.veteran} options={EEO_OPTIONS.veteran} onChange={(v) => setEeo('veteran', v)} />
        <SelectField label="Disability status" value={p.eeo.disability} options={EEO_OPTIONS.disability} onChange={(v) => setEeo('disability', v)} />
        <SelectField label="Sexual orientation" value={p.eeo.orientation} options={EEO_OPTIONS.orientation} onChange={(v) => setEeo('orientation', v)} />
      </Section>

      <NarrativeBuilderModal visible={builderOpen} onClose={() => setBuilderOpen(false)} onAdd={addNarrative} />
    </ScrollView>
  );
}

function Section({ title, children, onAdd }: { title: string; children: React.ReactNode; onAdd?: () => void }) {
  const { styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onAdd ? (
          <Pressable onPress={onAdd} hitSlop={10}>
            <Text style={styles.add}>+ Add</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function EntryCard({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  const { styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.entry}>
      {children}
      <Pressable onPress={onRemove} hitSlop={8} style={styles.remove}>
        <Text style={styles.removeText}>Remove</Text>
      </Pressable>
    </View>
  );
}

function ListSection({ title, value, onChange }: { title: string; value: string[]; onChange: (a: string[]) => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  // Local raw text so a trailing newline isn't stripped mid-edit (see SearchCriteriaScreen).
  const [text, setText] = useState(value.join('\n'));
  return (
    <Section title={title}>
      <TextInput
        value={text}
        onChangeText={(t) => { setText(t); onChange(linesToArr(t)); }}
        placeholder="One per line"
        placeholderTextColor={c.muted}
        multiline
        submitBehavior="newline"
        style={[styles.input, styles.multi]}
      />
    </Section>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.canvas },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 24, gap: 18, paddingBottom: 48 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: c.emerald },
  save: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700', color: c.emerald },
  title: { fontFamily: fonts.serif, fontSize: 26, fontWeight: '600', color: c.textHigh, marginTop: -8 },
  resumeBtn: { backgroundColor: alpha(c.emerald, 0.1), borderWidth: 1, borderColor: alpha(c.emerald, 0.4), borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  resumeText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.emerald },
  draftBtn: { marginTop: 8, backgroundColor: alpha(c.emerald, 0.1), borderWidth: 1, borderColor: alpha(c.emerald, 0.4), borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  draftBtnText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.emerald },
  status: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500' },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '500', letterSpacing: 1.6, color: c.muted },
  add: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.emerald },
  field: { gap: 5, flex: 1 },
  fieldLabel: { fontFamily: fonts.sans, fontSize: 11, color: c.muted },
  input: { backgroundColor: c.element, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: c.textHigh, fontFamily: fonts.sans, fontSize: 15 },
  multi: { minHeight: 80, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 10 },
  entry: { backgroundColor: alpha(c.element, 0.5), borderRadius: 12, padding: 12, gap: 10 },
  remove: { alignSelf: 'flex-start' },
  removeText: { fontFamily: fonts.sans, fontSize: 12, color: c.danger },
  note: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, lineHeight: 17 },
  select: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.element, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11 },
  selectText: { flex: 1, fontFamily: fonts.sans, fontSize: 15, color: c.textHigh },
  selectPlaceholder: { color: c.muted },
  selectChev: { fontFamily: fonts.sans, fontSize: 13, color: c.muted, marginLeft: 8 },
  optBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 28 },
  optSheet: { backgroundColor: c.canvas, borderRadius: 16, borderWidth: 1, borderColor: c.element, paddingVertical: 10, maxHeight: '70%' },
  optTitle: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '600', letterSpacing: 1, color: c.muted, paddingHorizontal: 16, paddingVertical: 8, textTransform: 'uppercase' },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  optText: { flex: 1, fontFamily: fonts.sans, fontSize: 15, color: c.textBase },
  optTextOn: { color: c.emerald, fontWeight: '600' },
  optCheck: { fontFamily: fonts.sans, fontSize: 15, color: c.emerald, fontWeight: '700' },
});
