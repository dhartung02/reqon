import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Share } from 'react-native';
import { colors, alpha, fonts } from '../theme';
import { requestDraft } from '../sync/assist';

type Kind = 'cover' | 'screening';

// AI draft assistant: pick Cover note or Screening answer (with your question as the input), get a
// draft grounded in your server-side narrative library. Editable + shareable; never auto-submitted.
export function DraftModal({
  visible,
  company,
  role,
  onClose,
}: {
  visible: boolean;
  company: string;
  role: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>('cover');
  const [question, setQuestion] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    const r = await requestDraft({ company, role, kind, question: kind === 'screening' ? question : undefined });
    setBusy(false);
    if (r.error) setError(r.error);
    else setDraft(r.draft ?? '');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headRow}>
            <Text style={styles.title}>Draft</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.cancel}>Done</Text>
            </Pressable>
          </View>
          <Text style={styles.sub}>{role} · {company}</Text>

          <View style={styles.seg}>
            {(['cover', 'screening'] as Kind[]).map((k) => (
              <Pressable key={k} style={[styles.segBtn, kind === k && styles.segBtnOn]} onPress={() => setKind(k)}>
                <Text style={[styles.segText, kind === k && styles.segTextOn]}>{k === 'cover' ? 'Cover note' : 'Screening answer'}</Text>
              </Pressable>
            ))}
          </View>

          {kind === 'screening' ? (
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="Paste the screening question…"
              placeholderTextColor={colors.muted}
              multiline
              style={styles.qInput}
            />
          ) : null}

          <Pressable style={[styles.gen, busy && styles.genBusy]} onPress={generate} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.canvas} /> : <Text style={styles.genText}>{draft ? 'Regenerate' : 'Draft it'}</Text>}
          </Pressable>

          {error ? <Text style={styles.err}>{error}</Text> : null}

          {draft ? (
            <>
              <ScrollView style={styles.draftBox} contentContainerStyle={{ padding: 14 }}>
                <Text style={styles.draftText} selectable>{draft}</Text>
              </ScrollView>
              <View style={styles.footRow}>
                <Text style={styles.note}>Drafted in your voice · review before sending</Text>
                <Pressable onPress={() => Share.share({ message: draft })} hitSlop={8}>
                  <Text style={styles.share}>Share / copy</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.element,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '88%',
    gap: 12,
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: colors.textHigh },
  cancel: { fontFamily: fonts.sans, fontSize: 15, color: colors.emerald, fontWeight: '500' },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginTop: -6 },
  seg: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, backgroundColor: colors.element, borderWidth: 1, borderColor: colors.element, alignItems: 'center' },
  segBtnOn: { borderColor: alpha(colors.emerald, 0.5), backgroundColor: alpha(colors.emerald, 0.1) },
  segText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500', color: colors.textBase },
  segTextOn: { color: colors.emerald },
  qInput: {
    backgroundColor: colors.element,
    borderRadius: 10,
    padding: 12,
    minHeight: 60,
    textAlignVertical: 'top',
    color: colors.textHigh,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  gen: { backgroundColor: colors.emerald, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  genBusy: { opacity: 0.7 },
  genText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700', color: colors.canvas },
  err: { fontFamily: fonts.sans, fontSize: 13, color: colors.danger },
  draftBox: { backgroundColor: colors.element, borderRadius: 12, maxHeight: 280 },
  draftText: { fontFamily: fonts.sans, fontSize: 15, color: colors.textHigh, lineHeight: 22 },
  footRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  note: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, flexShrink: 1 },
  share: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.emerald },
});
