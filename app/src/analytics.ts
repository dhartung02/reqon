import { rolesInLane, type Role, type Status, type Tier } from './model';

// Pure pipeline analytics, derived from the same roles the lists use. Status-only data (no per-stage
// history), so the funnel is a CURRENT-stage snapshot, not a cumulative cohort funnel — labelled as
// such in the UI. Conversion rates are over "ever applied" (applied + interviewing + closed).

export const FUNNEL_STAGES: Status[] = ['Applied', 'Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer'];

export interface PipelineMetrics {
  total: number;
  open: number;
  applied: number;
  interviewing: number; // any interview substage incl. Offer (LANE_STATUS.interviewing)
  offers: number;
  rejected: number;
  everApplied: number; // applied + interviewing + closed
  advanced: number; // reached any interview substage (== interviewing lane count)
  respRate: number; // advanced / everApplied, %
  interviewToOffer: number; // offers / advanced, %
  offerRate: number; // offers / everApplied, %
  tiers: Record<Tier, number>;
  funnel: { status: Status; count: number }[]; // current count per stage
}

const pct = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 100) : 0);

export function pipelineMetrics(roles: Role[]): PipelineMetrics {
  const open = rolesInLane(roles, 'open').length;
  const applied = rolesInLane(roles, 'applied').length;
  const interviewing = rolesInLane(roles, 'interviewing').length;
  const closed = rolesInLane(roles, 'closed').length;
  const byStatus = (s: Status) => roles.filter((r) => r.status === s).length;

  const offers = byStatus('Offer');
  const rejected = byStatus('Rejected');
  const advanced = interviewing; // interviewing lane = Recruiter Screen + Hiring Manager + Panel + Offer
  const everApplied = applied + interviewing + closed;

  return {
    total: roles.length,
    open,
    applied,
    interviewing,
    offers,
    rejected,
    everApplied,
    advanced,
    respRate: pct(advanced, everApplied),
    interviewToOffer: pct(offers, advanced),
    offerRate: pct(offers, everApplied),
    tiers: {
      A: roles.filter((r) => r.tier === 'A').length,
      B: roles.filter((r) => r.tier === 'B').length,
      C: roles.filter((r) => r.tier === 'C').length,
    },
    funnel: FUNNEL_STAGES.map((status) => ({ status, count: byStatus(status) })),
  };
}
