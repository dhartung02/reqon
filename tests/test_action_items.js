// Unit tests for the unified action-item model (lib/action-items.js, ROADMAP-V3 P2.1).
// Pure + deterministic — run: node tests/test_action_items.js
const assert = require('node:assert');
const { computeActionItems } = require('../lib/action-items');

const today = '2026-06-24';
const find = (items, type) => items.filter(i => i.type === type);
let passed = 0;
const ok = (name, fn) => { fn(); console.log('  ✓ ' + name); passed++; };

ok('apply_next for a strong unapplied remote-friendly role', () => {
  const rows = [{ id: '1', company: 'Acme', role: 'Principal PM', status: 'Not Applied', fit: 9, prob: 7, tier: 'A', remote: 'remote' }];
  const it = computeActionItems(rows, { today, profile: { applicant: { name: 'X' }, keywords: [1] } });
  const a = find(it, 'apply_next');
  assert.strictEqual(a.length, 1);
  assert.ok(a[0].priority > 60 && a[0].reason.includes('EV'));
  assert.ok(a[0].surfaces.includes('extension'));
});

ok('onsite role is suppressed from apply_next when remote-only', () => {
  const rows = [{ id: '1', company: 'Acme', role: 'PM', status: 'Not Applied', fit: 9, prob: 8, tier: 'A', remote: 'onsite' }];
  assert.strictEqual(find(computeActionItems(rows, { today, remoteOnly: true, profile: { applicant: { name: 'X' }, keywords: [1] } }), 'apply_next').length, 0);
  assert.strictEqual(find(computeActionItems(rows, { today, remoteOnly: false, profile: { applicant: { name: 'X' }, keywords: [1] } }), 'apply_next').length, 1);
});

ok('follow_up_due fires only when the date has arrived', () => {
  const due = [{ id: '1', company: 'A', role: 'R', status: 'Applied', followup: '2026-06-20' }];
  const future = [{ id: '1', company: 'A', role: 'R', status: 'Applied', followup: '2026-07-20' }];
  assert.strictEqual(find(computeActionItems(due, { today, profile: { applicant: { name: 'X' }, keywords: [1] } }), 'follow_up_due').length, 1);
  assert.strictEqual(find(computeActionItems(future, { today, profile: { applicant: { name: 'X' }, keywords: [1] } }), 'follow_up_due').length, 0);
});

ok('interview + offer statuses raise review actions', () => {
  const rows = [
    { id: '1', company: 'A', role: 'R', status: 'Panel' },
    { id: '2', company: 'B', role: 'S', status: 'Offer' },
  ];
  const it = computeActionItems(rows, { today, profile: { applicant: { name: 'X' }, keywords: [1] } });
  assert.strictEqual(find(it, 'review_interview').length, 1);
  assert.strictEqual(find(it, 'review_offer').length, 1);
  assert.ok(find(it, 'review_offer')[0].priority > find(it, 'review_interview')[0].priority);
});

ok('needs_scoring + verify_role for an unscored lead', () => {
  const rows = [{ id: '1', company: 'A', role: 'R', status: 'Not Applied', fit: '', prob: '', reqCheck: 'lead', conf: 'unverified' }];
  const it = computeActionItems(rows, { today, profile: { applicant: { name: 'X' }, keywords: [1] } });
  assert.strictEqual(find(it, 'needs_scoring').length, 1);
  assert.strictEqual(find(it, 'verify_role').length, 1);
});

ok('duplicate_review groups same company+role', () => {
  const rows = [
    { id: '1', company: 'Acme', role: 'Senior PM', status: 'Not Applied' },
    { id: '2', company: 'ACME', role: 'senior pm', status: 'Not Applied' },
  ];
  assert.strictEqual(find(computeActionItems(rows, { today, profile: { applicant: { name: 'X' }, keywords: [1] } }), 'duplicate_review').length, 1);
});

ok('global actions: profile_missing, gmail_setup_needed, ai_budget_warning, scout_error', () => {
  const it = computeActionItems([], {
    today, profile: { applicant: {} }, mailConfigured: false,
    assist: { budgetPct: 95 }, scoutStatus: { state: 'error', error: 'boom' },
  });
  assert.strictEqual(find(it, 'profile_missing').length, 1);
  assert.strictEqual(find(it, 'gmail_setup_needed').length, 1);
  assert.strictEqual(find(it, 'ai_budget_warning').length, 1);
  assert.strictEqual(find(it, 'scout_error').length, 1);
});

ok('deleted rows are ignored; items sort by priority desc', () => {
  const rows = [
    { id: '1', company: 'A', role: 'R', status: 'Not Applied', fit: 9, prob: 8, tier: 'A', remote: 'remote' },
    { id: '2', company: 'B', role: 'S', status: 'Offer', deleted: true },
  ];
  const it = computeActionItems(rows, { today, profile: { applicant: { name: 'X' }, keywords: [1] } });
  assert.strictEqual(find(it, 'review_offer').length, 0);   // deleted skipped
  for (let i = 1; i < it.length; i++) assert.ok(it[i - 1].priority >= it[i].priority);
});

console.log('\nPASS — ' + passed + ' action-item checks');
