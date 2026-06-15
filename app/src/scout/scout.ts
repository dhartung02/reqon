import { sameReq, computeTier, type Tier } from '@reqon/core';
import { BOARDS, type Board } from './boards';
import { getActiveTier } from '../model';
import { isPmRole, remoteMode, usEligible, scoreFit, scoreProb } from './scoring';
import { belowSalaryFloor } from './salary';

const TIER_RANK: Record<Tier, number> = { A: 3, B: 2, C: 1 };

// On-device scout: poll Greenhouse / Ashby / Lever boards, filter to senior PM + domain + remote,
// score via the shared logic, dedupe against existing roles (sameReq), and add the new ones. Pure
// fetch + the pure scoring port — the same pipeline the Python scout runs, on device.
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

interface NormJob {
  title: string;
  location?: string;
  url?: string;
  desc: string;
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
const addRemote = (loc: string, remote: boolean) =>
  !remote ? loc : /remote/i.test(loc) ? loc : loc ? `${loc} (Remote)` : 'Remote';

// Per-ATS fetch + normalize to {title, location, url, desc}. Faithful to agent/sources/*.py.
async function fetchBoard(b: Board): Promise<NormJob[]> {
  if (b.ats === 'ashby') {
    const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${b.slug}?includeCompensation=true`);
    if (!r.ok) throw new Error(`ashby ${r.status}`);
    const j = (await r.json()) as { jobs?: Record<string, unknown>[] };
    return (j.jobs ?? [])
      .filter((x) => x.isListed !== false)
      .map((x) => {
        // Ashby may expose a structured pay range — fold its summary into desc so the salary
        // floor can see it (Greenhouse/Lever rarely provide one).
        const comp = (x.compensation as { compensationTierSummary?: string }) || {};
        const compStr = comp.compensationTierSummary ? ` ${comp.compensationTierSummary}` : '';
        return {
          title: String(x.title ?? ''),
          location: addRemote(String(x.location ?? x.locationName ?? ''), !!x.isRemote),
          url: String(x.jobUrl ?? x.applyUrl ?? ''),
          desc: stripHtml(String(x.descriptionHtml ?? x.descriptionPlain ?? '')) + compStr,
        };
      });
  }
  if (b.ats === 'lever') {
    const r = await fetch(`https://api.lever.co/v0/postings/${b.slug}?mode=json`);
    if (!r.ok) throw new Error(`lever ${r.status}`);
    const j = (await r.json()) as Record<string, unknown>[];
    return (Array.isArray(j) ? j : []).map((x) => ({
      title: String(x.text ?? ''),
      location: String((x.categories as { location?: string })?.location ?? ''),
      url: String(x.hostedUrl ?? x.applyUrl ?? ''),
      desc: stripHtml(String(x.descriptionPlain ?? x.description ?? '')),
    }));
  }
  // greenhouse
  const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true`);
  if (!r.ok) throw new Error(`greenhouse ${r.status}`);
  const j = (await r.json()) as { jobs?: { title?: string; location?: { name?: string }; absolute_url?: string; content?: string }[] };
  return (j.jobs ?? []).map((x) => ({
    title: String(x.title ?? ''),
    location: x.location?.name,
    url: x.absolute_url,
    desc: stripHtml(String(x.content ?? '')),
  }));
}

export async function runScout(opts: {
  existing: ExistingRef[];
  onAdd: (c: ScoutCandidate) => Promise<void>;
  minFit?: number;
  remoteOnly?: boolean;
  salaryFloor?: number;
  negativeKeywords?: string[];
  minTier?: Tier;
}): Promise<ScoutResult> {
  const minFit = opts.minFit ?? 6.0;
  const remoteOnly = opts.remoteOnly ?? true;
  const salaryFloor = opts.salaryFloor ?? 0;
  const minTierRank = opts.minTier ? TIER_RANK[opts.minTier] : 0;
  const negatives = (opts.negativeKeywords ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean);
  const res: ScoutResult = { scanned: 0, matched: 0, added: 0, boards: 0, errors: 0 };
  const seen = new Set<string>();

  for (const b of BOARDS) {
    let jobs: NormJob[];
    try {
      jobs = await fetchBoard(b);
      res.boards++;
    } catch {
      res.errors++;
      continue;
    }
    for (const job of jobs) {
      res.scanned++;
      const { title, location, url, desc } = job;
      if (!isPmRole(title)) continue;
      if (negatives.length) {
        const hay = `${title} ${desc}`.toLowerCase();
        if (negatives.some((n) => hay.includes(n))) continue;
      }
      const rmode = remoteMode(location);
      if (remoteOnly && rmode === 'onsite') continue;
      if (!usEligible(location)) continue;
      if (belowSalaryFloor(desc, salaryFloor)) continue;
      res.matched++;
      const fit = scoreFit(title, desc);
      if (fit < minFit) continue;
      const prob = scoreProb(fit, title, rmode, !!b.heritage);
      if (minTierRank > 0 && TIER_RANK[computeTier(fit, prob, getActiveTier())] < minTierRank) continue;
      const cand = { company: b.name, role: title, link: url };
      if (opts.existing.some((e) => sameReq(e as never, cand as never))) continue;
      const key = `${b.name}|${title}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      await opts.onAdd({ company: b.name, role: title, fit, prob, location, link: url });
      res.added++;
    }
  }
  return res;
}
