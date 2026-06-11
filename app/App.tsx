import { StatusBar } from 'expo-status-bar';
import { computeTier, expectedValue } from '@reqon/core';
import { TodayScreen } from './src/screens/TodayScreen';
import type { PipelineRole } from './src/components/RoleCard';

// Sample roles scored through the SHARED core (computeTier + expectedValue) — the same logic the
// server runs — then rendered by the Today screen. M3 replaces this seed with the local store.
const SEED = [
  { id: '1', role: 'Principal Systems Architect', company: 'Autonomous Infrastructure Corp', fit: 9.4, prob: 9, age: '2h ago', status: 'Scouted via Clip', action: 'Review Draft Voice' },
  { id: '2', role: 'Director of Engineering (Local-First)', company: 'Cryptographic Systems Inc', fit: 7.8, prob: 9, age: '1d ago', status: 'Sync Pending', action: 'Verify Fit' },
  { id: '3', role: 'Senior Technical Lead', company: 'Mass-Market Logistics Group', fit: 4.2, prob: 8, age: '3d ago' },
];

const roles: PipelineRole[] = SEED.map((r) => ({
  id: r.id,
  role: r.role,
  company: r.company,
  age: r.age,
  status: r.status,
  action: r.action,
  tier: computeTier(r.fit, r.prob),
  score: expectedValue({ fit: r.fit, prob: r.prob }),
}));

export default function App() {
  return (
    <>
      <TodayScreen roles={roles} />
      <StatusBar style="light" />
    </>
  );
}
