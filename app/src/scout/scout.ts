import { sameReq } from '@reqon/core';
import { GREENHOUSE_BOARDS } from './boards';
import { isPmRole, remoteMode, usEligible, scoreFit, scoreProb } from './scoring';

// On-device scout: poll Greenhouse boards, filter to senior PM + domain + remote, score via the
// shared logic, dedupe against existing roles (sameReq), and add the new ones. No native deps —
// just fetch + the pure scoring port — so it's the same pipeline the Python scout runs, on device.
export interface ScoutResult {
  scanned: number;
  matched: number;
  added: number;
  boards: number;
  errors: number;
}

export interface ScoutCandidate {
  company: string;
  role: string;
  fit: number;
  prob: number;
  location?: string;
  link?: string;
}

interface ExistingRef {
  company?: string;
  role?: string;
  link?: string;
  url?: string;
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');

export async function runScout(opts: {
  existing: ExistingRef[];
  onAdd: (c: ScoutCandidate) => Promise<void>;
  minFit?: number;
  remoteOnly?: boolean;
}): Promise<ScoutResult> {
  const minFit = opts.minFit ?? 6.0;
  const remoteOnly = opts.remoteOnly ?? true;
  const res: ScoutResult = { scanned: 0, matched: 0, added: 0, boards: 0, errors: 0 };
  const seen = new Set<string>(); // within-run dedupe

  for (const b of GREENHOUSE_BOARDS) {
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true`);
      if (!r.ok) {
        res.errors++;
        continue;
      }
      const j = (await r.json()) as { jobs?: { title?: string; location?: { name?: string }; absolute_url?: string; content?: string }[] };
      res.boards++;
      for (const job of j.jobs ?? []) {
        res.scanned++;
        const title = String(job.title ?? '');
        const location = job.location?.name;
        const link = job.absolute_url;
        const desc = stripHtml(String(job.content ?? ''));
        if (!isPmRole(title)) continue;
        const rmode = remoteMode(location);
        if (remoteOnly && rmode === 'onsite') continue;
        if (!usEligible(location)) continue;
        res.matched++;
        const fit = scoreFit(title, desc);
        if (fit < minFit) continue;
        const prob = scoreProb(fit, title, rmode, !!b.heritage);
        const cand = { company: b.name, role: title, link };
        if (opts.existing.some((e) => sameReq(e as never, cand as never))) continue;
        const key = `${b.name}|${title}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        await opts.onAdd({ company: b.name, role: title, fit, prob, location, link });
        res.added++;
      }
    } catch {
      res.errors++;
    }
  }
  return res;
}
