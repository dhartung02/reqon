import { getConfig } from './config';

// In-app notification feed (P1.8) — mirrors the web bell. Reads the server's /api/notifications
// (the same feed the digest/scout/mail engine writes) and marks items read. Native push stays
// EAS-build dependent; this feed works in Expo Go today.
const normalize = (u: string) => u.trim().replace(/\/+$/, '');

export interface Notification {
  id: string;
  title?: string;
  body?: string;
  read?: boolean;
  ts?: string;
  kind?: string;
}

export async function fetchNotifications(): Promise<{ items: Notification[]; unread: number; error?: string }> {
  const { url, token } = await getConfig();
  if (!url) return { items: [], unread: 0, error: 'No sync server configured.' };
  try {
    const r = await fetch(`${normalize(url)}/api/notifications`, { headers: { 'X-CRM-Token': token } });
    const j = await r.json();
    if (!r.ok || !j.ok) return { items: [], unread: 0, error: j.error || `HTTP ${r.status}` };
    return { items: Array.isArray(j.items) ? j.items : [], unread: j.unread ?? 0 };
  } catch (e) {
    return { items: [], unread: 0, error: e instanceof Error ? e.message : 'network error' };
  }
}

/** Mark items read (all if `ids` omitted). Returns the new unread count. */
export async function markNotificationsRead(ids?: string[]): Promise<{ unread: number; error?: string }> {
  const { url, token } = await getConfig();
  if (!url) return { unread: 0, error: 'No sync server configured.' };
  try {
    const r = await fetch(`${normalize(url)}/api/notifications/read`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token },
      body: JSON.stringify(ids ? { ids } : {}),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) return { unread: 0, error: j.error || `HTTP ${r.status}` };
    return { unread: j.unread ?? 0 };
  } catch (e) {
    return { unread: 0, error: e instanceof Error ? e.message : 'network error' };
  }
}
