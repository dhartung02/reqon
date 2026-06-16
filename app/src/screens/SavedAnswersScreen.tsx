import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import { pullProfile, pushProfile, getProfile, newAnswerId, type Profile, type SavedAnswer } from '../sync/profile';
import { allTags, filterAnswers } from '../answers';

// Saved-answers library: reusable Q&A + saved AI drafts, searchable and tag-filterable. Synced with
// the rest of the profile. Pull from these when answering recurring application questions.
export function SavedAnswersScreen({ onBack }: { onBack: () => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [answers, setAnswers] = useState<SavedAnswer[]>([]);
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    pullProfile().then((p) => { setProfileState(p); setAnswers(p.answers); setLoading(false); });
  }, []);

  const tags = useMemo(() => allTags(answers), [answers]);
  const shown = useMemo(() => filterAnswers(answers, query, activeTags), [answers, query, activeTags]);

  const upd = (id: string, patch: Partial<SavedAnswer>) => setAnswers((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const del = (id: string) => setAnswers((s) => s.filter((x) => x.id !== id));
  const addNew = () => {
    setQuery('');
    setActiveTags([]);
    setAnswers((s) => [{ id: newAnswerId(), q: '', a: '', tags: [] }, ...s]);
  };
  const toggleTag = (t: string) => setActiveTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  const save = async () => {
    setBusy(true);
    setStatus(null);
    const base = profile ?? (await getProfile());
    const clean = answers.filter((x) => x.q.trim() || x.a.trim());
    const r = await pushProfile({ ...base, answers: clean });
    setAnswers(clean);
    setBusy(false);
    setStatus(r.ok ? { ok: true, text: 'Saved' } : { ok: false, text: r.error || 'Save failed' });
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
      <Text style={styles.title}>Saved answers</Text>
      <Text style={styles.intro}>Reusable answers to recurring application questions, plus AI drafts you keep. Search or filter by tag, then copy when you need them.</Text>
      {status ? <Text style={[styles.status, { color: status.ok ? c.emerald : c.danger }]}>{status.text}</Text> : null}

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search questions & answers…"
        placeholderTextColor={c.muted}
        style={styles.search}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />

      {tags.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRow}>
          {tags.map((t) => {
            const on = activeTags.includes(t);
            return (
              <Pressable key={t} onPress={() => toggleTag(t)} style={[styles.tagPill, on && styles.tagPillOn]}>
                <Text style={[styles.tagPillText, on && styles.tagPillTextOn]}>{on ? '✓ ' : ''}{t}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <Pressable style={styles.addBtn} onPress={addNew}>
        <Text style={styles.addText}>+ Add answer</Text>
      </Pressable>

      {shown.length === 0 ? (
        <Text style={styles.empty}>{answers.length ? 'No answers match.' : 'No saved answers yet — add one, or save an AI draft from a role.'}</Text>
      ) : (
        shown.map((ans) => <AnswerCard key={ans.id} answer={ans} onChange={(patch) => upd(ans.id, patch)} onRemove={() => del(ans.id)} />)
      )}
    </ScrollView>
  );
}

function AnswerCard({ answer, onChange, onRemove }: { answer: SavedAnswer; onChange: (p: Partial<SavedAnswer>) => void; onRemove: () => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  // Local raw tag text so a trailing comma isn't stripped mid-edit (same reason as the list fields).
  const [tagText, setTagText] = useState(answer.tags.join(', '));
  return (
    <View style={styles.card}>
      <TextInput
        value={answer.q}
        onChangeText={(q) => onChange({ q })}
        placeholder="Question / label (e.g. Why this company?)"
        placeholderTextColor={c.muted}
        style={styles.qInput}
      />
      <TextInput
        value={answer.a}
        onChangeText={(a) => onChange({ a })}
        placeholder="Your answer…"
        placeholderTextColor={c.muted}
        multiline
        submitBehavior="newline"
        style={styles.aInput}
      />
      <TextInput
        value={tagText}
        onChangeText={(t) => { setTagText(t); onChange({ tags: t.split(',').map((x) => x.trim()).filter(Boolean) }); }}
        placeholder="tags, comma separated"
        placeholderTextColor={c.muted}
        autoCapitalize="none"
        style={styles.tagInput}
      />
      <Pressable onPress={onRemove} hitSlop={8} style={styles.remove}>
        <Text style={styles.removeText}>Remove</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.canvas },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 24, gap: 14, paddingBottom: 48 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: c.emerald },
  save: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700', color: c.emerald },
  title: { fontFamily: fonts.serif, fontSize: 26, fontWeight: '600', color: c.textHigh, marginTop: -8 },
  intro: { fontFamily: fonts.sans, fontSize: 13, color: c.muted, lineHeight: 19, marginTop: -8 },
  status: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500' },
  search: {
    backgroundColor: c.element,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    color: c.textHigh,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  tagRow: { gap: 8, paddingVertical: 2 },
  tagPill: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: c.element, borderWidth: 1, borderColor: c.element },
  tagPillOn: { borderColor: alpha(c.active, 0.6), backgroundColor: alpha(c.active, 0.12) },
  tagPillText: { fontFamily: fonts.sans, fontSize: 12, color: c.textBase },
  tagPillTextOn: { color: c.active, fontWeight: '600' },
  addBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  addText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.emerald },
  empty: { fontFamily: fonts.sans, fontSize: 14, color: c.muted, paddingTop: 8, lineHeight: 20 },
  card: { backgroundColor: alpha(c.element, 0.6), borderRadius: 12, padding: 12, gap: 8 },
  qInput: { color: c.textHigh, fontFamily: fonts.sans, fontSize: 15, fontWeight: '600' },
  aInput: { color: c.textBase, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, minHeight: 70, textAlignVertical: 'top' },
  tagInput: { color: c.active, fontFamily: fonts.sans, fontSize: 13 },
  remove: { alignSelf: 'flex-start' },
  removeText: { fontFamily: fonts.sans, fontSize: 12, color: c.danger },
});
