import type { Role, Lane } from './model';

// Today command-center lanes — faithful port of public/index.html's daily-loop logic.
// "Today" count = action items needing attention = needsVerify + followUpDue + closedReq.

const FOLLOWUP_STATUSES = ['Applied', 'Recruiter Screen', 'Hiring Manager', 'Panel'];
const DEFAULT_FOLLOWUP_DAYS = 7;
// Tunable via the "Tiers & rules" setting (synced from the server hygiene config). Module-level so
// the pure lane predicates honor it without a config arg; defaults to 7 (and tests rely on that).
let followupDays = DEFAULT_FOLLOWUP_DAYS;
export function setFollowupDays(n?: number): void {
  followupDays = n != null && !isNaN(n) && n >= 0 ? Math.round(n) : DEFAULT_FOLLOWUP_DAYS;
}
const INTERVIEW_STATUSES = ['Recruiter Screen', 'Hiring Manager', 'Panel'];
const NEW_SINCE_DAYS = 3;

/** Local date-only delta in days (YYYY-MM-DD parsed as local midnight); null if unparseable. */
export function daysSince(d?: string): number | null {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  let then: Date;
  if (m) then = new Date(+m[1], +m[2] - 1, +m[3]);
  else {
    const t = Date.parse(d);
    if (isNaN(t)) return null;
    then = new Date(t);
  }
  then.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - then.getTime()) / 864e5));
}

export const needsVerify = (x: Role) =>
  x.status === 'Not Applied' && (x.conf === 'unverified' || x.reqCheck === 'lead');
export const followUpDue = (x: Role) => {
  if (!FOLLOWUP_STATUSES.includes(x.status)) return false;
  const n = daysSince(x.lastcontact || x.applied);
  return n != null && n >= followupDays;
};
export const closedReq = (x: Role) => (x.reqCheck || '') === 'closed';
export const isApplyNext = (x: Role) =>
  (x.tier === 'A' || x.tier === 'B') &&
  x.conf === 'verified' &&
  !['closed', 'lead', 'unknown'].includes(x.reqCheck || '') &&
  x.status === 'Not Applied';
export const tierANotApplied = (x: Role) => x.tier === 'A' && x.status === 'Not Applied';
export const newSince = (x: Role) =>
  x.status === 'Not Applied' && (daysSince(x.added) ?? 999) <= NEW_SINCE_DAYS;
export const inInterview = (x: Role) => INTERVIEW_STATUSES.includes(x.status);

export type Tone = 'accent' | 'warning' | 'muted' | 'active' | 'danger';

export interface TodayLane {
  key: string;
  count: number;
  title: string;
  desc: string;
  tone: Tone;
  jump?: Lane; // tab to open when tapped
}

/** Action items needing attention — matches the web's Today tab count. */
export const todayActionCount = (roles: Role[]) =>
  roles.filter(needsVerify).length + roles.filter(followUpDue).length + roles.filter(closedReq).length;

/** The daily-loop action cards (counts), in the web's order. */
export function todayLanes(roles: Role[]): TodayLane[] {
  const n = (p: (x: Role) => boolean) => roles.filter(p).length;
  return [
    { key: 'new', count: n(newSince), title: 'New since last run', desc: 'Added recently, not yet applied', tone: 'accent', jump: 'open' },
    { key: 'verify', count: n(needsVerify), title: 'Needs verification', desc: 'Unverified links — confirm the live posting first', tone: 'warning', jump: 'open' },
    { key: 'applynext', count: n(isApplyNext), title: 'Apply next', desc: 'Tier A/B · verified · still open · not applied', tone: 'accent', jump: 'open' },
    { key: 'tierA', count: n(tierANotApplied), title: 'Tier A · not applied', desc: "Top-tier roles you haven't applied to yet", tone: 'accent', jump: 'open' },
    { key: 'followup', count: n(followUpDue), title: 'Follow-up due', desc: 'Active applications gone quiet past your threshold', tone: 'danger', jump: 'applied' },
    { key: 'closed', count: n(closedReq), title: 'Recently closed', desc: 'Postings detected closed — review and archive', tone: 'muted', jump: 'closed' },
    { key: 'interviews', count: n(inInterview), title: 'In interviews', desc: 'Active interview-stage conversations', tone: 'active', jump: 'interviewing' },
  ];
}
