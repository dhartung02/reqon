import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { colors, alpha, fonts } from '../theme';
import { getConfig, setConfig } from '../sync/config';
import { testConnection, pullAll } from '../sync/sync';

// Sync settings: server URL + token (keychain), connection test, and a full pull.
export function SettingsModal({
  visible,
  onClose,
  onSynced,
}: {
  visible: boolean;
  onClose: () => void;
  onSynced: () => void;
}) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (visible) getConfig().then((c) => { setUrl(c.url); setToken(c.token); setStatus(null); });
  }, [visible]);

  const persist = () => setConfig({ url, token });

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
      const { applied } = await pullAll();
      setStatus({ kind: 'ok', text: `Pulled ${applied} roles from server` });
      onSynced();
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'sync failed' });
    }
    setBusy(false);
  };

  const statusColorFor = (k: string) => (k === 'ok' ? colors.emerald : k === 'err' ? colors.danger : colors.muted);

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
            <Text style={styles.help}>Connect to your self-hosted Reqon Sync server. Pull replaces local data with the server&apos;s.</Text>
            <View style={styles.labeled}>
              <Text style={styles.label}>Server URL</Text>
              <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="http://localhost:8787" placeholderTextColor={colors.muted} style={styles.input} />
            </View>
            <View style={styles.labeled}>
              <Text style={styles.label}>Token (X-CRM-Token)</Text>
              <TextInput value={token} onChangeText={setToken} autoCapitalize="none" secureTextEntry placeholder="APP_TOKEN" placeholderTextColor={colors.muted} style={styles.input} />
            </View>

            {status ? <Text style={[styles.status, { color: statusColorFor(status.kind) }]}>{status.text}</Text> : null}
            {busy ? <ActivityIndicator color={colors.emerald} /> : null}

            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={test} disabled={busy}>
                <Text style={styles.btnGhostText}>Test connection</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={sync} disabled={busy}>
                <Text style={styles.btnPrimaryText}>Sync now (pull)</Text>
              </Pressable>
            </View>
          </ScrollView>
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
    maxHeight: '85%',
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: colors.textHigh },
  cancel: { fontFamily: fonts.sans, fontSize: 15, color: colors.emerald, fontWeight: '500' },
  form: { gap: 14, paddingBottom: 8 },
  help: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, lineHeight: 19 },
  labeled: { gap: 6 },
  label: { fontFamily: fonts.sans, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  input: {
    backgroundColor: colors.element,
    borderWidth: 1,
    borderColor: colors.element,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: colors.textHigh,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  status: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnGhost: { backgroundColor: colors.element, borderWidth: 1, borderColor: colors.element },
  btnGhostText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '500', color: colors.textHigh },
  btnPrimary: { backgroundColor: colors.emerald },
  btnPrimaryText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: colors.canvas },
});
