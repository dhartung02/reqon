// ---------------------------------------------------------------------------
// Server-computed analytics (parity source of truth) — ROADMAP follow-up.
//
// computeAnalytics(rows) is PURE and mirrors the web board's in-browser anMetrics + distributions +
// source-quality definitions EXACTLY, so the app (which fetches this when a server is configured) and
// the web show identical numbers. The app falls back to its local metrics only when standalone. This
// removes the "69 vs 104 applied" drift that came from two separate implementations.
// ---------------------------------------------------------------------------
'use strict';
const { computePipelineHealth } = require('./pipeline-health');

const ACTIVE_STAGES = ['Applied', 'Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer'];
const STAGE_RANK = { 'Not Applied': 0, Applied: 1, 'Recruiter Screen': 2, 'Hiring Manager': 3, Panel: 4, Offer: 5 };
const FUNNEL = ['Applied', 'Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer'];
const INTERVIEW_NOW = new Set(['Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer']);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Exact port of the web's anMetrics (public/index.html).
function metricsOf(rs) {
  const m = { total: rs.length, applied: 0, recruiter: 0, hm: 0, panel: 0, offer: 0, rejected: 0, archived: 0, notApplied: 0 };
  let ttrSum = 0, ttrN = 0;
  for (const x of rs) {
    const s = x.status || 'Not Applied';
    if (s === 'Not Applied') m.notApplied++;
    if (s === 'Archived') m.archived++;
    if (s === 'Rejected') m.rejected++;
    if (ACTIVE_STAGES.includes(s) || s === 'Rejected' || !!x.applied) m.applied++;
    const r = STAGE_RANK[s];
    if (r >= 2) m.recruiter++; if (r >= 3) m.hm++; if (r >= 4) m.panel++; if (r >= 5) m.offer++;
    if (x.applied && x.lastcontact) { const d = (Date.parse(x.lastcontact) - Date.parse(x.applied)) / 864e5; if (!isNaN(d) && d >= 0) { ttrSum += d; ttrN++; } }
  }
  m.responseRate = pct(m.recruiter, m.applied); m.offerRate = pct(m.offer, m.applied); m.rejectRate = pct(m.rejected, m.applied);
  m.ttr = ttrN ? Math.round((ttrSum / ttrN) * 10) / 10 : null; m.ttrN = ttrN;
  return m;
}

// Simple distribution: [{key, count}] sorted desc, optional top-N.
function distBy(rs, keyFn, top) {
  const g = {};
  for (const x of rs) { const k = keyFn(x) || '—'; g[k] = (g[k] || 0) + 1; }
  let out = Object.entries(g).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  if (top) out = out.slice(0, top);
  return out;
}

// Per-source quality (mirrors the web's Source quality card).
function sourceQuality(rs) {
  const keyCount = {};
  for (const x of rs) { if (x.status === 'Rejected' || x.status === 'Archived') continue; const k = norm(x.company) + '||' + norm(x.role); keyCount[k] = (keyCount[k] || 0) + 1; }
  const g = {};
  for (const x of rs) { const s = (x.source && String(x.source).trim()) || 'manual'; (g[s] = g[s] || []).push(x); }
  return Object.keys(g).map((s) => {
    const arr = g[s], n = arr.length;
    const ab = arr.filter((x) => x.tier === 'A' || x.tier === 'B').length;
    const applied = arr.filter((x) => x.applied || INTERVIEW_NOW.has(x.status) || x.status === 'Rejected').length;
    const interviewed = arr.filter((x) => INTERVIEW_NOW.has(x.status)).length;
    const closed = arr.filter((x) => x.status === 'Archived' || x.reqCheck === 'closed').length;
    const dup = arr.filter((x) => (x.status !== 'Rejected' && x.status !== 'Archived') && keyCount[norm(x.company) + '||' + norm(x.role)] > 1).length;
    return { source: s, roles: n, abPct: pct(ab, n), appPct: pct(applied, n), respPct: pct(interviewed, applied), intPct: pct(interviewed, applied), closedPct: pct(closed, n), dup };
  }).sort((a, b) => b.roles - a.roles);
}

function computeAnalytics(rows, ctx) {
  const rs = (rows || []).filter((r) => r && r.deleted !== true);
  const m = metricsOf(rs);
  const byStatus = (s) => rs.filter((r) => (r.status || 'Not Applied') === s).length;
  const remoteLabel = (x) => ({ remote: 'Remote', flex: 'Flex/Hybrid', onsite: 'On-site' }[x.remote] || '—');
  return {
    generatedAt: ctx && ctx.now ? ctx.now : null,
    metrics: m,
    funnel: FUNNEL.map((stage) => ({ stage, count: byStatus(stage) })),
    outcomes: {
      awaiting: byStatus('Applied'),
      interview: rs.filter((r) => ['Recruiter Screen', 'Hiring Manager', 'Panel'].includes(r.status)).length,
      offer: byStatus('Offer'),
      rejected: byStatus('Rejected'),
    },
    tiers: { A: rs.filter((r) => r.tier === 'A').length, B: rs.filter((r) => r.tier === 'B').length, C: rs.filter((r) => r.tier === 'C').length },
    distributions: {
      sector: distBy(rs, (x) => x.sector),
      tier: distBy(rs, (x) => 'Tier ' + (x.tier || '?')),
      remote: distBy(rs, remoteLabel),
      company: distBy(rs, (x) => x.company, 12),
    },
    sourceQuality: sourceQuality(rs),
    health: computePipelineHealth(rs, ctx || {}),
  };
}

module.exports = { computeAnalytics, metricsOf };
