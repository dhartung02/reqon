// Unit tests for the shared entitlements model (core/entitlements.js). Pure, no deps.
// Run: node tests/test_entitlements.js
const assert = require('node:assert');
const ent = require('../core/entitlements');
const core = require('../core/crm-core'); // proves the @reqon/core re-export stays wired
let passed = 0;
const ok = (n, fn) => { fn(); console.log('  ✓ ' + n); passed++; };

ok('catalog tags every feature with a known package', () => {
  for (const [k, pkg] of Object.entries(ent.FEATURES)) {
    assert.ok(ent.PACKAGES.includes(pkg), `${k} → ${pkg} not a valid package`);
  }
});

ok('parseLicense handles separators and aliases', () => {
  assert.deepStrictEqual(ent.parseLicense('cloud,ai'), { owner: false, pro: false, cloud: true, ai: true });
  assert.deepStrictEqual(ent.parseLicense('cloud+ai'), { owner: false, pro: false, cloud: true, ai: true });
  assert.deepStrictEqual(ent.parseLicense(' PRO '), { owner: false, pro: true, cloud: false, ai: false });
  assert.deepStrictEqual(ent.parseLicense('all'), { owner: false, pro: false, cloud: true, ai: true });
  assert.deepStrictEqual(ent.parseLicense(''), { owner: false, pro: false, cloud: false, ai: false });
});

ok('owner gets everything', () => {
  const p = ent.resolvePlan({ isOwner: true });
  assert.strictEqual(p.tier, 'owner');
  for (const k of Object.keys(ent.FEATURES)) assert.ok(ent.hasFeature(p, k), `owner missing ${k}`);
});

ok('self-hosted single-user is implicitly Local Pro (full)', () => {
  const p = ent.resolvePlan({ selfHostSingleUser: true });
  assert.strictEqual(p.tier, 'pro');
  assert.ok(p.cloud && p.ai);
  assert.ok(ent.hasFeature(p, 'ai_draft') && ent.hasFeature(p, 'scout'));
});

ok('free plan: core yes, cloud/ai no', () => {
  const p = ent.resolvePlan({ license: 'free' });
  assert.strictEqual(p.tier, 'free');
  assert.ok(ent.hasFeature(p, 'role_add'));
  assert.ok(ent.hasFeature(p, 'analytics'));
  assert.ok(!ent.hasFeature(p, 'ai_draft'));
  assert.ok(!ent.hasFeature(p, 'cloud_sync'));
  assert.ok(!ent.hasFeature(p, 'scout'));
});

ok('AI package is a superset of Cloud (Reqon AI = Cloud + AI)', () => {
  const p = ent.resolvePlan({ license: 'ai' });
  assert.strictEqual(p.tier, 'cloud+ai');
  assert.ok(ent.hasFeature(p, 'ai_draft') && ent.hasFeature(p, 'guide_generate'));
  // AI implies Cloud — there is no AI-without-sync SKU
  assert.ok(ent.hasFeature(p, 'cloud_sync') && ent.hasFeature(p, 'scout'));
  assert.deepStrictEqual(p.packages, ['free', 'cloud', 'ai']);
});

ok('Cloud package unlocks only cloud features', () => {
  const p = ent.resolvePlan({ license: 'cloud' });
  assert.ok(ent.hasFeature(p, 'cloud_sync') && ent.hasFeature(p, 'digest_delivery'));
  assert.ok(!ent.hasFeature(p, 'ai_draft'));
});

ok('cloud+ai composite tier', () => {
  const p = ent.resolvePlan({ license: 'cloud,ai' });
  assert.strictEqual(p.tier, 'cloud+ai');
  assert.deepStrictEqual(p.packages, ['free', 'cloud', 'ai']);
});

ok('unknown feature keys fail-open (forward-compatible clients)', () => {
  assert.ok(ent.hasFeature(ent.resolvePlan({ license: 'free' }), 'some_future_feature'));
  assert.strictEqual(ent.requiredPackage('some_future_feature'), null);
});

ok('featureMap covers exactly the catalog', () => {
  const m = ent.featureMap(ent.resolvePlan({ license: 'free' }));
  assert.deepStrictEqual(Object.keys(m).sort(), Object.keys(ent.FEATURES).sort());
});

ok('tierLabel renders human strings', () => {
  assert.strictEqual(ent.tierLabel('cloud+ai'), 'Cloud + AI');
  assert.strictEqual(ent.tierLabel('pro'), 'Local Pro');
  assert.strictEqual(ent.tierLabel('free'), 'Free');
});

ok('@reqon/core re-exports the entitlements API', () => {
  assert.strictEqual(typeof core.resolvePlan, 'function');
  assert.strictEqual(typeof core.hasFeature, 'function');
  assert.strictEqual(core.FEATURES, ent.FEATURES);
});

console.log(`\nentitlements: ${passed} passed`);
