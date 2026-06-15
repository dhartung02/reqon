// Faithful TS port of agent/scout.py's deterministic scoring. Canonical spec: agent/scoring-criteria.md.
// Keep in lockstep with scout.py — same keyword lists, same fit/prob math.

export const PRIORITY_KW = [
  'customer data platform', 'cdp', 'data platform', 'data product',
  'data pipeline', 'pipelines', 'etl', 'ingest', 'snowflake', 'data lake',
  'ai platform', 'agentic', 'llm', 'mcp', 'generative ai', 'genai',
  'machine learning platform', 'ml platform', 'identity resolution',
  'identity and access', 'identity & access', 'iam', 'sso', 'scim',
  'martech', 'marketing cloud', 'audience', 'segmentation',
  'api platform', 'integration platform', 'developer platform',
  'experimentation platform',
];
export const SECONDARY_KW = [
  'usage billing', 'usage-based', 'monetization', 'monetisation', 'pricing',
  'consumption', 'finops', 'cost optimization', 'billing', 'product catalog',
  'catalog', 'commerce', 'e-commerce', 'ecommerce',
];
export const GENERIC_KW = ['platform', 'infrastructure', 'enterprise', 'data', 'integration', 'api'];
export const PM_PHRASES = ['product manager', 'product management', 'head of product', 'product lead'];
export const EXCLUDE_TITLE = [
  'marketing', 'engineer', 'designer', 'data scientist', 'program manager',
  'solutions', 'sales', 'recruit', 'support', 'success', 'analyst',
  'scientist', 'researcher', 'counsel', 'accountant', 'evangelist',
];

export type RemoteMode = 'remote' | 'flex' | 'onsite';

const round1 = (n: number) => Math.round(n * 10) / 10;
const countKw = (text: string, kws: string[]) => kws.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);

const norm = (s: string) => s.toLowerCase().trim();

// `extraTitles` = the candidate's target titles from Search criteria. They widen acceptance: a
// posting also counts as a PM role if its title contains one of those phrases (e.g. a user adds
// "Head of Platform"). EXCLUDE_TITLE still wins as a safety net. Default [] = unchanged behavior.
export function isPmRole(title: string, extraTitles: string[] = []): boolean {
  const t = title.toLowerCase();
  if (EXCLUDE_TITLE.some((x) => t.includes(x))) return false;
  if (PM_PHRASES.some((p) => t.includes(p))) return true;
  return extraTitles.map(norm).filter(Boolean).some((p) => t.includes(p));
}

export function remoteMode(location?: string): RemoteMode {
  const l = (location ?? '').toLowerCase();
  if (l.includes('hybrid') || l.includes('flex')) return 'flex';
  if (l.includes('remote')) return 'remote';
  return 'onsite';
}

export function usEligible(location?: string): boolean {
  const l = (location ?? '').toLowerCase();
  if (!l) return true;
  if (l.includes('remote') && (l.includes('us') || l.includes('united states') || l.includes('u.s') || l.includes('americas') || l.includes('north america'))) {
    return true;
  }
  const foreign = ['united kingdom', 'canada', 'india', 'germany', 'ireland', 'australia', 'singapore', 'spain', 'france', 'brazil', 'netherlands', 'poland', 'japan', 'mexico', 'colombia', 'philippines', 'argentina', 'emea', 'apac'];
  if (l.includes('remote') && foreign.some((f) => l.includes(f)) && !l.includes('united states')) return false;
  return true;
}

// `extraKeywords` = the candidate's keywords from Search criteria. They count as PRIORITY signals
// (additive — merged with the built-ins, deduped), so tuning keywords actually changes what scores
// high. Default [] = the canonical scout.py behavior, so the locked fixtures are unaffected.
export function scoreFit(title: string, desc: string, extraKeywords: string[] = []): number {
  const tt = title.toLowerCase();
  const dd = desc.toLowerCase();
  const priority = extraKeywords.length
    ? Array.from(new Set([...PRIORITY_KW, ...extraKeywords.map(norm).filter(Boolean)]))
    : PRIORITY_KW;
  const priT = countKw(tt, priority);
  const priD = countKw(dd, priority);
  const secT = countKw(tt, SECONDARY_KW);
  const secD = countKw(dd, SECONDARY_KW);
  const genT = countKw(tt, GENERIC_KW);
  let fit: number;
  if (priT >= 1) fit = 8.5 + Math.min(0.5, 0.1 * (priT - 1));
  else if (secT >= 1) fit = 7.0;
  else if (priD >= 2) fit = 7.5;
  else if (priD === 1) fit = 6.8;
  else if (genT >= 1 || secD >= 1) fit = 6.0;
  else fit = 5.0;
  return round1(Math.min(fit, 9.0));
}

export function bandAdj(title: string): number {
  const t = title.toLowerCase();
  if (['vp ', 'vice president', 'head of'].some((b) => t.includes(b))) return -1.5;
  if (['principal', 'director', 'group product', 'senior director', 'sr director'].some((b) => t.includes(b))) return 0.5;
  if (['staff', 'lead product'].some((b) => t.includes(b))) return 0.0;
  if (t.includes('senior') || t.includes('sr.') || t.includes('sr ')) return 0.0;
  if (t.includes('manager')) return -0.5;
  return 0.0;
}

export function scoreProb(fit: number, title: string, rmode: RemoteMode, heritage: boolean): number {
  let p = fit - 1.0 + bandAdj(title) + { remote: 0.5, flex: 0.0, onsite: -2.0 }[rmode];
  if (heritage) p += 1.0;
  return round1(Math.max(1.0, Math.min(9.0, p)));
}
