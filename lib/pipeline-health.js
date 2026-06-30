// ---------------------------------------------------------------------------
// Pipeline health score (ROADMAP · P2.6)
//
// computePipelineHealth(rows, ctx) is PURE — it turns the live pipeline into a single health band,
// the main risk, and concrete recommended next actions (analytics that tells you what to DO, not
// just charts). Deterministic; server.js gathers rows + today and exposes it at /api/pipeline-health.
// ---------------------------------------------------------------------------
'use strict';

const ACTIVE = new Set(['Applied', 'Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer']);
const INTERVIEW = new Set(['Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer']);
const ev = r => Math.round(((+r.fit || 0) * (+r.prob || 0)) / 10 * 10) / 10;
function daysAgo(d, today) {
  if (!d) return null;
  const a = Date.parse(String(d).slice(0, 10)), b = Date.parse(String(today).slice(0, 10));
  return (isNaN(a) || isNaN(b)) ? null : Math.round((b - a) / 86400000);
}

function computePipelineHealth(rows, ctx) {
  const c = ctx || {};
  const today = c.today || new Date().toISOString().slice(0, 10);
  const live = (rows || []).filter(r => r && r.deleted !== true);

  const applyReady = live.filter(r => (r.status || 'Not Applied') === 'Not Applied' && ['A', 'B'].includes(r.tier) && r.conf === 'verified');
  const applied = live.filter(r => r.applied || ACTIVE.has(r.status || ''));
  const appliedLast7 = live.filter(r => { const d = daysAgo(r.applied, today); return d != null && d >= 0 && d <= 7; });
  const interviewing = live.filter(r => INTERVIEW.has(r.status || ''));
  const rejected = live.filter(r => (r.status || '') === 'Rejected');
  const followupsOverdue = live.filter(r => !['Rejected', 'Archived'].includes(r.status || '') && (() => { const d = daysAgo(r.followup, today); return d != null && d >= 0; })());
  const needsReview = live.filter(r => INTERVIEW.has(r.status || ''));
  const agingApps = live.filter(r => (r.status || '') === 'Applied' && (() => { const d = daysAgo(r.applied, today); return d != null && d >= 14; })());
  const appliedTotal = applied.length;
  const responseRate = appliedTotal ? Math.round((interviewing.length / appliedTotal) * 100) : null;
  const rejectionRate = appliedTotal ? Math.round((rejected.length / appliedTotal) * 100) : null;
  const avgEvReady = applyReady.length ? Math.round(applyReady.reduce((s, r) => s + ev(r), 0) / applyReady.length * 10) / 10 : 0;

  // deterministic scoring + risks
  let score = 100;
  const risks = [];   // {weight, text}
  if (applyReady.length < 3) { const w = applyReady.length === 0 ? 30 : 18; score -= w; risks.push({ weight: w, text: applyReady.length === 0 ? 'No apply-ready Strong / Possible roles in the queue.' : `Only ${applyReady.length} apply-ready Strong / Possible role${applyReady.length === 1 ? '' : 's'} queued.` }); }
  if (appliedLast7.length === 0) { score -= 22; risks.push({ weight: 22, text: 'No applications submitted in the last 7 days.' }); }
  if (followupsOverdue.length > 0) { const w = Math.min(20, 6 + followupsOverdue.length * 3); score -= w; risks.push({ weight: w, text: `${followupsOverdue.length} follow-up${followupsOverdue.length === 1 ? '' : 's'} overdue.` }); }
  if (agingApps.length > 0) { const w = Math.min(18, 4 + agingApps.length * 2); score -= w; risks.push({ weight: w, text: `${agingApps.length} application${agingApps.length === 1 ? '' : 's'} aging 14+ days with no response.` }); }
  if (needsReview.length > 0) { score -= Math.min(10, needsReview.length * 4); risks.push({ weight: 8, text: `${needsReview.length} interview/offer stage role${needsReview.length === 1 ? '' : 's'} need attention.` }); }
  score = Math.max(0, Math.min(100, score));
  const band = score >= 75 ? 'Good' : score >= 50 ? 'Fair' : 'At risk';
  risks.sort((a, b) => b.weight - a.weight);
  const mainRisk = risks.length ? risks[0].text : 'Pipeline is balanced — keep applying to high-EV roles.';

  // recommendations link to action surfaces (the command center / scout / role detail)
  const recommendations = [];
  if (applyReady.length < 3) recommendations.push({ text: 'Find new jobs to surface fresh Strong / Possible roles.', action: 'run_scout' });
  if (applyReady.length > 0) recommendations.push({ text: `Apply to your top ${Math.min(3, applyReady.length)} high-EV role${applyReady.length === 1 ? '' : 's'} (avg EV ${avgEvReady}).`, action: 'apply_next' });
  if (followupsOverdue.length > 0) recommendations.push({ text: `Send ${followupsOverdue.length} overdue follow-up${followupsOverdue.length === 1 ? '' : 's'}.`, action: 'follow_up_due' });
  if (needsReview.length > 0) recommendations.push({ text: 'Review interview/offer stage roles.', action: 'review_interview' });
  if (!recommendations.length) recommendations.push({ text: 'Keep momentum — apply to the next high-EV role.', action: 'apply_next' });

  return {
    band, score, mainRisk, recommendations,
    metrics: {
      applyReady: applyReady.length, appliedTotal, appliedLast7: appliedLast7.length,
      interviewing: interviewing.length, rejected: rejected.length,
      responseRate, rejectionRate, followupsOverdue: followupsOverdue.length,
      needsReview: needsReview.length, agingApps: agingApps.length, avgEvReady,
    },
  };
}

module.exports = { computePipelineHealth };
