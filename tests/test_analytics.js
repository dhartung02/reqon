// Unit tests for the shared server analytics (lib/analytics.js). Pure; mirrors the web's anMetrics.
// Run: node tests/test_analytics.js
const assert = require('node:assert');
const { computeAnalytics, metricsOf } = require('../lib/analytics');
let passed = 0;
const ok = (n, fn) => { fn(); console.log('  ✓ ' + n); passed++; };

ok('applied = ever-applied (active stage / rejected / has applied date), like the web', () => {
  const rows = [
    { status: 'Applied', applied: '2026-06-01' },
    { status: 'Panel' },                       // active stage, no date → still counts
    { status: 'Rejected' },                    // rejected → counts
    { status: 'Not Applied', applied: '2026-05-01' }, // has a date → counts
    { status: 'Not Applied' },                 // does NOT count
  ];
  const m = metricsOf(rows);
  assert.strictEqual(m.applied, 4);
  assert.strictEqual(m.notApplied, 2);         // both Not Applied rows
  assert.strictEqual(m.rejected, 1);
});

ok('funnel + recruiter rank counts', () => {
  const a = computeAnalytics([
    { status: 'Applied' }, { status: 'Recruiter Screen' }, { status: 'Panel' }, { status: 'Offer' },
  ]);
  assert.strictEqual(a.metrics.recruiter, 3); // rank>=2: Recruiter Screen, Panel, Offer
  assert.strictEqual(a.metrics.offer, 1);
  assert.deepStrictEqual(a.funnel.map((f) => f.count), [1, 1, 0, 1, 1]);
});

ok('distributions + tiers + source quality + health present', () => {
  const a = computeAnalytics([
    { status: 'Not Applied', tier: 'A', conf: 'verified', sector: 'CDP / Customer Data', remote: 'remote', source: 'greenhouse', fit: 9, prob: 8, company: 'Acme', role: 'PM' },
    { status: 'Applied', tier: 'B', sector: 'AI Platform', remote: 'onsite', source: 'linkedin', applied: '2026-06-10', company: 'Beta', role: 'PM' },
  ]);
  assert.ok(a.distributions.sector.length >= 1);
  assert.strictEqual(a.tiers.A, 1);
  assert.ok(Array.isArray(a.sourceQuality) && a.sourceQuality.length >= 1);
  assert.ok(a.health && a.health.band);
});

console.log('\nPASS — ' + passed + ' analytics checks');
