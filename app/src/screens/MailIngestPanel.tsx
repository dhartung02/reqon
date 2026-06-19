import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import { getMailConfig, saveMailConfig, runMailIngest, type MailConfig } from '../sync/mailConfig';

// App-managed, server-run Gmail response ingest. Credentials are saved to the server's .env (the
// password is write-only here — the server only ever reports that it's set + its last 4). Test runs
// a dry-run; Run now applies (auto-sets rejections, flags positives) on the server.
export function MailIngestPanel() {
  const { c, styles } = useThemedStyles(makeStyles);
  const [cfg, setCfg] = useState<MailConfig | null>(null);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [label, setLabel] = useState('INBOX');
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState<null | 'load' | 'save' | 'test' | 'run'>('load');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [report, setReport] = useState('');

  useEffect(() => {
    getMailConfig()
      .then((m) => {
        if (m) { setCfg(m); setUser(m.user); setLabel(m.label); setAi(m.ai); }
      })
      .catch((e) => setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'load failed' }))
      .finally(() => setBusy(null));
  }, []);

  const save = async () => {
    setBusy('save'); setStatus(null);
    try {
      const m = await saveMailConfig({ user, password: pass, label, ai });
      if (m) { setCfg(m); setPass(''); }
      setStatus({ kind: 'ok', text: 'Saved on the server.' });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'save failed' });
    }
    setBusy(null);
  };

  const run = async (apply: boolean) => {
    setBusy(apply ? 'run' : 'test'); setStatus(null); setReport('');
    try {
      await saveMailConfig({ user, password: pass, label, ai }); // persist edits first
      if (pass) setPass('');
      const { report } = await runMailIngest(apply);
      setReport(report || '(no output)');
      setStatus({ kind: 'ok', text: apply ? 'Ran on the server.' : 'Dry run complete — nothing changed.' });
      getMailConfig().then((m) => m && setCfg(m));
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'run failed' });
    }
    setBusy(null);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Gmail response ingest</Text>
      <Text style={styles.help}>
        Reads recruiter emails on the server and updates the board — auto-sets rejections, flags
        interviews/offers for review. Needs a Gmail App Password (2-Step Verification → App passwords).
      </Text>

      <View style={styles.labeled}>
        <Text style={styles.label}>Gmail address</Text>
        <TextInput value={user} onChangeText={setUser} autoCapitalize="none" keyboardType="email-address" placeholder="you@gmail.com" placeholderTextColor={c.muted} style={styles.input} />
      </View>
      <View style={styles.labeled}>
        <Text style={styles.label}>App password</Text>
        <TextInput
          value={pass}
          onChangeText={setPass}
          autoCapitalize="none"
          secureTextEntry
          placeholder={cfg?.passSet ? `•••• ${cfg.passLast4} (leave blank to keep)` : '16-char app password'}
          placeholderTextColor={c.muted}
          style={styles.input}
        />
        <Text style={styles.fieldHint}>Stored on the server, never your real password. Blank = keep current.</Text>
      </View>
      <View style={styles.labeled}>
        <Text style={styles.label}>Mailbox / label</Text>
        <TextInput value={label} onChangeText={setLabel} autoCapitalize="none" placeholder="INBOX" placeholderTextColor={c.muted} style={styles.input} />
      </View>
      <Pressable style={styles.aiRow} onPress={() => setAi((v) => !v)}>
        <View style={[styles.check, ai && styles.checkOn]}>{ai ? <Text style={styles.checkMark}>✓</Text> : null}</View>
        <Text style={styles.aiText}>Use AI for ambiguous emails (server OpenAI key)</Text>
      </Pressable>

      {status ? <Text style={[styles.status, { color: status.kind === 'ok' ? c.emerald : c.danger }]}>{status.text}</Text> : null}
      {busy && busy !== 'load' ? <ActivityIndicator color={c.emerald} /> : null}
      {report ? <Text style={styles.report}>{report}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={save} disabled={!!busy}>
          <Text style={styles.btnGhostText}>Save</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => run(false)} disabled={!!busy}>
          <Text style={styles.btnGhostText}>Test (dry run)</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => run(true)} disabled={!!busy}>
          <Text style={styles.btnPrimaryText}>Run now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  wrap: { gap: 10, borderTopWidth: 1, borderTopColor: alpha(c.muted, 0.2), paddingTop: 16, marginTop: 4 },
  heading: { fontFamily: fonts.serif, fontSize: 16, fontWeight: '600', color: c.textHigh },
  help: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, lineHeight: 17 },
  labeled: { gap: 6 },
  label: { fontFamily: fonts.sans, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: c.muted },
  fieldHint: { fontFamily: fonts.sans, fontSize: 11, color: c.muted, lineHeight: 15 },
  input: { fontFamily: fonts.sans, fontSize: 15, color: c.textHigh, backgroundColor: c.element, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  aiRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4 },
  check: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: c.muted, alignItems: 'center', justifyContent: 'center' },
  checkOn: { borderColor: c.emerald, backgroundColor: c.emerald },
  checkMark: { fontSize: 12, fontWeight: '700', color: c.canvas, lineHeight: 14 },
  aiText: { fontFamily: fonts.sans, fontSize: 13, color: c.textBase, flex: 1 },
  status: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500' },
  report: { fontFamily: fonts.sans, fontSize: 11, color: c.textBase, backgroundColor: c.element, borderRadius: 10, padding: 12, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  btn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  btnGhost: { backgroundColor: alpha(c.emerald, 0.1), borderWidth: 1, borderColor: alpha(c.emerald, 0.4) },
  btnGhostText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.emerald },
  btnPrimary: { backgroundColor: c.emerald },
  btnPrimaryText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '700', color: c.canvas },
});
