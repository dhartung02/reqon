import { computeTier, expectedValue, type Tier, type TierThresholds } from '@reqon/core';
import { parseMaxSalary } from './scout/salary';
import { remoteMode } from './scout/scoring';
import type { Palette } from './theme';

export type { Tier };

// The app's view model for a requisition. Scoring/tier come from the shared core; the rest mirrors
// the server's row shape (a subset for M2 — the full schema arrives with the expo-sqlite store in M3).
export type Status =
  | 'Not Applied'
  | 'Applied'
  | 'Recruiter Screen'
  | 'Hiring Manager'
  | 'Panel'
  | 'Offer'
  | 'Rejected'
  | 'Archived';

export type Lane = 'today' | 'open' | 'applied' | 'interviewing' | 'closed' | 'analytics';
export type StatusLane = Exclude<Lane, 'today' | 'analytics'>;

export interface Role {
  id: string;
  role: string;
  company: string;
  status: Status;
  tier: Tier;
  score: number; // expected value (fit×prob/10), from the shared core
  fit: number;
  prob: number;
  salary?: string;
  location?: string;
  link?: string;
  applied?: string; // ISO date
  recruiter?: string;
  next?: string; // next action
  notes?: string;
  age: string; // display-only "2h ago"
  // Hygiene/triage fields — populated from synced server rows (undefined for local-only rows).
  conf?: string; // verified | boardonly | unverified
  reqCheck?: string; // open | closed | lead | unknown | open-applied
  lastcontact?: string; // ISO date
  added?: string; // ISO date the row was added
  // Full tracking parity with the web board (M3). Persisted in the row's `raw` JSON so they sync
  // back to the server verbatim; field names match the server exactly.
  interview?: string; // ISO date of the (next) interview
  followup?: string; // ISO date a follow-up is due
  thankYouSent?: string; // ISO date a thank-you was sent ('' / undefined = not sent)
  cover?: string; // cover-letter version/filename, or 'No'
  resume?: string; // résumé version/filename used
  referral?: string; // referral source
  recruiterEmail?: string;
  sector?: string; // sector enum (CDP / Customer Data, etc.)
  remote?: string; // remote | flex | onsite
  rejectionStage?: string; // stage the rejection happened at
  rejectionReason?: string; // short reason
  rejectionFeedback?: string; // free-text feedback/notes
}

// Sector enum (mirrors the server) + remote modes — used by the Add/Detail pickers.
export const SECTORS = [
  'CDP / Customer Data',
  'Martech / Engagement',
  'Data Infra',
  'Identity / Data',
  'Enterprise SaaS',
  'AI Platform',
] as const;
export const REMOTE_MODES = ['remote', 'flex', 'onsite'] as const;

// Lane → statuses, mirroring the server's TAB_MAP_DEFAULT.
export const LANE_STATUS: Record<StatusLane, Status[]> = {
  open: ['Not Applied'],
  applied: ['Applied'],
  interviewing: ['Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer'],
  closed: ['Rejected', 'Archived'],
};

export const LANES: { key: Lane; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'open', label: 'Open' },
  { key: 'applied', label: 'Applied' },
  { key: 'interviewing', label: 'Interviewing' },
  { key: 'closed', label: 'Closed' },
  { key: 'analytics', label: 'Analytics' },
];

export const laneOf = (s: Status): StatusLane => {
  for (const lane of ['open', 'applied', 'interviewing', 'closed'] as const) {
    if (LANE_STATUS[lane].includes(s)) return lane;
  }
  return 'open';
};

export const rolesInLane = (roles: Role[], lane: StatusLane): Role[] =>
  roles.filter((r) => LANE_STATUS[lane].includes(r.status));

// ---- search + sort ----
export type SortKey = 'ev' | 'company' | 'fit' | 'salary';
export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'ev', label: 'Expected value' },
  { key: 'fit', label: 'Fit' },
  { key: 'salary', label: 'Salary' },
  { key: 'company', label: 'Company' },
];

export const matchesQuery = (r: Role, q: string): boolean => {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    r.role.toLowerCase().includes(s) ||
    r.company.toLowerCase().includes(s) ||
    (r.recruiter || '').toLowerCase().includes(s) ||
    (r.notes || '').toLowerCase().includes(s)
  );
};

// Top-of-band salary for sorting; roles with no parseable pay sort last (descending).
const salaryRank = (r: Role): number => parseMaxSalary(r.salary) ?? -1;

export const sortRoles = (roles: Role[], key: SortKey): Role[] =>
  [...roles].sort((a, b) => {
    switch (key) {
      case 'company':
        return a.company.localeCompare(b.company);
      case 'fit':
        return b.fit - a.fit;
      case 'salary':
        return salaryRank(b) - salaryRank(a);
      default:
        return b.score - a.score;
    }
  });

// ---- filters ----
// Lane lists already split by status and group by tier; these narrow further on the axes that
// matter most for a remote-only, verify-first search. Each is a simple toggle.
export interface RoleFilter {
  noOnsite: boolean; // drop roles whose location is a known on-site (unknown locations are kept)
  verifiedOnly: boolean; // only confirmed-live postings (conf === 'verified')
  hideTierC: boolean; // suppress Tier C noise
}
export const EMPTY_FILTER: RoleFilter = { noOnsite: false, verifiedOnly: false, hideTierC: false };
export const activeFilterCount = (f: RoleFilter): number =>
  Number(f.noOnsite) + Number(f.verifiedOnly) + Number(f.hideTierC);

export const applyFilters = (roles: Role[], f: RoleFilter): Role[] =>
  roles.filter((r) => {
    if (f.hideTierC && r.tier === 'C') return false;
    if (f.verifiedOnly && r.conf !== 'verified') return false;
    if (f.noOnsite && r.location?.trim() && remoteMode(r.location) === 'onsite') return false;
    return true;
  });

/** Status → accent color for pills/dots. Pass the active palette. */
export const statusColor = (s: Status, c: Palette): string => {
  switch (s) {
    case 'Applied':
      return c.emerald;
    case 'Recruiter Screen':
    case 'Hiring Manager':
    case 'Panel':
    case 'Offer':
      return c.active;
    case 'Rejected':
      return c.danger;
    case 'Archived':
      return c.muted;
    default:
      return c.textBase; // Not Applied
  }
};

// Active tier thresholds (the candidate's "Tiers & rules" setting). Undefined → the core defaults.
// Held module-level so the synchronous scoreRole() can honor it without threading config everywhere;
// set once at app boot + whenever the setting is saved, then rows re-derive on the next read.
let activeTier: TierThresholds | undefined;
export function setActiveTier(t?: TierThresholds): void {
  activeTier = t;
}
export function getActiveTier(): TierThresholds | undefined {
  return activeTier;
}

/** Derive tier + score from raw fit/prob via the shared core (single source of truth). */
export function scoreRole<T extends { fit: number; prob: number }>(r: T): T & { tier: Tier; score: number } {
  return { ...r, tier: computeTier(r.fit, r.prob, activeTier), score: expectedValue({ fit: r.fit, prob: r.prob }) };
}
