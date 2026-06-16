import { getConfig } from './config';

// CV generation lives on the server (it holds the full profile + narratives, the OpenAI key for the
// AI summary, and the .docx renderer). The app triggers a build and links out to download the file.
const normalize = (u: string) => u.trim().replace(/\/+$/, '');

export interface CvResult {
  ok: boolean;
  markdown?: string;
  source?: 'ai' | 'template';
  name?: string;
  error?: string;
}

/** Build (or rebuild) the CV content on the server; returns a Markdown preview + which path produced it. */
export async function buildCv(): Promise<CvResult> {
  const { url, token } = await getConfig();
  if (!url) return { ok: false, error: 'Connect a sync server in Settings — CV generation runs on the server.' };
  try {
    const r = await fetch(`${normalize(url)}/api/cv`, { method: 'POST', headers: { 'X-CRM-Token': token } });
    const j = await r.json();
    if (!r.ok || !j.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true, markdown: j.markdown, source: j.source, name: j.name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

/** URL to download the last-built CV as a .docx (open in a browser). */
export async function cvDocxUrl(): Promise<string | null> {
  const { url } = await getConfig();
  return url ? `${normalize(url)}/api/cv.docx` : null;
}
