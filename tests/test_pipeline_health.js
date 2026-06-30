// Unit tests for the pipeline health score (lib/pipeline-health.js, ROADMAP P2.6). Pure.
// Run: node tests/test_pipeline_health.js
const assert = require('node:assert');
const { computePipelineHealth } = require('../lib/pipeline-health');
const today = '2026-06-24';
let passed = 0;
const ok = (n, fn) => { fn(); console.log('  ✓ ' + n); passed++; };

ok('healthy pipeline scores Good with apply-next recommendation', () => {
  const rows = [];
  for (let i = 0; i < 5; i++) rows.push({ company: 'C' + i, role: 'PM', status: 'Not Applied', tier: 'A', conf: 'verified', fit: 9, prob: 8 });
  rows.push({ company: 'X', role: 'PM', status: 'Applied', applied: '2026-06-22' });
  const h = computePipelineHealth(rows, { today });
  assert.strictEqual(h.band, 'Good');
  assert.ok(h.metrics.applyReady >= 5 && h.metrics.appliedLast7 === 1);
  assert.ok(h.recommendations.some(r => r.action === 'apply_next'));
});

ok('empty/stale pipeline is At risk and recommends scout', () => {
  const h = computePipelineHealth([], { today });
  assert.strictEqual(h.band, 'At risk');
  assert.ok(/No apply-ready/i.test(h.mainRisk) || /No applications/i.test(h.mainRisk));
  assert.ok(h.recommendations.some(r => r.action === 'run_scout'));
});

ok('overdue follow-ups + aging apps surface as risks', () => {
  const rows = [
    { company: 'A', role: 'PM', status: 'Applied', applied: '2026-05-01', followup: '2026-06-20' },
    { company: 'B', role: 'PM', status: 'Not Applied', tier: 'A', conf: 'verified', fit: 9, prob: 8 },
    { company: 'C', role: 'PM', status: 'Not Applied', tier: 'A', conf: 'verified', fit: 8, prob: 8 },
    { company: 'D', role: 'PM', status: 'Not Applied', tier: 'B', conf: 'verified', fit: 8, prob: 7 },
  ];
  const h = computePipelineHealth(rows, { today });
  assert.ok(h.metrics.followupsOverdue === 1);
  assert.ok(h.metrics.agingApps === 1);
  assert.ok(h.recommendations.some(r => r.action === 'follow_up_due'));
});

ok('response + rejection rates computed from applied total', () => {
  const rows = [
    { company: 'A', role: 'PM', status: 'Panel', applied: '2026-06-10' },
    { company: 'B', role: 'PM', status: 'Rejected', applied: '2026-06-05' },
    { company: 'C', role: 'PM', status: 'Applied', applied: '2026-06-20' },
  ];
  const h = computePipelineHealth(rows, { today });
  assert.strictEqual(h.metrics.appliedTotal, 3);
  assert.strictEqual(h.metrics.responseRate, 33);   // 1 interviewing / 3
  assert.strictEqual(h.metrics.rejectionRate, 33);  // 1 rejected / 3
});

console.log('\nPASS — ' + passed + ' pipeline-health checks');
