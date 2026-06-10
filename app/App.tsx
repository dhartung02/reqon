import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { computeTier, expectedValue } from '@reqon/core';
import { colors, tierColor } from './src/theme';

// Proof-of-life: the app entry imports the SAME shared core the server and extension use
// (repo-root core/crm-core.js, via the @reqon/core alias) and the locked Emerald Command palette
// (src/theme.ts). A real sample row is scored here so the wiring is exercised at runtime, not just
// in tests. M2 replaces this with the real UI.
const sample = { company: 'Acme', role: 'Principal PM, Data Platform', fit: 8.5, prob: 7 };
const tier = computeTier(sample.fit, sample.prob);
const ev = expectedValue(sample);

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.brand}>REQON</Text>
      <Text style={styles.tag}>Recon for your career</Text>
      <View style={styles.card}>
        <Text style={styles.role}>{sample.role}</Text>
        <View style={styles.row}>
          <Text style={[styles.tierBadge, { color: tierColor(tier) }]}>Tier {tier}</Text>
          <Text style={styles.meta}>
            EV {ev} · fit {sample.fit} / prob {sample.prob}
          </Text>
        </View>
        <Text style={styles.note}>scored by @reqon/core (shared with the server)</Text>
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  brand: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: 4 },
  tag: { color: colors.muted, fontSize: 14, marginTop: 6, marginBottom: 28 },
  card: {
    backgroundColor: colors.surface,
    borderColor: '#222A31',
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    width: '100%',
    maxWidth: 360,
  },
  role: { color: colors.text, fontSize: 17, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  tierBadge: { fontSize: 14, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 14 },
  note: { color: colors.muted, fontSize: 12, marginTop: 12, opacity: 0.7 },
});
