const test = require('node:test');
const assert = require('node:assert');
const {
  popupHeadingForRow,
  isBestBetRow,
  buildAiUsageViewModel,
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
