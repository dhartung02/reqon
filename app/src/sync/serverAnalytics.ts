import { getConfig } from './config';
import { timedFetch } from './http';

// Server-computed analytics (parity with the web). The app fetches this when a server is configured
// and renders it; standalone/offline it falls back to local pipelineMetrics/pipelineHealth. Computing
// once on the server means the app and web always show identical numbers (no "69 vs 104" drift).
const normalize = (u: string) => u.trim().replace(/\/+$/, '');

export interface Dist { key: string; count: number }
export interface SourceRow { source: string; roles: number; abPct: number; appPct: number; respPct: number; intPct: number; closedPct: number; dup: number }
export interface ServerAnalytics {
  metrics: { total: number; applied: number; recruiter: number; hm: number; panel: number; offer: number; rejected: number; archived: number; notApplied: number; responseRate: number; offerRate: number; rejectRate: number; ttr: number | null; ttrN: number };
  funnel: { stage: string; count: number }[];
  outcomes: { awaiting: number; interview: number; offer: number; rejected: number };
  tiers: { A: number; B: number; C: number };
  distributions: { sector: Dist[]; tier: Dist[]; remote: Dist[]; company: Dist[] };
  sourceQuality: SourceRow[];
  health: { band: 'Good' | 'Fair' | 'At risk'; score: number; mainRisk: string; recommendations: string[]; metrics: Record<string, number | null> };
}

export async function fetchServerAnalytics(): Promise<{ data?: ServerAnalytics; error?: string }> {
  const { url, token } = await getConfig();
  if (!url) return { error: 'standalone' };
  try {
    const r = await timedFetch(`${normalize(url)}/api/analytics`, { headers: { 'X-CRM-Token': token } });
    const j = await r.json();
    if (!r.ok || !j.ok) return { error: j.error || `HTTP ${r.status}` };
    return { data: j as ServerAnalytics };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'network error' };
  }
}
