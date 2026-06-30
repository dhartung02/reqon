import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable, AppState, ActivityIndicator, Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { rolesInLane, LANES, EMPTY_FILTER, type Lane, type StatusLane, type SortKey, type Status, type RoleFilter } from './src/model';
import { todayActionCount } from './src/today';
import { fonts, useThemedStyles, useScheme, ThemeProvider, type Palette } from './src/theme';
import { EntitlementsProvider } from './src/entitlements';
import { useRoles } from './src/store/useRoles';
import { ReqonGlyph } from './src/components/ReqonGlyph';
import { TabBar } from './src/components/TabBar';
import { BottomTabBar, type Section } from './src/components/BottomTabBar';
import { NavRail } from './src/components/NavRail';
import { ControlBar } from './src/components/ControlBar';
import { useLayout } from './src/useLayout';
import { TodayScreen } from './src/screens/TodayScreen';
import { PipelineScreen } from './src/screens/PipelineScreen';
import { RoleDetailScreen } from './src/screens/RoleDetailScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { AddRoleModal } from './src/components/AddRoleModal';
import { SettingsModal } from './src/screens/SettingsModal';
import { NotificationsModal } from './src/screens/NotificationsModal';
import { fetchNotifications } from './src/sync/notifications';
import { BrowserScreen } from './src/screens/BrowserScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { SearchCriteriaScreen } from './src/screens/SearchCriteriaScreen';
import { TiersRulesScreen } from './src/screens/TiersRulesScreen';
import { ScoringGuideScreen } from './src/screens/ScoringGuideScreen';
import { SavedAnswersScreen } from './src/screens/SavedAnswersScreen';
import { BuildCvScreen } from './src/screens/BuildCvScreen';
import { runScout } from './src/scout/scout';
import { getConfig, getScoutMode, scoutEnabled, type ScoutMode } from './src/sync/config';
import { getCriteria } from './src/sync/searchCriteria';
import { pullRules, getRules } from './src/sync/rules';
import {
  runServerScout,
  scoutStatus,
  queueServerScout,
  getQueuedScout,
  clearQueuedScout,
  type ScoutRunMode,
} from './src/sync/serverScout';
import { ScoutRunModal } from './src/screens/ScoutRunModal';
import { syncTwoWay } from './src/sync/sync';

const VIEW_TITLE: Record<Lane, string> = {
  today: "Today's perimeter",
  open: 'Open roles',
  applied: 'Applied',
  interviewing: 'Interviewing',
  closed: 'Rejected + archived',
  analytics: 'Analytics',
};

// The status lanes shown as the secondary pill row inside the Board section (phone bottom-tab nav).
const STATUS_LANES = LANES.filter((l) => l.key !== 'today' && l.key !== 'analytics');

