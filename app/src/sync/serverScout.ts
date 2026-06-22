import { getConfig } from './config';
import { getMeta, setMeta } from '../db/store';

// Trigger and poll the SERVER-side scout (the fuller multi-source search + enrichment that runs on
// the Mac), as opposed to the on-device scout. The server runs it async; we poll status to done.
const normalize = (u: string) => u.trim().replace(/\/+$/, '');

// Run modes mirror the web board's "Run Scout" menu (server /api/scout/run accepts these).
export type ScoutRunMode = 'find' | 'validate' | 'both';
export const SCOUT_RUN_MODES: { mode: ScoutRunMode; label: string }[] = [
  { mode: 'find', label: 'Find new matches' },
  { mode: 'validate', label: 'Validate + refresh existing' },
  { mode: 'both', label: 'Run all (validate, then find)' },
];

// Offline queue: the phone can't run the browser-driven scout itself, so when the server is
// unreachable we persist the requested mode and fire it on the next successful sync.
const QUEUE_KEY = 'pendingScout';
export async function queueServerScout(mode: ScoutRunMode): Promise<void> {
  await setMeta(QUEUE_KEY, mode);
}
export async function getQueuedScout(): Promise<ScoutRunMode | null> {
  const v = await getMeta(QUEUE_KEY);
  return v === 'find' || v === 'validate' || v === 'both' ? v : null;
}
export async function clearQueuedScout(): Promise<void> {
  await setMeta(QUEUE_KEY, '');
}

export interface ScoutStatus {
  running: boolean;
  phase?: string;
  added?: number;
  refreshed?: number;
  error?: string;
}

/**
 * Kick off a server scout run with the chosen mode. Returns immediately; poll with scoutStatus.
 * `offline: true` distinguishes an unreachable server (queue + retry on next sync) from a real
 * server-side error (surface it).
 */
export async function runServerScout(
  mode: ScoutRunMode = 'both',
): Promise<{ ok: boolean; running?: boolean; offline?: boolean; error?: string }> {
  const { url, token } = await getConfig();
  if (!url) return { ok: false, error: 'No server configured.' };
  try {
    const r = await fetch(`${normalize(url)}/api/scout/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token },
      body: JSON.stringify({ mode }),
    });
    const j = await r.json();
    if (r.status === 409) return { ok: false, running: true, error: 'A scout run is already in progress.' };
    if (!r.ok || !j.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, offline: true, error: e instanceof Error ? e.message : 'network error' };
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
