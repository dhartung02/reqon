import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking } from 'react-native';
import { fonts, alpha, useThemedStyles, type Palette } from '../theme';
import { buildCv, cvDocxUrl, type CvResult } from '../sync/cv';

// Build CV: generate a CV from your profile (work history, education, narratives) on the server —
// AI writes the summary when a key is set, otherwise a deterministic one — preview it, then
// download the .docx.
export function BuildCvScreen({ onBack }: { onBack: () => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const [result, setResult] = useState<CvResult | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    setResult(await buildCv());
    setBusy(false);
  };

  const download = async () => {
    const url = await cvDocxUrl();
    if (url) Linking.openURL(url);
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.headRow}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹ Settings</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>Build CV</Text>
      <Text style={styles.intro}>Generates a CV from your profile — work history, education, and your narrative highlights. The summary is AI-written when your server has a key, otherwise a plain template. Review the preview, then download the .docx.</Text>

      <Pressable style={[styles.gen, busy && styles.genBusy]} onPress={generate} disabled={busy}>
        {busy ? <ActivityIndicator color={c.canvas} /> : <Text style={styles.genText}>{result?.ok ? 'Regenerate' : 'Generate CV'}</Text>}
      </Pressable>

      {result && !result.ok ? <Text style={styles.err}>{result.error}</Text> : null}

      {result?.ok ? (
        <>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>Summary: {result.source === 'ai' ? 'AI-written' : 'template'}</Text>
            <Pressable onPress={download} hitSlop={8}>
              <Text style={styles.download}>Download .docx ↓</Text>
            </Pressable>
          </View>
          <View style={styles.preview}>
            <Text style={styles.previewText} selectable>{result.markdown}</Text>
          </View>
          <Text style={styles.note}>Opens the .docx from your server in the browser. On the same machine as the server it downloads directly; over your LAN your browser may prompt for the app token.</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.canvas },
  scroll: { padding: 24, gap: 16, paddingBottom: 48 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: c.emerald },
  title: { fontFamily: fonts.serif, fontSize: 26, fontWeight: '600', color: c.textHigh, marginTop: -8 },
  intro: { fontFamily: fonts.sans, fontSize: 13, color: c.muted, lineHeight: 19, marginTop: -8 },
  gen: { backgroundColor: c.emerald, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  genBusy: { opacity: 0.7 },
  genText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700', color: c.canvas },
  err: { fontFamily: fonts.sans, fontSize: 13, color: c.danger, lineHeight: 19 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { fontFamily: fonts.sans, fontSize: 12, color: c.muted },
  download: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: c.emerald },
  preview: { backgroundColor: c.element, borderRadius: 12, padding: 14 },
  previewText: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase, lineHeight: 21 },
  note: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, lineHeight: 17 },
});
