import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { laneOf, rolesInLane, type Lane, type SortKey, type Status } from './src/model';
import { colors, fonts } from './src/theme';
import { useRoles } from './src/store/useRoles';
import { ReqonGlyph } from './src/components/ReqonGlyph';
import { TabBar } from './src/components/TabBar';
import { ControlBar } from './src/components/ControlBar';
import { TodayScreen } from './src/screens/TodayScreen';
import { PipelineScreen } from './src/screens/PipelineScreen';
import { RoleDetailScreen } from './src/screens/RoleDetailScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { AddRoleModal } from './src/components/AddRoleModal';
import { SettingsModal } from './src/screens/SettingsModal';

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
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('ev');
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Today = actionable (non-closed) roles, highest expected value first.
  const todayRoles = useMemo(
    () => roles.filter((r) => laneOf(r.status) !== 'closed').sort((a, b) => b.score - a.score),
    [roles],
  );
  const counts = useMemo<Record<Lane, number>>(
    () => ({
      today: todayRoles.length,
      open: rolesInLane(roles, 'open').length,
      applied: rolesInLane(roles, 'applied').length,
      interviewing: rolesInLane(roles, 'interviewing').length,
      closed: rolesInLane(roles, 'closed').length,
      analytics: roles.length,
    }),
    [roles, todayRoles],
  );

  if (!fontsLoaded || loading) return null;

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
            <Pressable style={styles.syncBtn} onPress={() => setShowSettings(true)} hitSlop={6}>
              <Text style={styles.syncBtnText}>Sync</Text>
            </Pressable>
            <Pressable style={styles.addBtn} onPress={() => setShowAdd(true)} hitSlop={6}>
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
            <TodayScreen roles={todayRoles} onPressRole={(r) => setSelectedId(r.id)} />
          ) : lane === 'analytics' ? (
            <AnalyticsScreen roles={roles} />
          ) : (
            <PipelineScreen
              lane={lane}
              roles={roles}
              query={query}
              sort={sort}
              onPressRole={(r) => setSelectedId(r.id)}
            />
          )}
        </View>
      </View>
      <AddRoleModal visible={showAdd} onClose={() => setShowAdd(false)} onAdd={add} />
      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} onSynced={refresh} />
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  shell: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
  brandbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncBtn: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.element,
    borderWidth: 1,
    borderColor: colors.emerald + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.emerald },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
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
