import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Share } from 'react-native';
import { fonts, useThemedStyles, type Palette } from '../theme';
import { fetchGuide, generateGuide, reqKey } from '../sync/assist';

// Interview prep guide viewer (P1.4). Fetches the stored guide markdown (authed JSON) and renders it
// natively; offers Generate when none exists yet. Read-only + shareable; AI-generated, grounded.
type Block = { type: 'h1' | 'h2' | 'h3' | 'bullet' | 'p'; text: string };

/** Tiny markdown → blocks (headings, bullets, paragraphs); inline ** ** / * markers stripped. */
function parseMarkdown(md: string): Block[] {
  const out: Block[] = [];
  for (const raw of String(md || '').split(/\r?\n/)) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1').trimEnd();
    if (!line.trim()) continue;
    if (/^###\s+/.test(line)) out.push({ type: 'h3', text: line.replace(/^###\s+/, '') });
    else if (/^##\s+/.test(line)) out.push({ type: 'h2', text: line.replace(/^##\s+/, '') });
    else if (/^#\s+/.test(line)) out.push({ type: 'h1', text: line.replace(/^#\s+/, '') });
    else if (/^\s*[-*]\s+/.test(line)) out.push({ type: 'bullet', text: line.replace(/^\s*[-*]\s+/, '') });
    else out.push({ type: 'p', text: line.trim() });
  }
  return out;
}

export function GuideModal({
  visible, company, role, onClose,
}: { visible: boolean; company: string; role: string; onClose: () => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [md, setMd] = useState<string | null>(null);
  const [exists, setExists] = useState<boolean | null>(null);
  const key = reqKey(company, role);

  const load = async () => {
    setBusy(true); setError(null);
    const r = await fetchGuide(key);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setExists(!!r.exists);
    setMd(r.markdown ?? null);
  };
  useEffect(() => { if (visible) { setMd(null); setExists(null); load(); } }, [visible, key]);

  const generate = async () => {
    setBusy(true); setError(null);
    const r = await generateGuide(key);
    if (r.error) { setBusy(false); setError(r.error); return; }
    await load();
  };

  const blocks = md ? parseMarkdown(md) : [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headRow}>
            <Text style={styles.title}>Interview guide</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text style={styles.cancel}>Done</Text></Pressable>
          </View>
          <Text style={styles.sub}>{role} · {company}</Text>

          {busy ? <ActivityIndicator color={c.emerald} style={{ marginVertical: 24 }} /> : null}
          {error ? <Text style={styles.err}>{error}</Text> : null}

          {!busy && exists === false ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No interview guide for this role yet.</Text>
              <Pressable style={styles.gen} onPress={generate}><Text style={styles.genText}>Generate guide · AI</Text></Pressable>
            </View>
          ) : null}

          {!busy && blocks.length ? (
            <>
              <ScrollView style={styles.box} contentContainerStyle={{ padding: 16 }}>
                {blocks.map((b, i) => (
                  <Text key={i} style={styles[b.type]} selectable>
                    {b.type === 'bullet' ? '•  ' + b.text : b.text}
                  </Text>
                ))}
              </ScrollView>
              <View style={styles.footRow}>
                <Text style={styles.note}>AI-generated · grounded in your profile</Text>
                <View style={styles.footActions}>
                  <Pressable onPress={generate} hitSlop={8}><Text style={styles.share}>Regenerate</Text></Pressable>
                  <Pressable onPress={() => md && Share.share({ message: md })} hitSlop={8}><Text style={styles.share}>Share</Text></Pressable>
                </View>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.canvas, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderColor: c.element, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, maxHeight: '90%', gap: 12 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: c.textHigh },
  cancel: { fontFamily: fonts.sans, fontSize: 15, color: c.emerald, fontWeight: '500' },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: c.muted, marginTop: -6 },
  err: { fontFamily: fonts.sans, fontSize: 13, color: c.danger },
  empty: { alignItems: 'center', gap: 14, paddingVertical: 22 },
  emptyText: { fontFamily: fonts.sans, fontSize: 14, color: c.muted },
  gen: { backgroundColor: c.emerald, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  genText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700', color: c.canvas },
  box: { backgroundColor: c.element, borderRadius: 12 },
  h1: { fontFamily: fonts.serif, fontSize: 20, fontWeight: '700', color: c.textHigh, marginTop: 10, marginBottom: 4 },
  h2: { fontFamily: fonts.sans, fontSize: 16, fontWeight: '700', color: c.textHigh, marginTop: 12, marginBottom: 3 },
  h3: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: c.textBase, marginTop: 8, marginBottom: 2 },
  bullet: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase, lineHeight: 21, marginVertical: 1 },
  p: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase, lineHeight: 21, marginVertical: 3 },
  footRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  footActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  note: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, flexShrink: 1 },
  share: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.emerald },
});
