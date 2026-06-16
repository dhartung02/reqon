import { getConfig } from './config';

// CV generation lives on the server (it holds the full profile + narratives, the OpenAI key for the
// AI summary, and the .docx renderer). The app triggers a build and links out to download the file.
const normalize = (u: string) => u.trim().replace(/\/+$/, '');

export interface CvTailor {
  role?: string;
  company?: string;
  jd?: string;
}
export interface CvResult {
  ok: boolean;
  markdown?: string;
  source?: 'ai' | 'template';
  name?: string;
  tailoredFor?: string | null;
  error?: string;
}

/** Build (or rebuild) the CV content on the server; pass `tailor` to bias the summary to a role. */
export async function buildCv(tailor?: CvTailor): Promise<CvResult> {
  const { url, token } = await getConfig();
  if (!url) return { ok: false, error: 'Connect a sync server in Settings — CV generation runs on the server.' };
  const hasTailor = tailor && (tailor.role || tailor.company || tailor.jd);
  try {
    const r = await fetch(`${normalize(url)}/api/cv`, {
      method: 'POST',
      headers: { 'X-CRM-Token': token, ...(hasTailor ? { 'Content-Type': 'application/json' } : {}) },
      body: hasTailor ? JSON.stringify({ tailor }) : undefined,
    });
    const j = await r.json();
    if (!r.ok || !j.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true, markdown: j.markdown, source: j.source, name: j.name, tailoredFor: j.tailoredFor };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

/** URL to download the last-built CV as a .docx (open in a browser). */
export async function cvDocxUrl(): Promise<string | null> {
  const { url } = await getConfig();
  return url ? `${normalize(url)}/api/cv.docx` : null;
}

/** URL to the print-styled HTML CV — open in a browser and "Save as PDF". */
export async function cvHtmlUrl(): Promise<string | null> {
  const { url } = await getConfig();
  return url ? `${normalize(url)}/api/cv.html` : null;
}
