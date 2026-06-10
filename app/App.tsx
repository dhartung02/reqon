import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { computeTier, expectedValue } from '@reqon/core';

// Proof-of-life: the app entry imports the SAME shared core the server and extension use
// (repo-root core/crm-core.js, via the @reqon/core alias). A real sample row is scored here so
// the wiring is exercised at runtime, not just in tests. M2 replaces this with the real UI.
const sample = { company: 'Acme', role: 'Principal PM, Data Platform', fit: 8.5, prob: 7 };
const tier = computeTier(sample.fit, sample.prob);
const ev = expectedValue(sample);

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Reqon</Text>
      <Text style={styles.tag}>Recon for your career</Text>
      <View style={styles.card}>
        <Text style={styles.role}>{sample.role}</Text>
        <Text style={styles.meta}>
          Tier {tier} · EV {ev} · fit {sample.fit} / prob {sample.prob}
        </Text>
        <Text style={styles.note}>scored by @reqon/core (shared with the server)</Text>
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0D10',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  brand: { color: '#E8EAED', fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  tag: { color: '#7C8693', fontSize: 14, marginTop: 4, marginBottom: 28 },
  card: {
    backgroundColor: '#14181D',
    borderColor: '#222A31',
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    width: '100%',
    maxWidth: 360,
  },
  role: { color: '#E8EAED', fontSize: 17, fontWeight: '600' },
  meta: { color: '#9AA4AF', fontSize: 14, marginTop: 8 },
  note: { color: '#5A6470', fontSize: 12, marginTop: 12 },
});
