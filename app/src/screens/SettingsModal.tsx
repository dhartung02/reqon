import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { alpha, fonts, useThemedStyles, useScheme, type Palette, type SchemePref } from '../theme';
import { useLayout } from '../useLayout';
import { getConfig, setConfig, getScoutMode, setScoutMode, type ScoutMode } from '../sync/config';
import { testConnection, syncTwoWay } from '../sync/sync';
import { decodePairing } from '@reqon/core';
import { PairScanModal } from './PairScanModal';
import { MailIngestPanel } from './MailIngestPanel';
import { ProfileScreen } from './ProfileScreen';
import { SearchCriteriaScreen } from './SearchCriteriaScreen';
import { TiersRulesScreen } from './TiersRulesScreen';
import { SavedAnswersScreen } from './SavedAnswersScreen';
import { BuildCvScreen } from './BuildCvScreen';
import { ScoringGuideScreen } from './ScoringGuideScreen';

// Settings. Phone: a bottom sheet (sync config + nav rows that push full-screen sub-screens, wired
// by App via the onEdit* callbacks). iPad (wide): a centered split panel — section list on the left,
// the chosen section's content on the right (the onEdit* callbacks aren't used; the panel hosts the
// sub-screens itself). The sync-config JSX is shared between both via local consts.
type Section = 'sync' | 'profile' | 'search' | 'rules' | 'answers' | 'cv' | 'guide';
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'sync', label: 'Sync & device' },
  { key: 'profile', label: 'Profile' },
  { key: 'search', label: 'Search criteria' },
  { key: 'rules', label: 'Tiers & rules' },
  { key: 'answers', label: 'Saved answers' },
  { key: 'cv', label: 'Build CV' },
  { key: 'guide', label: 'How scoring works' },
];

