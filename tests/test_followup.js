// Unit tests for the follow-up recommendation engine (lib/followup.js, ROADMAP-V3 P2.8). Pure.
// Run: node tests/test_followup.js
const assert = require('node:assert');
const { computeFollowup } = require('../lib/followup');
const today = '2026-06-24';
let passed = 0;
const ok = (n, fn) => { fn(); console.log('  ✓ ' + n); passed++; };

ok('not-applied roles are not applicable', () => {
  assert.strictEqual(computeFollowup({ status: 'Not Applied' }, today).applicable, false);
});

ok('applied long ago with no contact is due, suggests a nudge', () => {
  const f = computeFollowup({ status: 'Applied', applied: '2026-06-10' }, today);
  assert.strictEqual(f.applicable, true);
  assert.strictEqual(f.kind, 'applied_nudge');
  assert.strictEqual(f.state, 'due');
  assert.strictEqual(f.dueInDays, 0);
});

ok('recently applied is scheduled, not due', () => {
  const f = computeFollowup({ status: 'Applied', applied: '2026-06-23' }, today);
  assert.strictEqual(f.state, 'scheduled');
  assert.ok(f.dueInDays > 0 && f.suggestedDate > today);
});

ok('interview stage suggests thank-you + uses recruiter channel', () => {
  const f = computeFollowup({ status: 'Panel', lastcontact: '2026-06-21', recruiter: 'Jane Doe' }, today);
  assert.strictEqual(f.kind, 'post_interview');
  assert.strictEqual(f.state, 'due');
  assert.ok(/Email the recruiter/.test(f.channel));
  assert.strictEqual(f.contact, 'Jane Doe');
});

ok('offer stage prompts a prompt confirmation, generic channel when no contact', () => {
  const f = computeFollowup({ status: 'Offer', lastcontact: '2026-06-23' }, today);
  assert.strictEqual(f.kind, 'offer_followup');
  assert.ok(/LinkedIn/.test(f.channel));
});

console.log('\nPASS — ' + passed + ' follow-up checks');
