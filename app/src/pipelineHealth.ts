import type { Role } from './model';
import { followUpDue, daysSince } from './today';

// Pipeline health for the app analytics screen (ROADMAP-V3 · P1.6 / mirrors web P2.6). Pure +
// offline — derived from the locally-synced rows. The app's Role lacks the server's `remote` /
// `status_updated`, so apply-ready is tier-A/B + verified and aging uses the applied date; numbers
// can differ slightly from the server's canonical /api/pipeline-health but the signal is the same.

const ACTIVE = ['Applied', 'Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer'];
const INTERVIEW = ['Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer'];

export type HealthBand = 'Good' | 'Fair' | 'At risk';
export interface PipelineHealth {
  band: HealthBand;
  score: number;
  mainRisk: string;
  recommendations: string[];
  metrics: {
    applyReady: number; appliedTotal: number; appliedLast7: number;
    interviewing: number; responseRate: number | null;
    followupsOverdue: number; agingApps: number; avgEvReady: number;
  };
}

export function pipelineHealth(roles: Role[]): PipelineHealth {
  const live = roles.filter((r) => r && r.status !== undefined);
  const applyReady = live.filter((r) => r.status === 'Not Applied' && (r.tier === 'A' || r.tier === 'B') && r.conf === 'verified');
  const applied = live.filter((r) => !!r.applied || ACTIVE.includes(r.status));
  const appliedLast7 = live.filter((r) => { const d = daysSince(r.applied); return d != null && d <= 7; });
  const interviewing = live.filter((r) => INTERVIEW.includes(r.status));
  const followupsOverdue = live.filter(followUpDue);
  const agingApps = live.filter((r) => r.status === 'Applied' && (() => { const d = daysSince(r.applied); return d != null && d >= 14; })());
  const appliedTotal = applied.length;
  const responseRate = appliedTotal ? Math.round((interviewing.length / appliedTotal) * 100) : null;
  const avgEvReady = applyReady.length ? Math.round((applyReady.reduce((s, r) => s + (+r.score || 0), 0) / applyReady.length) * 10) / 10 : 0;

  let score = 100;
  const risks: { w: number; t: string }[] = [];
  if (applyReady.length < 3) { const w = applyReady.length === 0 ? 30 : 18; score -= w; risks.push({ w, t: applyReady.length === 0 ? 'No apply-ready Tier A/B roles in the queue.' : `Only ${applyReady.length} apply-ready Tier A/B role${applyReady.length === 1 ? '' : 's'} queued.` }); }
  if (appliedLast7.length === 0) { score -= 22; risks.push({ w: 22, t: 'No applications submitted in the last 7 days.' }); }
  if (followupsOverdue.length > 0) { const w = Math.min(20, 6 + followupsOverdue.length * 3); score -= w; risks.push({ w, t: `${followupsOverdue.length} follow-up${followupsOverdue.length === 1 ? '' : 's'} overdue.` }); }
  if (agingApps.length > 0) { const w = Math.min(18, 4 + agingApps.length * 2); score -= w; risks.push({ w, t: `${agingApps.length} application${agingApps.length === 1 ? '' : 's'} aging 14+ days with no response.` }); }
  if (interviewing.length > 0) { score -= Math.min(10, interviewing.length * 4); }
  score = Math.max(0, Math.min(100, score));
  const band: HealthBand = score >= 75 ? 'Good' : score >= 50 ? 'Fair' : 'At risk';
  risks.sort((a, b) => b.w - a.w);
  const mainRisk = risks.length ? risks[0].t : 'Pipeline is balanced — keep applying to high-EV roles.';

  const recommendations: string[] = [];
  if (applyReady.length < 3) recommendations.push('Run the scout to find fresh Tier A/B roles.');
  if (applyReady.length > 0) recommendations.push(`Apply to your top ${Math.min(3, applyReady.length)} high-EV role${applyReady.length === 1 ? '' : 's'} (avg EV ${avgEvReady}).`);
  if (followupsOverdue.length > 0) recommendations.push(`Send ${followupsOverdue.length} overdue follow-up${followupsOverdue.length === 1 ? '' : 's'}.`);
  if (interviewing.length > 0) recommendations.push('Prep your interview/offer stage roles.');
  if (!recommendations.length) recommendations.push('Keep momentum — apply to the next high-EV role.');

  return {
    band, score, mainRisk, recommendations,
    metrics: { applyReady: applyReady.length, appliedTotal, appliedLast7: appliedLast7.length, interviewing: interviewing.length, responseRate, followupsOverdue: followupsOverdue.length, agingApps: agingApps.length, avgEvReady },
  };
}
