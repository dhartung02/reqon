const test = require('node:test');
const assert = require('node:assert');
const {
  popupHeadingForRow,
  isBestBetRow,
  buildAiUsageViewModel,
  buildBannerModel,
  summarizeFillAvailability,
  buildTodayBuckets,
} = require('../ui-lib.js');

test('popupHeadingForRow reflects whether the current page is already tracked', () => {
  assert.strictEqual(popupHeadingForRow(null), 'Clip this job');
  assert.strictEqual(popupHeadingForRow({ company: 'Reddit', role: 'PM' }), 'Tracked on your board');
});

test('isBestBetRow keeps only verified, not-applied, still-open roles', () => {
  assert.strictEqual(isBestBetRow({ status: 'Not Applied', conf: 'verified', reqCheck: 'open', tier: 'A' }), true);
  assert.strictEqual(isBestBetRow({ status: 'Not Applied', conf: 'boardonly', reqCheck: 'open', tier: 'A' }), false);
  assert.strictEqual(isBestBetRow({ status: 'Not Applied', conf: 'verified', reqCheck: 'closed', tier: 'A' }), false);
  assert.strictEqual(isBestBetRow({ status: 'Applied', conf: 'verified', reqCheck: 'open', tier: 'A' }), false);
});

test('buildAiUsageViewModel removes warning language for unlimited plans', () => {
  const unlimited = buildAiUsageViewModel({
    today: { calls: 25, cap: 0 },
    plan: { tier: 'owner', owner: true, ai: true },
    tierLabel: 'Owner',
  });
  assert.strictEqual(unlimited.unlimited, true);
  assert.strictEqual(unlimited.countText, '25 used today');
  assert.match(unlimited.helperText, /Unlimited on your Owner plan/);

  const capped = buildAiUsageViewModel({
    today: { calls: 7, cap: 25 },
    plan: { tier: 'cloud', owner: false, ai: false },
    tierLabel: 'Cloud',
  });
  assert.strictEqual(capped.unlimited, false);
  assert.strictEqual(capped.countText, '7 / 25');
  assert.match(capped.helperText, /Each AI draft, score, autofill, or match counts as one request/);
});

test('buildBannerModel prioritizes tracked role summary for tracked pages', () => {
  const model = buildBannerModel({
    row: { company: 'Reddit', role: 'Senior Group Product Manager', status: 'Applied', fit: 6 },
    pageState: { recognized: true, fillable: true },
  });

  assert.strictEqual(model.mode, 'tracked');
  assert.strictEqual(model.primaryCta, 'Continue application');
  assert.match(model.summaryText, /Tracked/);
  assert.match(model.summaryText, /Applied/);
});

test('buildBannerModel switches tracked manual pages to review status CTA', () => {
  const model = buildBannerModel({
    row: { company: 'Reddit', role: 'Senior Group Product Manager', status: 'Applied', fit: 6 },
    pageState: { recognized: true, fillable: false },
  });

  assert.strictEqual(model.mode, 'tracked');
  assert.strictEqual(model.primaryCta, 'Review status');
});

test('buildBannerModel uses review CTA for untracked manual pages', () => {
  const model = buildBannerModel({
    row: null,
    pageState: { recognized: true, fillable: false, fit: 7 },
  });

  assert.strictEqual(model.mode, 'untracked');
  assert.strictEqual(model.primaryCta, 'Review job');
});

test('summarizeFillAvailability explains deterministic and AI assisted counts', () => {
  assert.strictEqual(
    summarizeFillAvailability({ total: 18, direct: 8, ai: 3, remaining: 7 }),
    'Filled 11 of 18 fields: 8 direct, 3 AI-assisted, 7 still need review.'
  );
});

test('buildTodayBuckets leads with ready-to-apply roles and keeps follow-up separate', () => {
  const rows = [
    { company: 'Reddit', role: 'Senior PM', status: 'Not Applied', tier: 'A', conf: 'verified', reqCheck: 'open' },
    { company: 'Yahoo', role: 'Director', status: 'Applied', followup: '2026-07-01', tier: 'A', conf: 'verified' },
  ];

  const buckets = buildTodayBuckets(rows);
  assert.strictEqual(buckets.defaultSection.id, 'ready-to-apply');
  assert.strictEqual(buckets.readyToApply.length, 1);
  assert.strictEqual(buckets.needsFollowUp.length, 1);
});

test('buildTodayBuckets orders ready-to-apply roles ahead of lower-priority entries', () => {
  const rows = [
    { company: 'Bravo', role: 'Principal PM', status: 'Not Applied', tier: 'B', conf: 'verified', reqCheck: 'open', fit: 8, prob: 7 },
    { company: 'Atlas', role: 'Group PM', status: 'Not Applied', tier: 'A', conf: 'verified', reqCheck: 'open', fit: 9, prob: 8 },
    { company: 'Coast', role: 'Director', status: 'Applied', followup: '2026-07-01', tier: 'A', conf: 'verified', fit: 7, prob: 6 },
  ];

  const buckets = buildTodayBuckets(rows);
  assert.deepStrictEqual(
    buckets.readyToApply.map((row) => row.company),
    ['Atlas', 'Bravo']
  );
  assert.deepStrictEqual(
    buckets.inProgress.map((row) => row.company),
    ['Coast']
  );
  assert.deepStrictEqual(
    buckets.needsFollowUp.map((row) => row.company),
    ['Coast']
  );
});

test('buildTodayBuckets excludes closed roles from needsFollowUp even with lingering dates', () => {
  const rows = [
    { company: 'OpenCo', role: 'Principal PM', status: 'Applied', followup: '2026-07-02', tier: 'A', conf: 'verified' },
    { company: 'ClosedCo', role: 'Director', status: 'Rejected', followup: '2026-07-01', tier: 'A', conf: 'verified' },
  ];

  const buckets = buildTodayBuckets(rows);
  assert.deepStrictEqual(
    buckets.needsFollowUp.map((row) => row.company),
    ['OpenCo']
  );
});
