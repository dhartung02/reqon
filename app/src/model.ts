import { computeTier, expectedValue, type Tier } from '@reqon/core';
import { colors } from './theme';

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
}

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
export type SortKey = 'ev' | 'company' | 'fit';
export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'ev', label: 'Expected value' },
  { key: 'fit', label: 'Fit' },
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

export const sortRoles = (roles: Role[], key: SortKey): Role[] =>
  [...roles].sort((a, b) =>
    key === 'company' ? a.company.localeCompare(b.company) : key === 'fit' ? b.fit - a.fit : b.score - a.score,
  );

/** Status → accent color for pills/dots. */
export const statusColor = (s: Status): string => {
  switch (s) {
    case 'Applied':
      return colors.emerald;
    case 'Recruiter Screen':
    case 'Hiring Manager':
    case 'Panel':
    case 'Offer':
      return colors.active;
    case 'Rejected':
      return colors.danger;
    case 'Archived':
      return colors.muted;
    default:
      return colors.textBase; // Not Applied
  }
};

/** Derive tier + score from raw fit/prob via the shared core (single source of truth). */
export function scoreRole<T extends { fit: number; prob: number }>(r: T): T & { tier: Tier; score: number } {
  return { ...r, tier: computeTier(r.fit, r.prob), score: expectedValue({ fit: r.fit, prob: r.prob }) };
}
