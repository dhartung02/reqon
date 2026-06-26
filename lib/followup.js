// ---------------------------------------------------------------------------
// Follow-up recommendation engine (ROADMAP-V3 · P2.8)
//
// computeFollowup(row, today) is PURE — for an applied/interviewing role it returns the follow-up
// due state, a suggested channel, the timing reason, the known contact, and a suggested next date.
// The actual message is drafted on demand by the AI assist ('followup' kind), grounded in narratives.
// Deterministic + side-effect-free; the server exposes it and the board renders + copies it.
// ---------------------------------------------------------------------------
'use strict';

const INTERVIEW = new Set(['Recruiter Screen', 'Hiring Manager', 'Panel']);
function daysAgo(d, today) {
  if (!d) return null;
  const a = Date.parse(String(d).slice(0, 10)), b = Date.parse(String(today).slice(0, 10));
  return (isNaN(a) || isNaN(b)) ? null : Math.round((b - a) / 86400000);
}
function addDays(today, n) {
  const t = Date.parse(String(today).slice(0, 10));
  if (isNaN(t)) return '';
  return new Date(t + n * 86400000).toISOString().slice(0, 10);
}

// Stage-aware cadence (business-ish days, kept simple): how long to wait before a nudge is "due".
function cadenceDays(status) {
  if (status === 'Offer') return 2;
  if (INTERVIEW.has(status)) return 2;     // thank-you / next-steps within a couple days of the talk
  if (status === 'Applied') return 6;      // recruiter nudge ~a week after applying with no response
  return null;
}

function computeFollowup(row, today) {
  const r = row || {};
  const status = r.status || 'Not Applied';
  const t = today || new Date().toISOString().slice(0, 10);
  const cadence = cadenceDays(status);
  if (cadence == null) return { applicable: false, reason: 'Follow-ups apply once a role is applied or interviewing.' };

  // anchor = the most recent meaningful touch
  const anchorField = INTERVIEW.has(status) || status === 'Offer' ? (r.lastcontact || r.interview || r.applied) : (r.lastcontact || r.applied);
  const sinceTouch = daysAgo(anchorField, t);
  const contact = (r.recruiter || '').trim();
  const channel = contact ? 'Email the recruiter' : 'LinkedIn message / careers email';

  let kind, headline, reason;
  if (status === 'Offer') {
    kind = 'offer_followup'; headline = 'Confirm offer details / timeline';
    reason = 'Offer stage — confirm the decision timeline and any open questions promptly.';
  } else if (INTERVIEW.has(status)) {
    kind = 'post_interview'; headline = 'Thank-you + next steps';
    reason = sinceTouch == null ? `After your ${status} conversation, send a thank-you and ask about next steps.`
      : `It's been ${sinceTouch} day${sinceTouch === 1 ? '' : 's'} since your last contact at the ${status} stage — a thank-you + next-steps note keeps momentum.`;
  } else {
    kind = 'applied_nudge'; headline = 'Polite status check';
    reason = sinceTouch == null ? 'Applied — a brief check-in after about a week shows interest without pestering.'
      : `It's been ${sinceTouch} day${sinceTouch === 1 ? '' : 's'} since you applied with no logged response — a brief, polite check-in is reasonable.`;
  }

  const dueIn = sinceTouch == null ? cadence : Math.max(0, cadence - sinceTouch);
  const state = dueIn <= 0 ? 'due' : (dueIn <= 1 ? 'soon' : 'scheduled');
  const suggestedDate = dueIn <= 0 ? t : addDays(t, dueIn);

  return {
    applicable: true, kind, headline, state, dueInDays: dueIn, suggestedDate,
    channel, contact, reason, sinceTouch,
    company: r.company || '', role: r.role || '', status,
  };
}

module.exports = { computeFollowup, cadenceDays };
