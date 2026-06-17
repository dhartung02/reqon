import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import {
  pullProfile,
  pushProfile,
  uploadResume,
  EMPTY_PROFILE,
  type Profile,
  type EduEntry,
  type WorkEntry,
} from '../sync/profile';

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
        <Field label="Pronouns" value={p.eeo.pronouns} onChange={(v) => setEeo('pronouns', v)} />
        <Field label="Gender" value={p.eeo.gender} onChange={(v) => setEeo('gender', v)} />
        <Field label="Race" value={p.eeo.race} onChange={(v) => setEeo('race', v)} />
        <Field label="Ethnicity" value={p.eeo.ethnicity} onChange={(v) => setEeo('ethnicity', v)} />
        <Field label="Veteran status" value={p.eeo.veteran} onChange={(v) => setEeo('veteran', v)} />
        <Field label="Disability status" value={p.eeo.disability} onChange={(v) => setEeo('disability', v)} />
        <Field label="Sexual orientation" value={p.eeo.orientation} onChange={(v) => setEeo('orientation', v)} />
      </Section>
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
});
