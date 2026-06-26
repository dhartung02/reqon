// ---------------------------------------------------------------------------
// Unified action-item model (ROADMAP-V3 · P2.1)
//
// One normalized, DETERMINISTIC action system that web / app / extension all consume, replacing the
// scattered "Today / follow-up due / needs verify / needs enrichment / closed / budget" concepts.
//
// computeActionItems(rows, ctx) is PURE — it takes the live rows plus a context bag (profile, scout
// status, source health, assist usage, mail-config flag, today's date) and returns a sorted list of
// action items. No I/O here, so it's fully unit-testable; server.js gathers the inputs and calls it.
//
// Each item: { id, type, roleId, company, role, severity, priority, reason, source, createdAt,
//              dueAt, resolved:false, surfaces:[…], cta:{label,target} }. Higher priority = sort first.
// ---------------------------------------------------------------------------
'use strict';

const INTERVIEW = new Set(['Recruiter Screen', 'Hiring Manager', 'Panel']);
const CLOSED = new Set(['Rejected', 'Archived']);
const ev = r => Math.round(((+r.fit || 0) * (+r.prob || 0)) / 10 * 10) / 10;
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Local date-only delta in whole days (positive = in the past). Parses YYYY-MM-DD as a plain date.
function daysAgo(dateStr, today) {
  if (!dateStr) return null;
  const d = Date.parse(String(dateStr).slice(0, 10));
  const t = Date.parse(String(today).slice(0, 10));
  if (isNaN(d) || isNaN(t)) return null;
  return Math.round((t - d) / 86400000);
}

// Per-type surface applicability — queued_* are client-owned (the server can't see chrome.storage),
// so they're injected by the client, not here. Everything computed here is web + app.
const TYPE_SURFACES = {
  apply_next: ['web', 'app', 'extension'],
  follow_up_due: ['web', 'app', 'extension'],
  review_interview: ['web', 'app'],
  review_offer: ['web', 'app'],
  review_rejection: ['web', 'app'],
  verify_role: ['web', 'app'],
  needs_scoring: ['web', 'app'],
  enrich_failed: ['web', 'app'],
  duplicate_review: ['web', 'app'],
  closed_posting: ['web', 'app'],
  profile_missing: ['web', 'app'],
  gmail_setup_needed: ['web', 'app'],
  ai_budget_warning: ['web', 'app'],
  scout_error: ['web', 'app'],
  thankyou_due: ['web', 'app', 'extension'],
};

