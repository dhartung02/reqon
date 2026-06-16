import { getConfig } from './config';

// Trigger and poll the SERVER-side scout (the fuller multi-source search + enrichment that runs on
// the Mac), as opposed to the on-device scout. The server runs it async; we poll status to done.
const normalize = (u: string) => u.trim().replace(/\/+$/, '');

export interface ScoutStatus {
  running: boolean;
  phase?: string;
  added?: number;
  refreshed?: number;
  error?: string;
}

/** Kick off a server scout run (mode: find + validate). Returns immediately; poll with scoutStatus. */
export async function runServerScout(): Promise<{ ok: boolean; running?: boolean; error?: string }> {
  const { url, token } = await getConfig();
  if (!url) return { ok: false, error: 'No server configured.' };
  try {
    const r = await fetch(`${normalize(url)}/api/scout/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token },
      body: JSON.stringify({ mode: 'both' }),
    });
    const j = await r.json();
    if (r.status === 409) return { ok: false, running: true, error: 'A scout run is already in progress.' };
    if (!r.ok || !j.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

/** Read live server-scout status (running flag + last run's counts). */
export async function scoutStatus(): Promise<ScoutStatus | null> {
  const { url, token } = await getConfig();
  if (!url) return null;
  try {
    const r = await fetch(`${normalize(url)}/api/scout/status`, { headers: { 'X-CRM-Token': token } });
    const j = await r.json();
    if (!r.ok || !j.ok) return null;
    const last = j.last || {};
    return {
      running: !!j.running,
      phase: (j.current && j.current.phase) || last.phase,
      added: (last.find && last.find.added) || 0,
      refreshed: (last.validate && last.validate.refreshed) || 0,
      error: last.state === 'error' ? last.error || 'scout error' : undefined,
    };
  } catch {
    return null;
  }
}
