import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { featureMap, resolvePlan, tierLabel as coreTierLabel, type Plan } from '@reqon/core';
import { getConfig } from './sync/config';
import { timedFetch } from './sync/http';

// App-side mirror of the freemium tier model. The authoritative plan comes from the configured
// server's GET /api/entitlements (it knows owner/license/self-host); when no server is configured
// the app runs on the FREE plan — the core CRM works fully offline, and the AI/cloud features
// (which need a server anyway) present as locked. Fail-open on unknown keys, matching the server.

const FREE_PLAN = resolvePlan({}); // { tier:'free', cloud:false, ai:false, ... }
const FREE_FEATURES = featureMap(FREE_PLAN);

interface EntState {
  plan: Plan;
  features: Record<string, boolean>;
  tierLabel: string;
  loading: boolean;
  /** Re-fetch from the server (call after the sync config changes). */
  refresh: () => Promise<void>;
  /** Is this feature unlocked for the current plan? (unknown key → true, fail-open) */
  has: (feature: string) => boolean;
  /** The package a locked feature needs, capitalized, for upgrade copy. */
  requires: (feature: string) => string;
}

const Ctx = createContext<EntState | null>(null);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<Plan>(FREE_PLAN);
  const [features, setFeatures] = useState<Record<string, boolean>>(FREE_FEATURES);
  const [label, setLabel] = useState<string>(coreTierLabel(FREE_PLAN.tier));
  const [requireMap, setRequireMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { url, token } = await getConfig();
      if (!url) {
        // Local-only: free plan (AI/cloud need a server).
        setPlan(FREE_PLAN); setFeatures(FREE_FEATURES); setLabel(coreTierLabel(FREE_PLAN.tier)); setRequireMap({});
        return;
      }
      const base = url.replace(/\/+$/, '');
      const res = await timedFetch(`${base}/api/entitlements`, { headers: token ? { 'X-CRM-Token': token } : {} }, 8000);
      const j = await res.json();
      if (j && j.ok) {
        setPlan(j.plan as Plan);
        setFeatures(j.features || {});
        setLabel(j.tierLabel || coreTierLabel((j.plan && j.plan.tier) || 'free'));
        setRequireMap(j.requires || {});
      }
    } catch {
      // Network/offline: keep whatever we last had (or free). Never hard-block the UI.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo<EntState>(() => ({
    plan, features, tierLabel: label, loading, refresh,
    has: (f: string) => features[f] !== false,
    requires: (f: string) => { const p = requireMap[f]; return p ? p[0].toUpperCase() + p.slice(1) : 'paid'; },
  }), [plan, features, label, loading, refresh, requireMap]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntitlements(): EntState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEntitlements must be used within <EntitlementsProvider>');
  return v;
}
