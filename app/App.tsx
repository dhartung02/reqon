import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable, AppState, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { rolesInLane, type Lane, type SortKey, type Status } from './src/model';
import { todayActionCount } from './src/today';
import { colors, fonts } from './src/theme';
import { useRoles } from './src/store/useRoles';
import { ReqonGlyph } from './src/components/ReqonGlyph';
import { SettingsIcon } from './src/components/SettingsIcon';
import { TabBar } from './src/components/TabBar';
import { ControlBar } from './src/components/ControlBar';
import { TodayScreen } from './src/screens/TodayScreen';
import { PipelineScreen } from './src/screens/PipelineScreen';
import { RoleDetailScreen } from './src/screens/RoleDetailScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { AddRoleModal } from './src/components/AddRoleModal';
import { SettingsModal } from './src/screens/SettingsModal';
import { BrowserScreen } from './src/screens/BrowserScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { runScout } from './src/scout/scout';
import { getConfig, getScoutMode, scoutEnabled, type ScoutMode } from './src/sync/config';
import { syncTwoWay } from './src/sync/sync';

const VIEW_TITLE: Record<Lane, string> = {
  today: "Today's perimeter",
  open: 'Open roles',
  applied: 'Applied',
  interviewing: 'Interviewing',
  closed: 'Rejected + archived',
  analytics: 'Analytics',
};

