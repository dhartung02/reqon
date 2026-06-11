import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { colors, alpha } from '../theme';
import { ReqonGlyph } from '../components/ReqonGlyph';
import { RoleCard, type PipelineRole } from '../components/RoleCard';

// "Today's Perimeter" — the app's command center (BRAND design). Header + scout status + the
// scored pipeline. Data is passed in already scored by @reqon/core (see App.tsx). Fonts fall back
// to system for now; brand faces (Spline Sans / Fraunces) load via expo-font in a later pass.
export function TodayScreen({ roles }: { roles: PipelineRole[] }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.h1}>Today's Perimeter</Text>
            <Text style={styles.sub}>Reqon Scout active • {roles.length} roles tracked</Text>
          </View>
          <View style={styles.glyphBox}>
            <ReqonGlyph size={24} color={colors.emerald} variant="reticle" />
          </View>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>SCORED PIPELINE</Text>
          <Text style={styles.signal}>98% Signal</Text>
        </View>

        <View style={styles.list}>
          {roles.map((r) => (
            <RoleCard key={r.id} role={r} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  scroll: { padding: 24, gap: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.element,
    paddingBottom: 16,
  },
  headerText: { flex: 1 },
  h1: { fontSize: 24, fontWeight: '600', color: colors.textHigh, letterSpacing: -0.3 },
  sub: { fontSize: 13, color: colors.muted, marginTop: 4 },
  glyphBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.element,
    borderWidth: 1,
    borderColor: alpha(colors.emerald, 0.2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 2.2, // ~0.18em at 12px
    color: colors.muted,
  },
  signal: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.emerald,
    backgroundColor: alpha(colors.emerald, 0.1),
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  list: { gap: 16 },
});
