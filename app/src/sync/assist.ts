import { getConfig } from './config';

// AI draft assistant — calls the server's /api/assist (the server holds the OpenAI key + the
// candidate's narrative library, so drafts stay grounded and no key lives on the device).
const normalize = (u: string) => u.trim().replace(/\/+$/, '');

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