export function SettingsModal({
  visible,
  onClose,
  onSynced,
  onEditProfile,
  onEditSearch,
  onEditRules,
  onEditAnswers,
  onBuildCv,
  onOpenGuide,
}: {
  visible: boolean;
  onClose: () => void;
  onSynced: () => void;
  onEditProfile: () => void;
  onEditSearch: () => void;
  onEditRules: () => void;
  onEditAnswers: () => void;
  onBuildCv: () => void;
  onOpenGuide: () => void;
}) {
  const { c, styles } = useThemedStyles(makeStyles);
  const { wide } = useLayout();
  const { pref, setScheme } = useScheme();
  const [section, setSection] = useState<Section>('sync');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [scout, setScout] = useState<ScoutMode>('auto');
  const [scanOpen, setScanOpen] = useState(false);
  const [mailReload, setMailReload] = useState(0);   // bumped on "Sync now" to re-pull server settings

  useEffect(() => {
    if (visible) {
      getConfig().then((cfg) => { setUrl(cfg.url); setToken(cfg.token); setStatus(null); });
      getScoutMode().then(setScout);
      setSection('sync');
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

  // Apply a scanned/pasted pairing payload: fill + save the URL + passphrase in one step.
  const applyPairing = (u: string, t: string) => {
    setUrl(u);
    setToken(t);
    setConfig({ url: u, token: t });
    setStatus({ kind: 'ok', text: 'Paired — server URL + passphrase set. Tap “Sync now”.' });
  };
  const onPasteCode = (text: string) => {
    const parsed = decodePairing(text.trim());
    if (parsed) applyPairing(parsed.url, parsed.token);
    else if (text.trim()) setStatus({ kind: 'err', text: 'That doesn’t look like a Reqon pairing code.' });
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
      setStatus({ kind: 'ok', text: `Synced · pushed ${pushed}, pulled ${pulled}${remaps ? `, ${remaps} merged` : ''}` });
      onSynced();
      setMailReload((n) => n + 1);   // re-pull server-side settings (Gmail ingest config, etc.)
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'sync failed' });
    }
    setBusy(false);
  };

  const statusColorFor = (k: string) => (k === 'ok' ? c.emerald : k === 'err' ? c.danger : c.muted);

  // Sync-config controls (shared by the phone sheet + the wide "Sync & device" pane).
  const syncTop = (
    <>
      <Text style={styles.help}>Connect to your self-hosted Reqon Sync server. When configured, sync runs automatically on launch and foreground (push local edits + pull server changes, last-writer-wins); the button below forces it now.</Text>
      <View style={styles.labeled}>
        <Text style={styles.label}>Server URL</Text>
        <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="http://localhost:8787" placeholderTextColor={c.muted} style={styles.input} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
      </View>
      <View style={styles.labeled}>
        <Text style={styles.label}>Passphrase</Text>
        <TextInput value={token} onChangeText={setToken} autoCapitalize="none" secureTextEntry placeholder="your server passphrase (APP_TOKEN)" placeholderTextColor={c.muted} style={styles.input} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
        <Text style={styles.fieldHint}>Same passphrase you set as APP_TOKEN on the server — the one the web board's login asks for. Stored in your device keychain. Leave blank if the server has no passphrase.</Text>
      </View>
      <View style={styles.labeled}>
        <Text style={styles.label}>Pair from the board</Text>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => setScanOpen(true)}>
          <Text style={styles.btnGhostText}>Scan QR to connect</Text>
        </Pressable>
        <TextInput
          onChangeText={onPasteCode}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="…or paste pairing code (REQON1:…)"
          placeholderTextColor={c.muted}
          style={styles.input}
        />
        <Text style={styles.fieldHint}>On the board: Settings → Advanced → Pair a device. Scanning or pasting fills the URL + passphrase above automatically.</Text>
      </View>
      <View style={styles.labeled}>
        <Text style={styles.label}>On-device scout</Text>
        <View style={styles.seg}>
          {(['auto', 'on', 'off'] as ScoutMode[]).map((m) => (
            <Pressable key={m} style={[styles.segBtn, scout === m && styles.segBtnOn]} onPress={() => pickScout(m)}>
              <Text style={[styles.segText, scout === m && styles.segTextOn]}>{m === 'auto' ? 'Auto' : m === 'on' ? 'On' : 'Off'}</Text>
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
              <Text style={[styles.segText, pref === m && styles.segTextOn]}>{m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'System'}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.help}>{pref === 'system' ? 'Follows your device light/dark setting.' : `Always ${pref}.`}</Text>
      </View>
      {url ? <MailIngestPanel reloadSignal={mailReload} /> : null}
    </>
  );
  const syncBottom = (
    <>
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
    </>
  );
  const navRow = (label: string, help: string, onPress: () => void) => (
    <Pressable style={styles.profileRow} onPress={onPress}>
      <View style={styles.flex1}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.help}>{help}</Text>
      </View>
      <Text style={styles.profileChev}>›</Text>
    </Pressable>
  );
  const navRows = (
    <>
      {navRow('Profile · apply-assist', 'Name, links, education, work history, EEO + résumé upload', onEditProfile)}
      {navRow('Search criteria', 'Role titles, keywords, min-fit, salary floor + remote', onEditSearch)}
      {navRow('Tiers & rules', 'A/B/C thresholds, scout merge tier, follow-up days, AI drafts', onEditRules)}
      {navRow('Saved answers', 'Reusable Q&A + saved AI drafts — searchable, tagged', onEditAnswers)}
      {navRow('Build CV', 'Generate a .docx / PDF CV from your profile + narratives', onBuildCv)}
      {navRow('How scoring works', 'What Fit, Interview probability, EV, and tiers mean', onOpenGuide)}
    </>
  );

  // iPad: centered split panel — section list + content pane (hosts the sub-screens directly).
  if (wide) {
    const back = () => setSection('sync');
    const pane =
      section === 'profile' ? <ProfileScreen onBack={back} />
        : section === 'search' ? <SearchCriteriaScreen onBack={back} />
        : section === 'rules' ? <TiersRulesScreen onBack={back} />
        : section === 'answers' ? <SavedAnswersScreen onBack={back} />
        : section === 'cv' ? <BuildCvScreen onBack={back} />
        : section === 'guide' ? <ScoringGuideScreen onBack={back} />
        : (
          <ScrollView
            contentContainerStyle={styles.synPane}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {syncTop}
            {syncBottom}
          </ScrollView>
        );
    return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <KeyboardAvoidingView style={styles.wideBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.title}>Settings</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.cancel}>Done</Text>
              </Pressable>
            </View>
            <View style={styles.split}>
              <View style={styles.sectionList}>
                {SECTIONS.map((s) => (
                  <Pressable key={s.key} style={[styles.sectionItem, section === s.key && styles.sectionItemOn]} onPress={() => setSection(s.key)}>
                    <Text style={[styles.sectionItemText, section === s.key && styles.sectionItemTextOn]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.pane}>{pane}</View>
            </View>
          </View>
        </KeyboardAvoidingView>
        <PairScanModal visible={scanOpen} onClose={() => setScanOpen(false)} onPaired={applyPairing} />
      </Modal>
    );
  }

  // Phone: bottom sheet (unchanged) — sync config, then the nav rows that push full-screen.
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.sheet}>
          <View style={styles.headRow}>
            <Text style={styles.title}>Sync</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.cancel}>Done</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {syncTop}
            {navRows}
            {syncBottom}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      <PairScanModal visible={scanOpen} onClose={() => setScanOpen(false)} onPaired={applyPairing} />
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
  form: { gap: 14, paddingBottom: 32 },
  help: { fontFamily: fonts.sans, fontSize: 13, color: c.muted, lineHeight: 19 },
  labeled: { gap: 6 },
  label: { fontFamily: fonts.sans, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: c.muted },
  fieldHint: { fontFamily: fonts.sans, fontSize: 11, color: c.muted, lineHeight: 15 },
  seg: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, backgroundColor: c.element, borderWidth: 1, borderColor: c.element, alignItems: 'center' },
  segBtnOn: { borderColor: alpha(c.emerald, 0.5), backgroundColor: alpha(c.emerald, 0.1) },
  segText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500', color: c.textBase },
  segTextOn: { color: c.emerald },
  flex1: { flex: 1 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.element, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  profileChev: { fontSize: 22, color: c.muted, lineHeight: 22 },
  serverOnly: { fontFamily: fonts.sans, fontSize: 11, color: c.muted, lineHeight: 16, fontStyle: 'italic' },
  input: { backgroundColor: c.element, borderWidth: 1, borderColor: c.element, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, color: c.textHigh, fontFamily: fonts.sans, fontSize: 15 },
  status: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnGhost: { backgroundColor: c.element, borderWidth: 1, borderColor: c.element },
  btnGhostText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '500', color: c.textHigh },
  btnPrimary: { backgroundColor: c.emerald },
  btnPrimaryText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '700', color: c.canvas },
  // ---- wide split panel ----
  wideBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '94%', maxWidth: 880, height: '88%', backgroundColor: c.canvas, borderRadius: 18, borderWidth: 1, borderColor: c.element, overflow: 'hidden' },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.element },
  split: { flex: 1, flexDirection: 'row' },
  sectionList: { width: 200, backgroundColor: c.element, paddingVertical: 8, paddingHorizontal: 8, gap: 2 },
  sectionItem: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 9 },
  sectionItemOn: { backgroundColor: alpha(c.emerald, 0.12) },
  sectionItemText: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase },
  sectionItemTextOn: { color: c.emerald, fontWeight: '600' },
  pane: { flex: 1, minWidth: 0 },
  synPane: { gap: 14, padding: 20, paddingBottom: 32 },
});
