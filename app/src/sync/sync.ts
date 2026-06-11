import { getConfig } from './config';
import { replaceAllFromServer } from '../db/store';

const normalize = (url: string) => url.trim().replace(/\/+$/, '');

export interface ConnResult {
  ok: boolean;
  count?: number;
  error?: string;
}

/** GET /api/health with the token — used by the Settings "Test connection" button. */
export async function testConnection(url: string, token: string): Promise<ConnResult> {
  try {
    const res = await fetch(`${normalize(url)}/api/health`, { headers: { 'X-CRM-Token': token } });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const j = await res.json();
    return { ok: !!j.ok, count: j.count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

/**
 * Stage-1 sync: a full PULL. POST /api/sync with no rows → the server returns its full set
 * (WP-0 "full pull"); we replace the local store with it (full fidelity). Push (local → server)
 * lands in Stage 2; for now the server is treated as the source of truth.
 */
export async function pullAll(): Promise<{ applied: number }> {
  const { url, token } = await getConfig();
  if (!url) throw new Error('No server configured');
  const res = await fetch(`${normalize(url)}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token },
    body: JSON.stringify({ rows: [] }),
  });
  if (!res.ok) throw new Error(`Sync failed: HTTP ${res.status}`);
  const j = await res.json();
  const rows = Array.isArray(j.rows) ? j.rows : [];
  const applied = await replaceAllFromServer(rows);
  return { applied };
}
