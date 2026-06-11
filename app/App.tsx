import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
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
  const { roles, loading, setStatus } = useRoles();
  const [lane, setLane] = useState<Lane>('today');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('ev');

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
          role={selected}
          onBack={() => setSelectedId(null)}
          onStatusChange={(s: Status) => setStatus(selected.id, s)}
        />
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.shell}>
        <View style={styles.brandbar}>
          <ReqonGlyph size={26} />
          <View>
            <Text style={styles.brand}>REQON</Text>
            <Text style={styles.title}>{VIEW_TITLE[lane]}</Text>
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
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  shell: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
  brandbar: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 16 },
  brand: { fontFamily: fonts.sans, fontSize: 10, fontWeight: '600', letterSpacing: 2.6, color: colors.emerald },
  title: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', color: colors.textHigh, letterSpacing: -0.2 },
  body: { flex: 1 },
});
