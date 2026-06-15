import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { alpha, fonts, useThemedStyles, useScheme, type Palette, type SchemePref } from '../theme';
import { getConfig, setConfig, getScoutMode, setScoutMode, type ScoutMode } from '../sync/config';
import { testConnection, syncTwoWay } from '../sync/sync';

// Sync settings: server URL + token (keychain), connection test, and a full pull.
export function SettingsModal({
  visible,
  onClose,
  onSynced,
  onEditProfile,
  onEditSearch,
  onEditRules,
}: {
  visible: boolean;
  onClose: () => void;
  onSynced: () => void;
  onEditProfile: () => void;
  onEditSearch: () => void;
  onEditRules: () => void;
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  const { pref, setScheme } = useScheme();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [scout, setScout] = useState<ScoutMode>('auto');

  useEffect(() => {
    if (visible) {
      getConfig().then((cfg) => { setUrl(cfg.url); setToken(cfg.token); setStatus(null); });
      getScoutMode().then(setScout);
    }
  }, [visible]);

  const pickScout = (m: ScoutMode) => {
    setScout(m);
    setScoutMode(m);
  };
  const scoutHelp =
    scout === 'auto'
      ? 'Auto: on-device scout runs only when no server is connected (server is the source of truth when synced).'
      : scout === 'on'
        ? 'Always scout on device.'
        : 'Never scout on device — rely on the server.';

  const persist = () => {
    setConfig({ url, token });
  };

  const test = async () => {
    setBusy(true);
    setStatus(null);
    await persist();
    const r = await testConnection(url, token);
    setBusy(false);
    setStatus(r.ok ? { kind: 'ok', text: `Connected · ${r.count ?? '?'} roles on server` } : { kind: 'err', text: `Failed: ${r.error}` });
  };

  const sync = async () => {
    setBusy(true);
    setStatus(null);
    await persist();
    try {
      const { pushed, pulled, remaps } = await syncTwoWay();
      setStatus({
        kind: 'ok',
        text: `Synced · pushed ${pushed}, pulled ${pulled}${remaps ? `, ${remaps} merged` : ''}`,
      });
      onSynced();
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'sync failed' });
    }
    setBusy(false);
  };

  const statusColorFor = (k: string) => (k === 'ok' ? c.emerald : k === 'err' ? c.danger : c.muted);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headRow}>
            <Text style={styles.title}>Sync</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.cancel}>Done</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={styles.help}>Connect to your self-hosted Reqon Sync server. When configured, sync runs automatically on launch and foreground (push local edits + pull server changes, last-writer-wins); the button below forces it now.</Text>
            <View style={styles.labeled}>
              <Text style={styles.label}>Server URL</Text>
              <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="http://localhost:8787" placeholderTextColor={c.muted} style={styles.input} />
            </View>
            <View style={styles.labeled}>
              <Text style={styles.label}>Token (X-CRM-Token)</Text>
              <TextInput value={token} onChangeText={setToken} autoCapitalize="none" secureTextEntry placeholder="APP_TOKEN" placeholderTextColor={c.muted} style={styles.input} />
            </View>

            <View style={styles.labeled}>
              <Text style={styles.label}>On-device scout</Text>
              <View style={styles.seg}>
                {(['auto', 'on', 'off'] as ScoutMode[]).map((m) => (
                  <Pressable key={m} style={[styles.segBtn, scout === m && styles.segBtnOn]} onPress={() => pickScout(m)}>
                    <Text style={[styles.segText, scout === m && styles.segTextOn]}>
                      {m === 'auto' ? 'Auto' : m === 'on' ? 'On' : 'Off'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.help}>{scoutHelp}</Text>
            </View>

            <View style={styles.labeled}>
              <Text style={styles.label}>Appearance</Text>
              <View style={styles.seg}>
                {(['light', 'dark', 'system'] as SchemePref[]).map((m) => (
                  <Pressable key={m} style={[styles.segBtn, pref === m && styles.segBtnOn]} onPress={() => setScheme(m)}>
                    <Text style={[styles.segText, pref === m && styles.segTextOn]}>
                      {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'System'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.help}>{pref === 'system' ? 'Follows your device light/dark setting.' : `Always ${pref}.`}</Text>
            </View>

            <Pressable style={styles.profileRow} onPress={onEditProfile}>
              <View style={styles.flex1}>
                <Text style={styles.label}>Profile · apply-assist</Text>
                <Text style={styles.help}>Name, links, education, work history, EEO + résumé upload</Text>
              </View>
              <Text style={styles.profileChev}>›</Text>
            </Pressable>

            <Pressable style={styles.profileRow} onPress={onEditSearch}>
              <View style={styles.flex1}>
                <Text style={styles.label}>Search criteria</Text>
                <Text style={styles.help}>Role titles, keywords, min-fit, salary floor + remote</Text>
              </View>
              <Text style={styles.profileChev}>›</Text>
            </Pressable>

            <Pressable style={styles.profileRow} onPress={onEditRules}>
              <View style={styles.flex1}>
                <Text style={styles.label}>Tiers & rules</Text>
                <Text style={styles.help}>A/B/C thresholds, scout merge tier, follow-up days, AI drafts</Text>
              </View>
              <Text style={styles.profileChev}>›</Text>
            </Pressable>

            <Text style={styles.serverOnly}>Server-only by design: morning digest + email/Slack (SMTP), push notifications (APNs), AI keys & enrichment budgets, scheduling, and access tokens are managed on the server.</Text>

            {status ? <Text style={[styles.status, { color: statusColorFor(status.kind) }]}>{status.text}</Text> : null}
            {busy ? <ActivityIndicator color={c.emerald} /> : null}

            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={test} disabled={busy}>
                <Text style={styles.btnGhostText}>Test connection</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={sync} disabled={busy}>
                <Text style={styles.btnPrimaryText}>Sync now</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.canvas,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: c.element,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: c.textHigh },
  cancel: { fontFamily: fonts.sans, fontSize: 15, color: c.emerald, fontWeight: '500' },
  form: { gap: 14, paddingBottom: 8 },
  help: { fontFamily: fonts.sans, fontSize: 13, color: c.muted, lineHeight: 19 },
  labeled: { gap: 6 },
  label: { fontFamily: fonts.sans, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: c.muted },
  seg: { flexDirection: 'row', gap: 8 },
  segBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: c.element,
    borderWidth: 1,
    borderColor: c.element,
    alignItems: 'center',
  },
  segBtnOn: { borderColor: alpha(c.emerald, 0.5), backgroundColor: alpha(c.emerald, 0.1) },
  segText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500', color: c.textBase },
  segTextOn: { color: c.emerald },
  flex1: { flex: 1 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.element,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  profileChev: { fontSize: 22, color: c.muted, lineHeight: 22 },
  serverOnly: { fontFamily: fonts.sans, fontSize: 11, color: c.muted, lineHeight: 16, fontStyle: 'italic' },
  input: {
    backgroundColor: c.element,
    borderWidth: 1,
    borderColor: c.element,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: c.textHigh,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  status: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnGhost: { backgroundColor: c.element, borderWidth: 1, borderColor: c.element },
  btnGhostText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '500', color: c.textHigh },
  btnPrimary: { backgroundColor: c.emerald },
  btnPrimaryText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: c.canvas },
});
