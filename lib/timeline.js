// ---------------------------------------------------------------------------
// Per-role timeline (ROADMAP · P2.5)
//
// buildTimeline(row, enrichEntries) is PURE — it reconstructs "how this role got here" from two
// deterministic sources: the row's own timestamped fields (added/applied/interview/guideAt/…) and
// the role's enrichment-log entries (score/status/conf changes, enrichment pass/fail, notes).
// No I/O — server.js reads the row + filters the (tenant-scoped) enrichment log by key and passes
// the matching entries in. Events are returned newest-first, each tagged with an actor so the UI can
// distinguish user actions from automated changes.
// ---------------------------------------------------------------------------
'use strict';

// actor ∈ you | scout | ai | auto | system  — drives the icon/colour in the UI.
function captureLabel(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('chrome') || s.includes('ext')) return { label: 'Captured from the browser extension', actor: 'you' };
  if (s.includes('mobile') || s.includes('quick')) return { label: 'Captured from mobile quick-add', actor: 'you' };
  if (s === 'manual') return { label: 'Added manually', actor: 'you' };
  if (s && s !== 'quick-add') return { label: 'Scout found this role (' + source + ')', actor: 'scout' };
  return { label: 'Added to the board', actor: 'you' };
}

function buildTimeline(row, enrichEntries) {
  const r = row || {};
  const events = [];
  const at = (ts, type, label, detail, actor) => { if (ts) events.push({ ts: String(ts), type, label, detail: detail || '', actor: actor || 'auto' }); };

  // ---- intrinsic events from the row's own timestamped fields ----
  const cap = captureLabel(r.source);
  at(r.added, 'captured', cap.label, r.role ? (r.company || '') : '', cap.actor);
  at(r.reqCheckedOn, 'verified', 'Posting verified', r.conf ? 'confidence: ' + r.conf : '', 'you');
  at(r.applied || r.date_applied, 'applied', 'Marked applied', '', 'you');
  at(r.interview, 'interview', 'Interview scheduled', '', 'you');
  at(r.guideAt, 'guide', 'Interview prep guide generated', '', 'ai');
  if (r.followup) at(r.followup, 'followup', 'Follow-up scheduled', '', 'you');

  // ---- rich events from the enrichment log (per-key change history) ----
  for (const e of (enrichEntries || [])) {
    if (!e || !e.ts) continue;
    if (e.result === 'fail' && /no row matched/i.test(e.note || '')) continue;   // logging noise, not a real event
    const ch = e.changes || {};
    const run = e.run ? 'scout' : null;
    const manual = /chrome-ext|edited via|set via/i.test(e.note || '');
    const actor = manual ? 'you' : (run || (e.note && /ai/i.test(e.note) ? 'ai' : 'auto'));

    if (ch.status) {
      const ns = ch.status.new;
      const map = { Rejected: ['rejection', 'Rejection recorded'], Offer: ['offer', 'Offer recorded'],
        'Recruiter Screen': ['interview', 'Advanced to Recruiter Screen'], 'Hiring Manager': ['interview', 'Advanced to Hiring Manager'],
        Panel: ['interview', 'Advanced to Panel'], Applied: ['applied', 'Marked applied'] };
      const m = map[ns] || ['status', 'Status → ' + ns];
      at(e.ts, m[0], m[1], (ch.status.old ? ch.status.old + ' → ' + ns : ''), actor);
    }
    if (ch.fit || ch.prob) {
      const f = ch.fit ? ch.fit.new : r.fit, p = ch.prob ? ch.prob.new : r.prob;
      at(e.ts, 'score', 'Score updated', 'fit ' + f + ' · prob ' + p + (e.tier ? ' · tier ' + e.tier.new : ''), actor);
    }
    if (!ch.status && !ch.fit && !ch.prob) {
      if (e.result === 'pass') at(e.ts, 'enriched', 'Enrichment updated the role', e.note || '', run || 'auto');
      else if (e.result === 'fail') at(e.ts, 'enrich_failed', 'Enrichment failed', e.note || '', 'auto');
      else if (e.note) at(e.ts, 'note', 'Note', e.note, actor);
    }
  }

  // newest first; stable by string ts
  events.sort((a, b) => (b.ts < a.ts ? -1 : b.ts > a.ts ? 1 : 0));
  return events;
}

module.exports = { buildTimeline, captureLabel };
