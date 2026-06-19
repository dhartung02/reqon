import { getConfig } from './config';

// Gmail response-ingest: configured from the app, stored + run on the synced server. The server
// never returns the app password — only whether it's set (passSet) + its last 4 (passLast4).
const normalize = (u: string) => u.trim().replace(/\/+$/, '');

export interface MailConfig {
  configured: boolean;
  user: string;
  passSet: boolean;
  passLast4: string;
  label: string;
  ai: boolean;
  sinceDays: number;
}

async function req(path: string, init?: RequestInit): Promise<any | null> {
  const { url, token } = await getConfig();
  if (!url) return null;
  const r = await fetch(`${normalize(url)}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token, ...(init?.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

/** Read the server's Gmail-ingest config (no password ever returned). null if no server set. */
export async function getMailConfig(): Promise<MailConfig | null> {
  const j = await req('/api/mail/config');
  if (!j) return null;
  return {
    configured: !!j.configured,
    user: j.user || '',
    passSet: !!j.passSet,
    passLast4: j.passLast4 || '',
    label: j.label || 'INBOX',
    ai: !!j.ai,
    sinceDays: typeof j.sinceDays === 'number' ? j.sinceDays : 14,
  };
}

/** Save config to the server's .env. Omit/blank `password` to keep the current one. */
export async function saveMailConfig(patch: {
  user?: string;
  password?: string;
  label?: string;
  ai?: boolean;
  clear?: boolean;
}): Promise<MailConfig | null> {
  const j = await req('/api/mail/config', { method: 'POST', body: JSON.stringify(patch) });
  return j ? getMailConfig() : null;
}

/** Run the ingest on the server. apply=false is a dry-run (writes nothing). Returns the report text. */
export async function runMailIngest(apply: boolean): Promise<{ applied: boolean; report: string }> {
  const j = await req('/api/mail/run', { method: 'POST', body: JSON.stringify({ apply }) });
  return { applied: !!j?.applied, report: (j?.report || '').trim() };
}
