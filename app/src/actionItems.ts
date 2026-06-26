import type { Role } from './model';
import { needsVerify, followUpDue, isApplyNext, daysSince } from './today';

// Unified action items for the app's Today screen (ROADMAP-V3 · P2.3) — the mobile twin of the web
// command center (P2.1/P2.2). Pure + deterministic, derived from the locally-synced rows so it works
// offline. Mirrors the server's action vocabulary; each item carries a reason, severity, priority,
// and the role it points at (tap → role detail). Sections group items the way the web does.

export type AppActionType =
  | 'review_offer'
  | 'review_interview'
  | 'follow_up_due'
  | 'apply_next'
  | 'verify_role'
  | 'needs_scoring'
  | 'duplicate_review';

export type Severity = 'high' | 'medium' | 'low';

export interface AppAction {
  id: string;
  type: AppActionType;
  roleId: string;
  company: string;
  role: string;
  severity: Severity;
  priority: number;
  reason: string;
}

const INTERVIEW = ['Recruiter Screen', 'Hiring Manager', 'Panel'];
const norm = (s?: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const scored = (r: Role) => !!(r.fit || r.prob);

/** Prioritized, deterministic action list for the given roles (newest-/highest-priority-first). */
export function computeActions(roles: Role[]): AppAction[] {
  const items: AppAction[] = [];
  const push = (a: AppAction) => items.push(a);

  // duplicate detection: rows sharing company+normalized-role with another open row
  const keyCount = new Map<string, number>();
  for (const r of roles) {
    if (r.status === 'Rejected' || r.status === 'Archived') continue;
    const k = norm(r.company) + '||' + norm(r.role);
    keyCount.set(k, (keyCount.get(k) || 0) + 1);
  }
  const dupSeen = new Set<string>();

  for (const r of roles) {
    const base = { roleId: r.id, company: r.company || '', role: r.role || '' };
    if (r.status === 'Offer') {
      push({ id: 'offer-' + r.id, type: 'review_offer', severity: 'high', priority: 98, reason: 'Offer stage — review and respond.', ...base });
    } else if (INTERVIEW.includes(r.status)) {
      push({ id: 'interview-' + r.id, type: 'review_interview', severity: 'high', priority: 88, reason: r.status + ' — prep and track next steps.', ...base });
    }
    if (followUpDue(r)) {
      const n = daysSince(r.lastcontact || r.applied);
      push({ id: 'followup-' + r.id, type: 'follow_up_due', severity: n != null && n > 10 ? 'high' : 'medium', priority: 80 + Math.min(15, n ?? 0), reason: 'Follow-up due — quiet for ' + (n ?? '?') + ' day' + (n === 1 ? '' : 's') + '.', ...base });
    }
    if (isApplyNext(r)) {
      const ev = +r.score || 0;
      push({ id: 'apply-' + r.id, type: 'apply_next', severity: ev >= 7 ? 'high' : 'medium', priority: 60 + Math.round(ev), reason: 'Tier ' + r.tier + ' · EV ' + ev + ' — apply next.', ...base });
    }
    if (r.status === 'Not Applied' && !scored(r)) {
      push({ id: 'score-' + r.id, type: 'needs_scoring', severity: 'low', priority: 45, reason: 'Unscored lead — score fit/prob to rank it.', ...base });
    }
    if (needsVerify(r)) {
      push({ id: 'verify-' + r.id, type: 'verify_role', severity: 'low', priority: 42, reason: 'Unverified posting — confirm it is live before applying.', ...base });
    }
    if (r.status !== 'Rejected' && r.status !== 'Archived') {
      const k = norm(r.company) + '||' + norm(r.role);
      if ((keyCount.get(k) || 0) > 1 && !dupSeen.has(k)) {
        dupSeen.add(k);
        push({ id: 'dup-' + k, type: 'duplicate_review', severity: 'low', priority: 34, reason: (keyCount.get(k) || 0) + ' rows look like the same posting — merge or delete extras.', ...base });
      }
    }
  }
  items.sort((a, b) => b.priority - a.priority || a.type.localeCompare(b.type));
  return items;
}

export interface ActionSection {
  title: string;
  types: AppActionType[];
}
// Section grouping, in priority order — mirrors the web command center.
export const ACTION_SECTIONS: ActionSection[] = [
  { title: 'Needs review', types: ['review_offer', 'review_interview'] },
  { title: 'Follow-ups due', types: ['follow_up_due'] },
  { title: 'Apply next', types: ['apply_next'] },
  { title: 'Lead inbox', types: ['needs_scoring', 'verify_role'] },
  { title: 'Duplicates', types: ['duplicate_review'] },
];

/** Group a computed action list into the display sections (empty sections dropped). */
export function groupActions(actions: AppAction[]): { title: string; items: AppAction[] }[] {
  return ACTION_SECTIONS.map((s) => ({
    title: s.title,
    items: actions.filter((a) => s.types.includes(a.type)),
  })).filter((s) => s.items.length > 0);
}