function computeActionItems(rows, ctx) {
  const c = ctx || {};
  const today = c.today || new Date().toISOString().slice(0, 10);
  const remoteOnly = c.remoteOnly !== false;
  const items = [];
  const push = (it) => { it.resolved = false; it.surfaces = TYPE_SURFACES[it.type] || ['web', 'app']; items.push(it); };
  const live = (rows || []).filter(r => r && r.deleted !== true);

  for (const r of live) {
    const id = r.id || (norm(r.company) + '|' + norm(r.role));
    const base = { roleId: r.id || null, company: r.company || '', role: r.role || '', createdAt: r.updatedAt || null, dueAt: null };
    const status = r.status || 'Not Applied';
    const open = !CLOSED.has(status);
    const scored = r.fit !== '' && r.fit != null && r.prob !== '' && r.prob != null;
    const onsite = (r.remote || '') === 'onsite';

    if (status === 'Offer') {
      push(Object.assign({ id: 'offer-' + id, type: 'review_offer', severity: 'high', priority: 98, source: 'status',
        reason: 'Offer stage — review and respond.', cta: { label: 'Open role', target: 'role-detail' } }, base));
    } else if (INTERVIEW.has(status)) {
      push(Object.assign({ id: 'interview-' + id, type: 'review_interview', severity: 'high', priority: 88, source: 'status',
        reason: status + ' — prep and track next steps.', cta: { label: 'Open role', target: 'role-detail' } }, base));
    }

    // thank-you note due — interview date was today or within the last 2 days
    const ivd = daysAgo(r.interview, today);
    if (INTERVIEW.has(status) && ivd != null && ivd >= 0 && ivd <= 2) {
      push(Object.assign({ id: 'ty-' + id, type: 'thankyou_due', severity: ivd === 0 ? 'high' : 'medium', priority: 92, source: 'interview',
        reason: ivd === 0 ? 'Interview today — draft and send a thank-you note.' :
                'Interview ' + ivd + ' day' + (ivd === 1 ? '' : 's') + ' ago — send a thank-you note.',
        dueAt: r.interview, cta: { label: 'Draft thank-you', target: 'thankyou' } }, base));
    }

    // follow-up due (open rows only) — explicit followup date that has arrived
    const fd = daysAgo(r.followup, today);
    if (open && fd != null && fd >= 0) {
      push(Object.assign({ id: 'followup-' + id, type: 'follow_up_due', severity: fd > 3 ? 'high' : 'medium', priority: 80 + Math.min(15, fd), source: 'followup',
        reason: fd === 0 ? 'Follow-up due today.' : 'Follow-up overdue by ' + fd + ' day' + (fd === 1 ? '' : 's') + '.', dueAt: r.followup, cta: { label: 'Open role', target: 'role-detail' } }, base));
    }

    // apply next — a strong, unapplied, remote-friendly role
    if (status === 'Not Applied' && scored && !(remoteOnly && onsite)) {
      const e = ev(r); const strong = (r.tier === 'A') || e >= 6;
      if (strong) push(Object.assign({ id: 'apply-' + id, type: 'apply_next', severity: e >= 7 ? 'high' : 'medium', priority: 60 + Math.round(e), source: 'score',
        reason: 'Tier ' + (r.tier || '?') + ' · EV ' + e + (onsite ? '' : ' · remote-friendly') + ' — apply next.', cta: { label: 'Open role', target: 'role-detail' } }, base));
    }

    // needs scoring — open row with no fit/prob yet
    if (open && !scored && status === 'Not Applied') {
      push(Object.assign({ id: 'score-' + id, type: 'needs_scoring', severity: 'low', priority: 45, source: 'score',
        reason: 'Unscored lead — score fit/prob to rank it.', cta: { label: 'Open role', target: 'role-detail' } }, base));
    }

    // verify role — lead / unverified, still open
    if (open && status === 'Not Applied' && (r.reqCheck === 'lead' || ['unverified', 'boardonly'].includes(r.conf))) {
      push(Object.assign({ id: 'verify-' + id, type: 'verify_role', severity: 'low', priority: 42, source: 'reqcheck',
        reason: 'Unverified posting — confirm it is live before applying.', cta: { label: 'Open role', target: 'role-detail' } }, base));
    }

    // enrichment that should have run by now (captured >1 day ago, still flagged)
    const addedAgo = daysAgo(r.added, today);
    if (r.needsEnrichment === true && addedAgo != null && addedAgo >= 1) {
      push(Object.assign({ id: 'enrich-' + id, type: 'enrich_failed', severity: 'low', priority: 38, source: 'enrich',
        reason: 'Enrichment still pending after capture — re-run enrich.', cta: { label: 'Open role', target: 'role-detail' } }, base));
    }

    // recently processed rejection — FYI, low priority
    const rej = daysAgo(r.status_updated || r.lastcontact, today);
    if (status === 'Rejected' && rej != null && rej <= 7) {
      push(Object.assign({ id: 'rej-' + id, type: 'review_rejection', severity: 'low', priority: 22, source: 'status',
        reason: 'Rejection logged' + (rej === 0 ? ' today' : ' ' + rej + 'd ago') + ' — note any learnings.', cta: { label: 'Open role', target: 'role-detail' } }, base));
    }
  }

  // duplicate review — same company + normalized role across 2+ open rows
  const groups = new Map();
  for (const r of live) {
    if (CLOSED.has(r.status || '')) continue;
    const k = norm(r.company) + '||' + norm(r.role);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const [, g] of groups) {
    if (g.length < 2) continue;
    const r = g[0];
    push({ id: 'dup-' + (norm(r.company) + '|' + norm(r.role)), type: 'duplicate_review', roleId: r.id || null,
      company: r.company || '', role: r.role || '', severity: 'low', priority: 34, source: 'dedupe',
      reason: g.length + ' rows look like the same posting — merge or delete extras.', createdAt: null, dueAt: null,
      cta: { label: 'Review duplicates', target: 'role-detail' } });
  }

  // ---- global (non-role) actions from context ----
  const prof = c.profile || {};
  const app = prof.applicant || {};
  if (!app.name || !(prof.resumeText || prof.resumeFile || (prof.keywords || []).length || (prof.narratives || []).length)) {
    push({ id: 'profile-missing', type: 'profile_missing', roleId: null, company: '', role: '', severity: 'medium', priority: 65, source: 'profile',
      reason: 'Candidate profile is incomplete — scoring, tailoring, and fill stay weak until you add it.', createdAt: null, dueAt: null,
      cta: { label: 'Open profile settings', target: 'settings/profile' } });
  }
  if (c.mailConfigured === false) {
    push({ id: 'gmail-setup', type: 'gmail_setup_needed', roleId: null, company: '', role: '', severity: 'low', priority: 18, source: 'config',
      reason: 'Gmail ingest is not set up — recruiter replies will not auto-update the board.', createdAt: null, dueAt: null,
      cta: { label: 'Open digest settings', target: 'settings/digest' } });
  }
  const budgetPct = c.assist && c.assist.budgetPct;
  if (budgetPct != null && budgetPct >= 80) {
    push({ id: 'ai-budget', type: 'ai_budget_warning', roleId: null, company: '', role: '', severity: budgetPct >= 100 ? 'high' : 'medium', priority: budgetPct >= 100 ? 75 : 28, source: 'assist',
      reason: 'AI usage at ' + budgetPct + '% of your monthly budget.', createdAt: null, dueAt: null,
      cta: { label: 'Open AI settings', target: 'settings/ai' } });
  }
  const scout = c.scoutStatus || {};
  if (scout.state === 'error') {
    push({ id: 'scout-error', type: 'scout_error', roleId: null, company: '', role: '', severity: 'medium', priority: 50, source: 'scout',
      reason: 'Last scout run errored' + (scout.error ? ': ' + String(scout.error).slice(0, 120) : '.') , createdAt: scout.startedAt || null, dueAt: null,
      cta: { label: 'Open sources', target: 'settings/sources' } });
  }

  items.sort((a, b) => (b.priority - a.priority) || String(a.type).localeCompare(b.type));
  return items;
}

module.exports = { computeActionItems, TYPE_SURFACES };
