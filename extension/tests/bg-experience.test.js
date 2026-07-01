const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildExperienceCache,
  shouldBroadcastPageContext,
  normalizeUpdateCheckResult,
} = require('../bg-experience.js');

test('buildExperienceCache reuses fresh config payloads for 60 seconds', () => {
  let now = 1_720_000_000_000;
  const cache = buildExperienceCache({ ttlMs: 60_000, now: () => now });
  const payload = { version: '2026-07-01', sections: ['today', 'job'] };

  cache.set(payload);

  assert.deepStrictEqual(cache.get(), payload);
  assert.equal(cache.isFresh(), true);

  now += 59_999;
  assert.equal(cache.isFresh(), true);

  now += 2;
  assert.equal(cache.isFresh(), false);
});

test('normalizeUpdateCheckResult surfaces human-safe update states', () => {
  assert.deepStrictEqual(normalizeUpdateCheckResult('update_available'), {
    ok: true,
    status: 'update_available',
    message: 'Reqon update available. Chrome will install it when the extension is idle.',
  });
  assert.deepStrictEqual(normalizeUpdateCheckResult('no_update'), {
    ok: true,
    status: 'no_update',
    message: 'Reqon is already up to date.',
  });
  assert.deepStrictEqual(normalizeUpdateCheckResult('throttled'), {
    ok: false,
    status: 'throttled',
    message: 'Chrome throttled the update check. Try again in a little while.',
  });
});

test('shouldBroadcastPageContext only emits when the active job context meaningfully changes', () => {
  const prev = { mode: 'today', pageKey: '' };
  const next = { mode: 'job', pageKey: 'reddit|senior-group-product-manager' };

  assert.equal(shouldBroadcastPageContext(prev, next), true);
  assert.equal(shouldBroadcastPageContext(next, next), false);
  assert.equal(shouldBroadcastPageContext(next, { mode: 'job', pageKey: 'reddit|senior-group-product-manager' }), false);
  assert.equal(shouldBroadcastPageContext(next, { mode: 'tracked-job', pageKey: 'reddit|senior-group-product-manager' }), true);
});