export default function App() {
  const [fontsLoaded] = useFonts({
    SplineSans: require('./assets/fonts/SplineSans.ttf'),
    Fraunces: require('./assets/fonts/Fraunces.ttf'),
  });
  const { roles, loading, setStatus, update, remove, add, refresh } = useRoles();
  const [lane, setLane] = useState<Lane>('today');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('ev');
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [scouting, setScouting] = useState(false);
  const [scoutMsg, setScoutMsg] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [scoutMode, setScoutMode] = useState<ScoutMode>('auto');

  const [syncState, setSyncState] = useState<{ at?: number; error?: boolean }>({});

  // Auto-sync: silent push+pull whenever configured. Manual "Sync now" remains a force option.
  const autoSync = useCallback(async () => {
    const { url } = await getConfig();
    if (!url) return;
    try {
      await syncTwoWay();
      await refresh();
      setSyncState({ at: Date.now() });
    } catch {
      setSyncState((s) => ({ ...s, error: true })); // offline / unreachable — retry next foreground
    }
  }, [refresh]);

  const loadConfig = useCallback(async () => {
    const [{ url }, mode] = await Promise.all([getConfig(), getScoutMode()]);
    setServerUrl(url);
    setScoutMode(mode);
  }, []);

  // On launch: load config + sync. On foreground: sync. (ROADMAP FR-APP-6.)
  useEffect(() => {
    (async () => {
      await loadConfig();
      await autoSync();
    })();
  }, [loadConfig, autoSync]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') autoSync();
    });
    return () => sub.remove();
  }, [autoSync]);

  const scoutOn = scoutEnabled(scoutMode, !!serverUrl);

  // Pull-to-refresh: sync (if configured) + re-read the store.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await autoSync();
    await refresh();
    setRefreshing(false);
  }, [autoSync, refresh]);

  const onScout = async () => {
    setScouting(true);
    setScoutMsg(null);
    try {
      const r = await runScout({ existing: roles, onAdd: add });
      setScoutMsg(`Scanned ${r.scanned} · ${r.matched} matched · +${r.added} new${r.errors ? ` · ${r.errors} board errors` : ''}`);
      await refresh();
    } catch {
      setScoutMsg('Scout failed — check connection');
    }
    setScouting(false);
  };

  // Today = actionable (non-closed) roles, highest expected value first.
  const counts = useMemo<Record<Lane, number>>(
    () => ({
      today: todayActionCount(roles),
      open: rolesInLane(roles, 'open').length,
      applied: rolesInLane(roles, 'applied').length,
      interviewing: rolesInLane(roles, 'interviewing').length,
      closed: rolesInLane(roles, 'closed').length,
      analytics: roles.length,
    }),
    [roles],
  );

  if (!fontsLoaded || loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ReqonGlyph size={44} />
        <ActivityIndicator color={colors.emerald} style={styles.loadSpin} />
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  if (showProfile) {
    return (
      <SafeAreaView style={styles.safe}>
        <ProfileScreen onBack={() => setShowProfile(false)} />
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  if (browserUrl) {
    return (
      <SafeAreaView style={styles.safe}>
        <BrowserScreen url={browserUrl} onBack={() => setBrowserUrl(null)} />
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  const selected = selectedId ? roles.find((r) => r.id === selectedId) ?? null : null;
  if (selected) {
    return (
      <SafeAreaView style={styles.safe}>
        <RoleDetailScreen
          key={selected.id}
          role={selected}
          onBack={() => setSelectedId(null)}
          onStatusChange={(s: Status) => setStatus(selected.id, s)}
          onUpdate={(patch) => update(selected.id, patch)}
          onDelete={() => {
            remove(selected.id);
            setSelectedId(null);
          }}
          onOpenPosting={(u) => setBrowserUrl(u)}
        />
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.shell}>
        <View style={styles.brandbar}>
          <View style={styles.brandLeft}>
            <ReqonGlyph size={26} />
            <View>
              <Text style={styles.brand}>REQON</Text>
              <Text style={styles.title}>{VIEW_TITLE[lane]}</Text>
            </View>
          </View>
          <View style={styles.brandRight}>
            <Pressable style={styles.iconBtn} onPress={() => setShowSettings(true)} hitSlop={14} accessibilityLabel="Settings & sync">
              <SettingsIcon size={18} color={colors.textBase} />
            </Pressable>
            <Pressable style={styles.addBtn} onPress={() => setShowAdd(true)} hitSlop={14} accessibilityLabel="Add role">
              <Text style={styles.addBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        <TabBar active={lane} counts={counts} onChange={setLane} />

        {lane !== 'today' && lane !== 'analytics' ? (
          <ControlBar query={query} onQuery={setQuery} sort={sort} onSort={setSort} />
        ) : null}

        <View style={styles.body}>
          {lane === 'today' ? (
            <TodayScreen
              roles={roles}
              onJump={setLane}
              onScout={onScout}
              scouting={scouting}
              scoutMsg={scoutMsg}
              scoutEnabled={scoutOn}
              refreshing={refreshing}
              onRefresh={onRefresh}
              serverConfigured={!!serverUrl}
              syncState={syncState}
            />
          ) : lane === 'analytics' ? (
            <AnalyticsScreen roles={roles} refreshing={refreshing} onRefresh={onRefresh} />
          ) : (
            <PipelineScreen
              lane={lane}
              roles={roles}
              query={query}
              sort={sort}
              onPressRole={(r) => setSelectedId(r.id)}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          )}
        </View>
      </View>
      <AddRoleModal visible={showAdd} onClose={() => setShowAdd(false)} onAdd={add} />
      <SettingsModal
        visible={showSettings}
        onClose={() => {
          setShowSettings(false);
          loadConfig().then(autoSync);
        }}
        onSynced={refresh}
        onEditProfile={() => {
          setShowSettings(false);
          setShowProfile(true);
        }}
      />
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  center: { alignItems: 'center', justifyContent: 'center' },
  loadSpin: { marginTop: 16 },
  shell: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
  brandbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: colors.element,
    borderWidth: 1,
    borderColor: colors.element,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: colors.element,
    borderWidth: 1,
    borderColor: colors.emerald + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { fontSize: 22, lineHeight: 24, color: colors.emerald, fontWeight: '600' },
  brand: { fontFamily: fonts.sans, fontSize: 10, fontWeight: '600', letterSpacing: 2.6, color: colors.emerald },
  title: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: colors.textHigh, letterSpacing: -0.2 },
  body: { flex: 1 },
});
