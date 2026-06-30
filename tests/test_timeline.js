// Unit tests for the per-role timeline (lib/timeline.js, ROADMAP P2.5). Pure + deterministic.
// Run: node tests/test_timeline.js
const assert = require('node:assert');
const { buildTimeline, captureLabel } = require('../lib/timeline');

let passed = 0;
const ok = (name, fn) => { fn(); console.log('  ✓ ' + name); passed++; };
const types = ev => ev.map(e => e.type);

ok('captureLabel maps source to a label + actor', () => {
  assert.strictEqual(captureLabel('chrome-ext').actor, 'you');
  assert.ok(/extension/i.test(captureLabel('chrome-ext').label));
  assert.strictEqual(captureLabel('greenhouse').actor, 'scout');
  assert.strictEqual(captureLabel('manual').actor, 'you');
});

ok('intrinsic row fields become events', () => {
  const row = { company: 'Acme', role: 'PM', source: 'chrome-ext', added: '2026-06-01',
    applied: '2026-06-05', interview: '2026-06-10', guideAt: '2026-06-10T12:00:00Z', reqCheckedOn: '2026-06-02' };
  const ev = buildTimeline(row, []);
  assert.ok(types(ev).includes('captured'));
  assert.ok(types(ev).includes('applied'));
  assert.ok(types(ev).includes('interview'));
  assert.ok(types(ev).includes('guide'));
  assert.ok(types(ev).includes('verified'));
});

ok('enrichment-log score + status changes become events', () => {
  const row = { company: 'Acme', role: 'PM', source: 'greenhouse', added: '2026-06-01', fit: 8, prob: 7 };
  const entries = [
    { ts: '2026-06-03T00:00:00Z', key: 'acme|pm', result: 'pass', changes: { fit: { old: 6, new: 8 }, prob: { old: 5, new: 7 } }, tier: { old: 'B', new: 'A' } },
    { ts: '2026-06-06T00:00:00Z', key: 'acme|pm', result: 'pass', changes: { status: { old: 'Not Applied', new: 'Rejected' } }, note: 'gmail' },
  ];
  const ev = buildTimeline(row, entries);
  const score = ev.find(e => e.type === 'score');
  assert.ok(score && /fit 8/.test(score.detail) && /tier A/.test(score.detail));
  assert.ok(ev.find(e => e.type === 'rejection'));
});

ok('logging noise (no row matched) is dropped', () => {
  const ev = buildTimeline({ company: 'A', role: 'B', added: '2026-06-01', source: 'manual' },
    [{ ts: '2026-06-02T00:00:00Z', key: 'a|b', result: 'fail', note: 'no row matched key' }]);
  assert.ok(!ev.some(e => e.type === 'enrich_failed'));
});

ok('events are newest-first', () => {
  const row = { company: 'A', role: 'B', source: 'manual', added: '2026-06-01', applied: '2026-06-10' };
  const ev = buildTimeline(row, []);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i - 1].ts >= ev[i].ts);
});

console.log('\nPASS — ' + passed + ' timeline checks');
