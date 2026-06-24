import { getConfig } from './config';

// Read-only server status for the app Settings "catch-up" panel (P1.9) — surfaces the newest
// high-value web settings (AI model, salary target, sources, digest) without making the app a
// full settings editor. Pulls the same /api/settings payload the web board uses.
const normalize = (u: string) => u.trim().replace(/\/+$/, '');

export interface ServerStatus {
  aiModel?: string;
  aiEnabled?: boolean;
  aiKeySet?: boolean;
  salaryTarget?: number;
  salaryFloor?: number;
  sourcesEnabled?: number;
  sourcesTotal?: number;
  digestEnabled?: boolean;
  digestChannels?: string[];
  remoteOnly?: boolean;
  error?: string;
}

export async function fetchServerStatus(): Promise<ServerStatus> {
  const { url, token } = await getConfig();
  if (!url) return { error: 'No sync server configured.' };
  try {
    const r = await fetch(`${normalize(url)}/api/settings`, { headers: { 'X-CRM-Token': token } });
    const j = await r.json();
    if (!r.ok || !j.ok) return { error: j.error || `HTTP ${r.status}` };
    const sources = Array.isArray(j.sources) ? j.sources : [];
    return {
      aiModel: (j.assist && j.assist.model) || (j.llm && j.llm.model),
      aiEnabled: j.assist && j.assist.enabled,
      aiKeySet: j.llm && j.llm.keySet,
      salaryTarget: j.salaryTarget,
      salaryFloor: j.salaryFloor,
      sourcesEnabled: sources.filter((s: { enabled?: boolean }) => s.enabled).length,
      sourcesTotal: sources.length,
      digestEnabled: j.digest && j.digest.enabled,
      digestChannels: (j.digest && j.digest.channels) || [],
      remoteOnly: j.remoteOnly,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'network error' };
  }
}