function AppInner() {
  const { c, styles } = useThemedStyles(makeStyles);
  const { scheme } = useScheme();
  const { wide } = useLayout(); // iPad/landscape → nav rail + master-detail; phone → push nav
  const statusBar = scheme === 'light' ? 'dark' : 'light';
  const [fontsLoaded] = useFonts({
    SplineSans: require('./assets/fonts/SplineSans.ttf'),
    Fraunces: require('./assets/fonts/Fraunces.ttf'),
  });
  const { roles, loading, setStatus, setStatusMany, update, remove, add, refresh } = useRoles();
  const [lane, setLane] = useState<Lane>('today');
  const [boardLane, setBoardLane] = useState<StatusLane>('open'); // remembers the last status lane for the Board tab
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('ev');
  const [filter, setFilter] = useState<RoleFilter>(EMPTY_FILTER);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [todayRoleId, setTodayRoleId] = useState<string | null>(null); // role opened from Today → swipe-dismiss sheet
  const [unread, setUnread] = useState(0);
  const [showProfile, setShowProfile] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [showCv, setShowCv] = useState(false);
  const [cvTarget, setCvTarget] = useState<{ role: string; company: string; jd: string } | null>(null);
  const [scouting, setScouting] = useState(false);
  const [scoutMsg, setScoutMsg] = useState<string | null>(null);
  const [scoutMenu, setScoutMenu] = useState(false);
  const [queuedScout, setQueuedScout] = useState<ScoutRunMode | null>(null);
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
      // Flush any scout request queued while offline — now that the server is reachable, send it.
      const pending = await getQueuedScout();
      if (pending) {
        const r = await runServerScout(pending);
        if (r.ok || r.running) {
          await clearQueuedScout();
          setQueuedScout(null);
          setScoutMsg(`Queued scout (${pending}) sent to server — pull to refresh shortly.`);
        }
      }
    } catch {
      setSyncState((s) => ({ ...s, error: true })); // offline / unreachable — retry next foreground
    }
  }, [refresh]);

  const loadConfig = useCallback(async () => {
    const [{ url }, mode, queued] = await Promise.all([getConfig(), getScoutMode(), getQueuedScout()]);
    setServerUrl(url);
    setScoutMode(mode);
    setQueuedScout(queued);
  }, []);

  // On launch: load config, apply scoring rules (tier thresholds + follow-up days), then sync.
  // On foreground: sync. (ROADMAP FR-APP-6.)
  useEffect(() => {
    (async () => {
      await loadConfig();
      await pullRules(); // apply active tier thresholds + follow-up days before rows derive
      await refresh(); // re-derive tiers/Today with the active rules
      await autoSync();
    })();
  }, [loadConfig, autoSync, refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') autoSync();
    });
    return () => sub.remove();
  }, [autoSync]);

  // Remember the active status lane so the Board bottom-tab returns to where you left off.
  useEffect(() => {
    if (lane !== 'today' && lane !== 'analytics') setBoardLane(lane as StatusLane);
  }, [lane]);

  // Refresh the notification-bell unread badge when a server is configured + after each sync (P1.8).
  useEffect(() => {
    if (!serverUrl) { setUnread(0); return; }
    let alive = true;
    fetchNotifications().then((r) => { if (alive) setUnread(r.unread); }).catch(() => {});
    return () => { alive = false; };
  }, [serverUrl, syncState.at]);


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
      const [crit, rules] = await Promise.all([getCriteria(), getRules()]);
      const r = await runScout({
        existing: roles,
        onAdd: add,
        minFit: crit.minFit,
        remoteOnly: crit.remoteOnly,
        salaryFloor: crit.salaryFloor,
        negativeKeywords: crit.negativeKeywords,
        keywords: crit.keywords,
        titles: crit.titles,
        minTier: rules.minTierToMerge,
      });
      setScoutMsg(`Scanned ${r.scanned} · ${r.matched} matched · +${r.added} new${r.errors ? ` · ${r.errors} board errors` : ''}`);
      await refresh();
    } catch {
      setScoutMsg('Scout failed — check connection');
    }
    setScouting(false);
  };

  // Trigger the SERVER scout (fuller multi-source search + enrichment), poll to done, then sync.
  // When the server is unreachable we DON'T fake a local run — we queue the request and the next
  // successful sync sends it (see autoSync). `mode` mirrors the web board's Run-Scout menu.
  const onServerScout = async (mode: ScoutRunMode) => {
    setScoutMenu(false);
    setScouting(true);
    setScoutMsg('Starting server scout…');
    const start = await runServerScout(mode);
    if (start.offline) {
      await queueServerScout(mode);
      setQueuedScout(mode);
      setScoutMsg(`Offline — scout (${mode}) queued, will run when reconnected.`);
      setScouting(false);
      return;
    }
    if (!start.ok && !start.running) {
      setScoutMsg(start.error || 'Could not start server scout');
      setScouting(false);
      return;
    }
    // Poll status (~2.5 min cap; server hard-kills at 6). Sync as we go so results appear early.
    let st = null;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      st = await scoutStatus();
      if (st && !st.running) break;
      if (st?.phase) setScoutMsg(`Server scout… ${st.phase}`);
    }
    await autoSync();
    await refresh();
    if (st && st.running) setScoutMsg('Server scout still running — pull to refresh shortly.');
    else if (st?.error) setScoutMsg(`Server scout error: ${st.error}`);
    else setScoutMsg(`Server scout done · +${st?.added ?? 0} new · ${st?.refreshed ?? 0} refreshed`);
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
        <ActivityIndicator color={c.emerald} style={styles.loadSpin} />
        <StatusBar style={statusBar} />
      </SafeAreaView>
    );
  }

  if (showProfile) {
    return (
      <SafeAreaView style={styles.safe}>
        <ProfileScreen onBack={() => { setShowProfile(false); setShowSettings(true); }} />
        <StatusBar style={statusBar} />
      </SafeAreaView>
    );
  }

  if (showSearch) {
    return (
      <SafeAreaView style={styles.safe}>
        <SearchCriteriaScreen onBack={() => { setShowSearch(false); setShowSettings(true); }} />
        <StatusBar style={statusBar} />
      </SafeAreaView>
    );
  }

  if (showRules) {
    return (
      <SafeAreaView style={styles.safe}>
        <TiersRulesScreen onBack={() => { setShowRules(false); setShowSettings(true); refresh(); }} />
        <StatusBar style={statusBar} />
      </SafeAreaView>
    );
  }

  if (showAnswers) {
    return (
      <SafeAreaView style={styles.safe}>
        <SavedAnswersScreen onBack={() => { setShowAnswers(false); setShowSettings(true); }} />
        <StatusBar style={statusBar} />
      </SafeAreaView>
    );
  }

  if (showCv) {
    return (
      <SafeAreaView style={styles.safe}>
        <BuildCvScreen
          initialTarget={cvTarget ?? undefined}
          onBack={() => {
            const fromRole = !!cvTarget;
            setShowCv(false);
            setCvTarget(null);
            if (!fromRole) setShowSettings(true); // from a role → fall back to the role detail
          }}
        />
        <StatusBar style={statusBar} />
      </SafeAreaView>
    );
  }

  if (showGuide) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScoringGuideScreen onBack={() => { setShowGuide(false); setShowSettings(true); }} />
        <StatusBar style={statusBar} />
      </SafeAreaView>
    );
  }

  if (browserUrl) {
    return (
      <SafeAreaView style={styles.safe}>
        <BrowserScreen url={browserUrl} onBack={() => setBrowserUrl(null)} />
        <StatusBar style={statusBar} />
      </SafeAreaView>
    );
  }

  const selected = selectedId ? roles.find((r) => r.id === selectedId) ?? null : null;
  // Phone: tapping a role pushes a full-screen detail. Wide (iPad): it fills the detail pane instead.
  if (selected && !wide) {
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
          onBuildCv={(r) => {
            setCvTarget({ role: r.role, company: r.company, jd: r.notes ?? '' });
            setShowCv(true);
          }}
        />
        <StatusBar style={statusBar} />
      </SafeAreaView>
    );
  }

  const isPipeline = lane !== 'today' && lane !== 'analytics';
  // Phone bottom-tab section derived from the active lane; Settings is a modal, not a lane.
  const section: Section = lane === 'today' ? 'today' : lane === 'analytics' ? 'insights' : 'board';
  const onSection = (s: Section) => {
    if (s === 'settings') { setShowSettings(true); return; }
    if (s === 'today') setLane('today');
    else if (s === 'insights') setLane('analytics');
    else setLane(boardLane);
  };
  // The lane body (ternary preserves the StatusLane narrowing for PipelineScreen). Shared by both
  // layouts; on wide the pipeline list sits in the master column with the detail pane beside it.
  const laneBody =
    lane === 'today' ? (
      <TodayScreen
        roles={roles}
        onJump={setLane}
        onScout={onScout}
        onServerScout={() => setScoutMenu(true)}
        scouting={scouting}
        scoutMsg={scoutMsg}
        scoutEnabled={scoutOn}
        refreshing={refreshing}
        onRefresh={onRefresh}
        serverConfigured={!!serverUrl}
        syncState={syncState}
        onOpenRole={setTodayRoleId}
      />
    ) : lane === 'analytics' ? (
      <AnalyticsScreen roles={roles} refreshing={refreshing} onRefresh={onRefresh} />
    ) : (
      <PipelineScreen
        lane={lane}
        roles={roles}
        query={query}
        sort={sort}
        filter={filter}
        onPressRole={(r) => setSelectedId(r.id)}
        onBulkStatus={setStatusMany}
        refreshing={refreshing}
        onRefresh={onRefresh}
        activeId={wide ? selectedId : null}
      />
    );
  const controlBar = <ControlBar query={query} onQuery={setQuery} sort={sort} onSort={setSort} filter={filter} onFilter={setFilter} />;
  const detailPane = selected ? (
    <RoleDetailScreen
      key={selected.id}
      role={selected}
      onBack={() => setSelectedId(null)}
      onStatusChange={(s: Status) => setStatus(selected.id, s)}
      onUpdate={(patch) => update(selected.id, patch)}
      onDelete={() => { remove(selected.id); setSelectedId(null); }}
      onOpenPosting={(u) => setBrowserUrl(u)}
      onBuildCv={(r) => { setCvTarget({ role: r.role, company: r.company, jd: r.notes ?? '' }); setShowCv(true); }}
      embedded
    />
  ) : (
    <View style={styles.detailEmpty}>
      <Text style={styles.detailEmptyText}>Select a role to view details, apply, or change its status.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {wide ? (
        <View style={styles.wideShell}>
          <NavRail active={lane} counts={counts} onChange={setLane} onAdd={() => setShowAdd(true)} onSettings={() => setShowSettings(true)} onNotifications={() => setShowNotifs(true)} unread={unread} />
          <View style={styles.wideContent}>
            <Text style={styles.wideTitle}>{VIEW_TITLE[lane]}</Text>
            {isPipeline ? (
              <View style={styles.masterDetail}>
                <View style={styles.master}>
                  {controlBar}
                  <View style={styles.masterList}>{laneBody}</View>
                </View>
                <View style={styles.detail}>{detailPane}</View>
              </View>
            ) : (
              <View style={styles.body}>{laneBody}</View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.shell}>
          <View style={styles.topActions}>
            <Pressable style={styles.iconBtn} onPress={() => setShowNotifs(true)} hitSlop={22} accessibilityLabel="Notifications">
              <Text style={styles.bell}>🔔</Text>
              {unread > 0 ? (
                <View style={styles.badge}><Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text></View>
              ) : null}
            </Pressable>
            <Pressable style={styles.addBtn} onPress={() => setShowAdd(true)} hitSlop={14} accessibilityLabel="Add a job">
              <Text style={styles.addBtnText}>+</Text>
            </Pressable>
          </View>

          {section === 'board' ? (
            <>
              <Text style={styles.screenTitle}>Your jobs</Text>
              <TabBar lanes={STATUS_LANES} active={lane} counts={counts} onChange={(l) => { setBoardLane(l as StatusLane); setLane(l); }} />
              {controlBar}
            </>
          ) : section === 'insights' ? (
            <Text style={styles.screenTitle}>Insights</Text>
          ) : null}

          <View style={styles.body}>{laneBody}</View>

          <BottomTabBar active={showSettings ? 'settings' : section} onChange={onSection} />
        </View>
      )}
      <AddRoleModal visible={showAdd} onClose={() => setShowAdd(false)} onAdd={add} />
      <ScoutRunModal
        visible={scoutMenu}
        onClose={() => setScoutMenu(false)}
        onPick={onServerScout}
        queued={queuedScout}
        onCancelQueue={() => {
          clearQueuedScout();
          setQueuedScout(null);
        }}
      />
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
        onEditSearch={() => {
          setShowSettings(false);
          setShowSearch(true);
        }}
        onEditRules={() => {
          setShowSettings(false);
          setShowRules(true);
        }}
        onEditAnswers={() => {
          setShowSettings(false);
          setShowAnswers(true);
        }}
        onBuildCv={() => {
          setShowSettings(false);
          setCvTarget(null); // general CV from Settings; role-tailored entry comes from a role
          setShowCv(true);
        }}
        onOpenGuide={() => {
          setShowSettings(false);
          setShowGuide(true);
        }}
      />
      <NotificationsModal visible={showNotifs} onClose={() => setShowNotifs(false)} onUnreadChange={setUnread} />
      {/* Role opened from Today → a swipe-to-dismiss sheet over Today, so Back (or swipe down on iOS)
          returns you exactly where you were instead of switching lanes. */}
      <Modal
        visible={!!todayRoleId && !!roles.find((r) => r.id === todayRoleId)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTodayRoleId(null)}
      >
        <SafeAreaView style={styles.safe}>
          {(() => {
            const r = roles.find((x) => x.id === todayRoleId);
            if (!r) return null;
            return (
              <RoleDetailScreen
                key={r.id}
                role={r}
                onBack={() => setTodayRoleId(null)}
                onStatusChange={(s: Status) => setStatus(r.id, s)}
                onUpdate={(patch) => update(r.id, patch)}
                onDelete={() => { remove(r.id); setTodayRoleId(null); }}
                onOpenPosting={(u) => setBrowserUrl(u)}
                onBuildCv={(role) => { setCvTarget({ role: role.role, company: role.company, jd: role.notes ?? '' }); setShowCv(true); setTodayRoleId(null); }}
              />
            );
          })()}
        </SafeAreaView>
      </Modal>
      <StatusBar style={statusBar} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <EntitlementsProvider>
        <AppInner />
      </EntitlementsProvider>
    </ThemeProvider>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.canvas },
  center: { alignItems: 'center', justifyContent: 'center' },
  loadSpin: { marginTop: 16 },
  shell: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
  topActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 8 },
  screenTitle: { fontFamily: fonts.serif, fontSize: 26, fontWeight: '600', color: c.textHigh, letterSpacing: -0.3, marginBottom: 10 },
  brandbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bell: { fontSize: 16 },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.sans, fontSize: 10, fontWeight: '700', color: '#fff' },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: c.element,
    borderWidth: 1,
    borderColor: c.element,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: c.element,
    borderWidth: 1,
    borderColor: c.emerald + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { fontSize: 22, lineHeight: 24, color: c.emerald, fontWeight: '600' },
  brand: { fontFamily: fonts.sans, fontSize: 10, fontWeight: '600', letterSpacing: 2.6, color: c.emerald },
  title: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: c.textHigh, letterSpacing: -0.2 },
  body: { flex: 1 },
  // ---- wide (iPad) layout ----
  wideShell: { flex: 1, flexDirection: 'row' },
  wideContent: { flex: 1, paddingHorizontal: 20, paddingTop: 10, minWidth: 0 },
  wideTitle: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: c.textHigh, marginBottom: 6 },
  masterDetail: { flex: 1, flexDirection: 'row', gap: 16 },
  master: { flex: 1, minWidth: 0 },
  masterList: { flex: 1 },
  detail: { flex: 1, minWidth: 0, borderLeftWidth: 1, borderLeftColor: c.element, paddingLeft: 16 },
  detailEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  detailEmptyText: { fontFamily: fonts.sans, fontSize: 14, color: c.muted, textAlign: 'center', lineHeight: 20 },
});
