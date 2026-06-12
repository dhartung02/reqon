import * as SecureStore from 'expo-secure-store';
import { DEFAULT_TIER_THRESHOLDS, type Tier, type TierThresholds } from '@reqon/core';
import { getConfig } from './config';
import { setActiveTier } from '../model';
import { setFollowupDays } from '../today';

// Scoring & product rules — the parts of the server's product config the app mirrors and can edit
// (server-optional). Tier thresholds also override the shared core's tiering on device. Infra
// (SMTP / APNs / tokens / scheduling / AI keys + budgets) stays server-side by design.
export interface Rules {
  tierThresholds: Required<TierThresholds>; // A needs ev≥aEv & fit≥aFit & prob≥aProb; B needs ev≥bEv
  minTierToMerge: Tier; // lowest tier the scout will add
  followupDays: number; // Today "follow-up due" threshold
  assistEnabled: boolean; // server AI draft assistant (applies when synced)
}

const KEY = 'reqon.rules';
export const DEFAULT_RULES: Rules = {
  tierThresholds: { ...DEFAULT_TIER_THRESHOLDS },
  minTierToMerge: 'B',
  followupDays: 7,
  assistEnabled: true,
};

const normalize = (u: string) => u.trim().replace(/\/+$/, '');
const num = (v: unknown, d: number) => (v != null && !isNaN(+v) ? +v : d);
const tier = (v: unknown): Tier => (v === 'A' || v === 'B' || v === 'C' ? v : 'B');

export async function getRules(): Promise<Rules> {
  const v = await SecureStore.getItemAsync(KEY);
  if (!v) return clone(DEFAULT_RULES);
  try {
    const p = JSON.parse(v) as Partial<Rules>;
    return {
      tierThresholds: { ...DEFAULT_RULES.tierThresholds, ...(p.tierThresholds || {}) },
      minTierToMerge: tier(p.minTierToMerge),
      followupDays: num(p.followupDays, 7),
      assistEnabled: p.assistEnabled !== false,
    };
  } catch {
    return clone(DEFAULT_RULES);
  }
}

export async function setRules(r: Rules): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(r));
}

/** Push the active rules into the pure modules that read them synchronously (core tiering + Today). */
export function applyRules(r: Rules): void {
  setActiveTier(r.tierThresholds);
  setFollowupDays(r.followupDays);
}

function fromSettings(s: Record<string, unknown>): Rules {
  const t = (s.tierThresholds as Partial<TierThresholds>) || {};
  const hygiene = (s.hygiene as { followupDays?: number }) || {};
  const assist = (s.assist as { enabled?: boolean }) || {};
  return {
    tierThresholds: {
      aEv: num(t.aEv, DEFAULT_RULES.tierThresholds.aEv),
      aFit: num(t.aFit, DEFAULT_RULES.tierThresholds.aFit),
      aProb: num(t.aProb, DEFAULT_RULES.tierThresholds.aProb),
      bEv: num(t.bEv, DEFAULT_RULES.tierThresholds.bEv),
    },
    minTierToMerge: tier(s.minTierToMerge),
    followupDays: num(hygiene.followupDays, 7),
    assistEnabled: assist.enabled !== false,
  };
}

/** Pull rules from the server (subset of /api/settings); falls back to local. Applies them too. */
export async function pullRules(): Promise<Rules> {
  const { url, token } = await getConfig();
  if (!url) {
    const local = await getRules();
    applyRules(local);
    return local;
  }
  try {
    const r = await fetch(`${normalize(url)}/api/settings`, { headers: { 'X-CRM-Token': token } });
    const j = await r.json();
    if (r.ok && j.ok) {
      const rules = fromSettings(j);
      await setRules(rules);
      applyRules(rules);
      return rules;
    }
  } catch {
    /* offline — use local */
  }
  const local = await getRules();
  applyRules(local);
  return local;
}

/** Save local + apply + push the rules subset to the server (if configured). */
export async function pushRules(r: Rules): Promise<{ ok: boolean; error?: string }> {
  await setRules(r);
  applyRules(r);
  const { url, token } = await getConfig();
  if (!url) return { ok: true };
  try {
    const res = await fetch(`${normalize(url)}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token },
      body: JSON.stringify({
        tierThresholds: r.tierThresholds,
        minTierToMerge: r.minTierToMerge,
        hygiene: { followupDays: r.followupDays },
        assistEnabled: r.assistEnabled,
      }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) return { ok: false, error: j.error || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

function clone(r: Rules): Rules {
  return { ...r, tierThresholds: { ...r.tierThresholds } };
}
