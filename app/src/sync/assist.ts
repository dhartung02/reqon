import { getConfig } from './config';

// AI draft assistant — calls the server's /api/assist (the server holds the OpenAI key + the
// candidate's narrative library, so drafts stay grounded and no key lives on the device).
const normalize = (u: string) => u.trim().replace(/\/+$/, '');

/** company|role key — identical to the server's reqKey. */
export const reqKey = (company?: string, role?: string) =>
  `${String(company || '')}|${String(role || '')}`.toLowerCase().trim();

// Interview-guide viewing (P1.4): fetch the stored guide markdown (authed JSON, not the styled HTML
// page — a WebView can't set the token), or report that none exists yet so the UI can offer Generate.
export async function fetchGuide(key: string): Promise<{ exists?: boolean; markdown?: string; guideAt?: string | null; error?: string }> {
  const { url, token } = await getConfig();
  if (!url) return { error: 'Connect a sync server in Settings to view guides.' };
  try {
    const r = await fetch(`${normalize(url)}/api/reqs/${encodeURIComponent(key)}/guide.json`, { headers: { 'X-CRM-Token': token } });
    const j = await r.json();
    if (!r.ok || !j.ok) return { error: j.error || `HTTP ${r.status}` };
    return { exists: !!j.exists, markdown: j.markdown, guideAt: j.guideAt };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'network error' };
  }
}

/** (Re)generate the interview guide on the server (AI; grounded). Returns ok or an error. */
export async function generateGuide(key: string): Promise<{ ok?: boolean; error?: string }> {
  const { url, token } = await getConfig();
  if (!url) return { error: 'Connect a sync server in Settings.' };
  try {
    const r = await fetch(`${normalize(url)}/api/reqs/${encodeURIComponent(key)}/guide`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token },
    });
    const j = await r.json();
    if (!r.ok || !j.ok) return { error: j.error || `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'network error' };
  }
}

export async function requestDraft(opts: {
  company?: string;
  role?: string;
  kind: 'cover' | 'screening' | 'answer';
  question?: string;
  keywords?: string;
}): Promise<{ draft?: string; error?: string }> {
  const { url, token } = await getConfig();
  if (!url) return { error: 'Connect a sync server in Settings to use AI drafts.' };
  try {
    const r = await fetch(`${normalize(url)}/api/assist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token },
      body: JSON.stringify({
        company: opts.company,
        role: opts.role,
        kind: opts.kind,
        question: opts.question,
        keywords: opts.keywords,
      }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) return { error: j.error || `HTTP ${r.status}` };
    return { draft: j.draft };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'network error' };
  }
}
