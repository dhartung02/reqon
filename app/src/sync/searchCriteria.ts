import * as SecureStore from 'expo-secure-store';
import { getConfig } from './config';

// Scout search criteria — mirrors the server watchlist's `searchTerms` so the on-device scout and
// the server scout share one definition (server-optional). Stored locally; pulled/pushed against
// the server's /api/settings when a server is configured.
export interface SearchCriteria {
  titles: string[]; // desired seniority / role titles (server scout title filter)
  keywords: string[]; // domain keywords that define a match
  negativeKeywords: string[]; // titles/desc containing any of these are skipped
  minFit: number; // 0–10 — minimum fit score to surface
  salaryFloor: number; // USD/yr — 0 = no floor (best-effort on device; server stores for its scout)
  remoteOnly: boolean;
}

const KEY = 'reqon.searchCriteria';
export const EMPTY_CRITERIA: SearchCriteria = {
  titles: [],
  keywords: [],
  negativeKeywords: [],
  minFit: 6.0,
  salaryFloor: 0,
  remoteOnly: true,
};

const normalize = (u: string) => u.trim().replace(/\/+$/, '');
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : []);

export async function getCriteria(): Promise<SearchCriteria> {
  const v = await SecureStore.getItemAsync(KEY);
  if (!v) return { ...EMPTY_CRITERIA };
  try {
    return { ...EMPTY_CRITERIA, ...(JSON.parse(v) as Partial<SearchCriteria>) };
  } catch {
    return { ...EMPTY_CRITERIA };
  }
}

export async function setCriteria(c: SearchCriteria): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(c));
}

function fromSettings(s: Record<string, unknown>): SearchCriteria {
  return {
    titles: strArr(s.titles),
    keywords: strArr(s.keywords),
    negativeKeywords: strArr(s.negativeKeywords),
    minFit: s.minFit != null && !isNaN(+s.minFit) ? +s.minFit : 6.0,
    salaryFloor: s.salaryFloor != null && !isNaN(+s.salaryFloor) ? +s.salaryFloor : 0,
    remoteOnly: s.remoteOnly !== false,
  };
}

/** Pull search criteria from the server (subset of /api/settings); falls back to local. */
export async function pullCriteria(): Promise<SearchCriteria> {
  const { url, token } = await getConfig();
  if (!url) return getCriteria();
  try {
    const r = await fetch(`${normalize(url)}/api/settings`, { headers: { 'X-CRM-Token': token } });
    const j = await r.json();
    if (r.ok && j.ok) {
      const c = fromSettings(j);
      await setCriteria(c);
      return c;
    }
  } catch {
    /* offline — use local */
  }
  return getCriteria();
}

/** Save local + push the search-criteria subset to the server (if configured). */
export async function pushCriteria(c: SearchCriteria): Promise<{ ok: boolean; error?: string }> {
  await setCriteria(c);
  const { url, token } = await getConfig();
  if (!url) return { ok: true };
  try {
    const r = await fetch(`${normalize(url)}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token },
      body: JSON.stringify({
        titles: c.titles,
        keywords: c.keywords,
        negativeKeywords: c.negativeKeywords,
        minFit: c.minFit,
        salaryFloor: c.salaryFloor,
        remoteOnly: c.remoteOnly,
      }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}
