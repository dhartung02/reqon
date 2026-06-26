import { getConfig } from './config';
import { timedFetch } from './http';

// Guided narrative builder (app side) — calls the same server endpoints the web board uses, so the
// AI key stays on the server and suggestions are grounded in the synced profile. Suggest mines the
// résumé for story ideas; polish tightens the user's rough notes (typed or, later, transcribed).
const normalize = (u: string) => u.trim().replace(/\/+$/, '');
const AI_TIMEOUT = 45000; // AI calls are slower than reads

export interface NarrativeSuggestion { title: string; cover: string[]; draft: string }

export async function suggestNarratives(): Promise<{ suggestions?: NarrativeSuggestion[]; error?: string }> {
  const { url, token } = await getConfig();
  if (!url) return { error: 'Connect a sync server in Settings to build narratives.' };
  try {
    const r = await timedFetch(`${normalize(url)}/api/profile/narratives/suggest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token }, body: '{}',
    }, AI_TIMEOUT);
    const j = await r.json();
    if (!r.ok || !j.ok) return { error: j.error || `HTTP ${r.status}` };
    return { suggestions: Array.isArray(j.suggestions) ? j.suggestions : [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'network error' };
  }
}

export async function polishNarrative(title: string, rough: string): Promise<{ title?: string; body?: string; error?: string }> {
  const { url, token } = await getConfig();
  if (!url) return { error: 'Connect a sync server in Settings.' };
  try {
    const r = await timedFetch(`${normalize(url)}/api/profile/narratives/polish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token },
      body: JSON.stringify({ title, rough }),
    }, AI_TIMEOUT);
    const j = await r.json();
    if (!r.ok || !j.ok) return { error: j.error || `HTTP ${r.status}` };
    return { title: j.title, body: j.body };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'network error' };
  }
}
