import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { fonts, useThemedStyles, type Palette } from '../theme';
import { suggestNarratives, polishNarrative, type NarrativeSuggestion } from '../sync/narratives';
import { newAnswerId, type Narrative } from '../sync/profile';

// Guided narrative builder (app). Suggest proof-point stories from the résumé → elaborate (type, or
// later dictate) → polish → add. Mirrors the web flow; grounded server-side, never invents facts.
export function NarrativeBuilderModal({
  visible, onClose, onAdd,
}: { visible: boolean; onClose: () => void; onAdd: (n: Narrative) => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<NarrativeSuggestion[] | null>(null);
  const [editing, setEditing] = useState<{ title: string; rough: string } | null>(null);
  const [polishing, setPolishing] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = async () => {
    setBusy(true); setError(null); setMsg(null); setSuggestions(null); setEditing(null);
    const r = await suggestNarratives();
    if (!alive.current) return;
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setSuggestions(r.suggestions || []);
  };
  useEffect(() => { if (visible) load(); }, [visible]);

  const pick = (s: NarrativeSuggestion) => {
    const seed = (s.draft || '') + (s.cover?.length ? '\n\nElaborate on:\n' + s.cover.map((x) => '- ' + x).join('\n') : '');
    setEditing({ title: s.title || '', rough: seed });
    setMsg(null);
  };

  const polish = async () => {
    if (!editing || !editing.rough.trim()) { setMsg('Write a few lines first.'); return; }
    setPolishing(true); setMsg(null);
    const r = await polishNarrative(editing.title, editing.rough);
    if (!alive.current) return;
    setPolishing(false);
    if (r.error) { setMsg('Polish failed: ' + r.error); return; }
    setEditing({ title: r.title || editing.title, rough: r.body || editing.rough });
    setMsg('Polished — edit if needed, then Add.');
  };

  const add = () => {
    if (!editing) return;
    const body = editing.rough.replace(/\n\nElaborate on:[\s\S]*$/, '').trim();
    if (!editing.title.trim() && !body) { setMsg('Nothing to add.'); return; }
    onAdd({ id: newAnswerId(), title: editing.title.trim(), body, tags: [] });
    setEditing(null); setMsg('Added to your narratives — Save profile to keep it.');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.headRow}>
          <Text style={styles.title}>Build narratives</Text>
          <Pressable onPress={onClose} hitSlop={8}><Text style={styles.done}>Done</Text></Pressable>
        </View>
        <Text style={styles.sub}>AI suggests proof-point stories from your résumé. Pick one, flesh it out, then polish — grounded only in your real experience.</Text>

        {busy ? <View style={styles.center}><ActivityIndicator color={c.emerald} /><Text style={styles.dim}>Reading your résumé…</Text></View> : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {msg ? <Text style={styles.ok}>{msg}</Text> : null}

        {/* Suggestion list */}
        {!busy && !editing && suggestions ? (
          suggestions.length === 0 ? <Text style={styles.dim}>No suggestions — add work history first.</Text> : (
            <ScrollView style={styles.scroll}>
              {suggestions.map((s, i) => (
                <View key={i} style={styles.card}>
                  <Text style={styles.cardTitle}>{s.title}</Text>
                  <Text style={styles.cardDraft}>{s.draft}</Text>
                  {s.cover?.length ? (
                    <View style={styles.cover}>
                      <Text style={styles.coverLabel}>ELABORATE ON</Text>
                      {s.cover.map((cv, j) => <Text key={j} style={styles.coverItem}>•  {cv}</Text>)}
                    </View>
                  ) : null}
                  <Pressable style={styles.useBtn} onPress={() => pick(s)}><Text style={styles.useBtnText}>Use &amp; elaborate →</Text></Pressable>
                </View>
              ))}
            </ScrollView>
          )
        ) : null}

        {/* Editor */}
        {!busy && editing ? (
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput value={editing.title} onChangeText={(t) => setEditing({ ...editing, title: t })} style={styles.input} placeholderTextColor={c.muted} />
            <Text style={styles.fieldLabel}>Your story (fill the [brackets] with real details, then polish)</Text>
            <TextInput value={editing.rough} onChangeText={(t) => setEditing({ ...editing, rough: t })} style={[styles.input, styles.multi]} multiline placeholderTextColor={c.muted} />
            <View style={styles.editActions}>
              <Pressable onPress={() => { setEditing(null); setMsg(null); }} hitSlop={8}><Text style={styles.backLink}>← Suggestions</Text></Pressable>
              <View style={styles.editRight}>
                <Pressable style={styles.polishBtn} onPress={polish} disabled={polishing}>
                  {polishing ? <ActivityIndicator size="small" color={c.canvas} /> : <Text style={styles.polishText}>✨ Polish</Text>}
                </Pressable>
                <Pressable style={styles.addBtn} onPress={add}><Text style={styles.addText}>Add</Text></Pressable>
              </View>
            </View>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.canvas, padding: 20, gap: 10 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.serif, fontSize: 24, fontWeight: '600', color: c.textHigh },
  done: { fontFamily: fonts.sans, fontSize: 15, color: c.emerald, fontWeight: '600' },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: c.muted, lineHeight: 18 },
  center: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  dim: { fontFamily: fonts.sans, fontSize: 13, color: c.muted },
  err: { fontFamily: fonts.sans, fontSize: 13, color: c.danger },
  ok: { fontFamily: fonts.sans, fontSize: 13, color: c.emerald },
  scroll: { flex: 1 },
  card: { backgroundColor: c.element, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardTitle: { fontFamily: fonts.serif, fontSize: 17, fontWeight: '600', color: c.textHigh },
  cardDraft: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase, lineHeight: 20, marginTop: 6 },
  cover: { marginTop: 10 },
  coverLabel: { fontFamily: fonts.sans, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: c.muted },
  coverItem: { fontFamily: fonts.sans, fontSize: 13, color: c.textBase, lineHeight: 19, marginTop: 3 },
  useBtn: { marginTop: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: c.emerald, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 },
  useBtnText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.emerald },
  fieldLabel: { fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: c.muted, marginTop: 12, marginBottom: 5 },
  input: { backgroundColor: c.element, borderRadius: 10, padding: 12, color: c.textHigh, fontFamily: fonts.sans, fontSize: 15 },
  multi: { minHeight: 160, textAlignVertical: 'top', lineHeight: 21 },
  editActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 30 },
  backLink: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase },
  editRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  polishBtn: { backgroundColor: c.emerald, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18 },
  polishText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: c.canvas },
  addBtn: { borderWidth: 1, borderColor: c.element, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16 },
  addText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.textBase },
});
