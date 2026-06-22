import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import { pullProfile, pushProfile, getProfile, newAnswerId, type Profile, type SavedAnswer } from '../sync/profile';
import { allTags, filterAnswers } from '../answers';
import { requestDraft } from '../sync/assist';

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
  const [aiTarget, setAiTarget] = useState<{ id: string; q: string } | null>(null);

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
    <>
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
        shown.map((ans) => (
          <AnswerCard
            key={ans.id}
            answer={ans}
            onChange={(patch) => upd(ans.id, patch)}
            onRemove={() => del(ans.id)}
            onWriteAi={() => setAiTarget({ id: ans.id, q: ans.q })}
          />
        ))
      )}
    </ScrollView>
    <AiAnswerModal
      visible={!!aiTarget}
      question={aiTarget?.q ?? ''}
      onClose={() => setAiTarget(null)}
      onInsert={(text) => {
        if (aiTarget) upd(aiTarget.id, { a: text });
        setAiTarget(null);
      }}
    />
    </>
  );
}

function AnswerCard({ answer, onChange, onRemove, onWriteAi }: { answer: SavedAnswer; onChange: (p: Partial<SavedAnswer>) => void; onRemove: () => void; onWriteAi: () => void }) {
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
      <View style={styles.cardActions}>
        <Pressable onPress={onWriteAi} hitSlop={8} style={styles.aiBtn}>
          <Text style={styles.aiBtnText}>✦ Write with AI</Text>
        </Pressable>
        <Pressable onPress={onRemove} hitSlop={8} style={styles.remove}>
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Write-with-AI: prompt for keywords/thoughts, then call the server's /api/assist (kind 'answer'),
// which drafts from the candidate profile + narratives + this question + the keywords (server holds
// the OpenAI key). Returns an editable draft the candidate reviews before inserting into the answer.
function AiAnswerModal({
  visible,
  question,
  onClose,
  onInsert,
}: {
  visible: boolean;
  question: string;
  onClose: () => void;
  onInsert: (text: string) => void;
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  const [keywords, setKeywords] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasQuestion = question.trim().length > 0;

  useEffect(() => {
    if (visible) { setKeywords(''); setDraft(''); setErr(null); setBusy(false); }
  }, [visible]);

  const generate = async () => {
    setBusy(true);
    setErr(null);
    const r = await requestDraft({ kind: 'answer', question, keywords });
    setBusy(false);
    if (r.error) setErr(r.error);
    else setDraft(r.draft || '');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.aiBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.aiSheet}>
          <View style={styles.headRow}>
            <Text style={styles.aiTitle}>Write with AI</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.aiClose}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.aiScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <Text style={styles.aiLabel}>QUESTION</Text>
            <Text style={styles.aiQuestion}>{hasQuestion ? question : 'Add a question to this answer first, then come back.'}</Text>

            <Text style={styles.aiLabel}>YOUR KEYWORDS / THOUGHTS</Text>
            <TextInput
              value={keywords}
              onChangeText={setKeywords}
              placeholder="e.g. product catalog 0→1, $1.1M ARR, retail e-comm, partnered with data science…"
              placeholderTextColor={c.muted}
              multiline
              style={styles.aiInput}
            />
            <Text style={styles.aiHint}>The draft is grounded in your profile + narratives on the server and shaped by these keywords. Review and edit before saving — nothing is auto-submitted.</Text>

            <Pressable style={[styles.aiGenerate, (!hasQuestion || busy) && styles.aiGenerateOff]} onPress={generate} disabled={!hasQuestion || busy}>
              {busy ? <ActivityIndicator color={c.canvas} /> : <Text style={styles.aiGenerateText}>{draft ? 'Regenerate' : 'Generate draft'}</Text>}
            </Pressable>

            {err ? <Text style={styles.aiErr}>{err}</Text> : null}

            {draft ? (
              <>
                <Text style={styles.aiLabel}>DRAFT (EDITABLE)</Text>
                <TextInput value={draft} onChangeText={setDraft} multiline style={styles.aiDraft} />
                <Pressable style={styles.aiUse} onPress={() => onInsert(draft)}>
                  <Text style={styles.aiUseText}>Use this answer</Text>
                </Pressable>
              </>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  aiBtn: { alignSelf: 'flex-start' },
  aiBtnText: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '600', color: c.emerald },
  remove: { alignSelf: 'flex-start' },
  removeText: { fontFamily: fonts.sans, fontSize: 12, color: c.danger },
  // ---- Write-with-AI modal ----
  aiBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  aiSheet: {
    backgroundColor: c.canvas,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: c.element,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  aiTitle: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: c.textHigh },
  aiClose: { fontFamily: fonts.sans, fontSize: 15, color: c.emerald, fontWeight: '500' },
  aiScroll: { gap: 8, paddingBottom: 24 },
  aiLabel: { fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1, color: c.muted, marginTop: 8 },
  aiQuestion: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '600', color: c.textHigh, lineHeight: 21 },
  aiInput: {
    backgroundColor: c.element,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: c.textHigh,
    fontFamily: fonts.sans,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  aiHint: { fontFamily: fonts.sans, fontSize: 11, color: c.muted, lineHeight: 15 },
  aiGenerate: { backgroundColor: c.emerald, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  aiGenerateOff: { opacity: 0.5 },
  aiGenerateText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: c.canvas },
  aiErr: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500', color: c.danger },
  aiDraft: {
    backgroundColor: alpha(c.element, 0.6),
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: c.textBase,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  aiUse: { backgroundColor: alpha(c.emerald, 0.12), borderWidth: 1, borderColor: alpha(c.emerald, 0.4), borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  aiUseText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: c.emerald },
});
