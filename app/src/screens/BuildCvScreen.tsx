import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking, TextInput } from 'react-native';
import { fonts, alpha, useThemedStyles, type Palette } from '../theme';
import { buildCv, cvDocxUrl, cvHtmlUrl, type CvResult } from '../sync/cv';

// Build CV: generate a CV from your profile (work history, education, narratives) on the server —
// AI writes the summary when a key is set, otherwise a deterministic one — preview it, then
// download the .docx.
export function BuildCvScreen({ onBack }: { onBack: () => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const [result, setResult] = useState<CvResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [jd, setJd] = useState('');

  const generate = async () => {
    setBusy(true);
    const tailor = role.trim() || company.trim() || jd.trim() ? { role: role.trim(), company: company.trim(), jd: jd.trim() } : undefined;
    setResult(await buildCv(tailor));
    setBusy(false);
  };

  const download = async () => {
    const url = await cvDocxUrl();
    if (url) Linking.openURL(url);
  };

  const openPdf = async () => {
    const url = await cvHtmlUrl();
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

      <View style={styles.tailor}>
        <Text style={styles.tailorLabel}>TAILOR TO A ROLE (OPTIONAL)</Text>
        <Text style={styles.note}>Bias the summary toward a target role. Leave blank for a general CV.</Text>
        <View style={styles.row2}>
          <TextInput value={role} onChangeText={setRole} placeholder="Target role" placeholderTextColor={c.muted} style={[styles.input, styles.flex1]} />
          <TextInput value={company} onChangeText={setCompany} placeholder="Company" placeholderTextColor={c.muted} style={[styles.input, styles.flex1]} />
        </View>
        <TextInput value={jd} onChangeText={setJd} placeholder="Paste the job description (optional)" placeholderTextColor={c.muted} multiline style={[styles.input, styles.jd]} />
      </View>

      <Pressable style={[styles.gen, busy && styles.genBusy]} onPress={generate} disabled={busy}>
        {busy ? <ActivityIndicator color={c.canvas} /> : <Text style={styles.genText}>{result?.ok ? 'Regenerate' : 'Generate CV'}</Text>}
      </Pressable>

      {result && !result.ok ? <Text style={styles.err}>{result.error}</Text> : null}

      {result?.ok ? (
        <>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>Summary: {result.source === 'ai' ? 'AI-written' : 'template'}{result.tailoredFor ? ` · tailored: ${result.tailoredFor}` : ''}</Text>
            <View style={styles.actions}>
              <Pressable onPress={openPdf} hitSlop={8}>
                <Text style={styles.download}>PDF ↗</Text>
              </Pressable>
              <Pressable onPress={download} hitSlop={8}>
                <Text style={styles.download}>.docx ↓</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.preview}>
            <Text style={styles.previewText} selectable>{result.markdown}</Text>
          </View>
          <Text style={styles.note}>.docx downloads directly; PDF opens the print-styled page — use Share / Print → "Save as PDF". Both open from your server in the browser; over LAN it may prompt for the app token.</Text>
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
  tailor: { gap: 8 },
  tailorLabel: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '500', letterSpacing: 1.4, color: c.muted },
  row2: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  input: { backgroundColor: c.element, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: c.textHigh, fontFamily: fonts.sans, fontSize: 15 },
  jd: { minHeight: 70, textAlignVertical: 'top' },
  gen: { backgroundColor: c.emerald, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  genBusy: { opacity: 0.7 },
  genText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700', color: c.canvas },
  err: { fontFamily: fonts.sans, fontSize: 13, color: c.danger, lineHeight: 19 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  meta: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, flexShrink: 1 },
  download: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: c.emerald },
  preview: { backgroundColor: c.element, borderRadius: 12, padding: 14 },
  previewText: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase, lineHeight: 21 },
  note: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, lineHeight: 17 },
});
