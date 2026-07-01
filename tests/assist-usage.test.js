const test = require('node:test');
const assert = require('node:assert');
const { effectiveAssistDailyCap } = require('../lib/assist-usage.js');

test('effectiveAssistDailyCap is unlimited for owner, local pro, and AI plans', () => {
  assert.strictEqual(effectiveAssistDailyCap({ owner: true }, 25), 0);
  assert.strictEqual(effectiveAssistDailyCap({ pro: true }, 25), 0);
  assert.strictEqual(effectiveAssistDailyCap({ ai: true }, 25), 0);
});

test('effectiveAssistDailyCap preserves configured caps for non-AI plans', () => {
  assert.strictEqual(effectiveAssistDailyCap({ tier: 'cloud', ai: false }, 25), 25);
  assert.strictEqual(effectiveAssistDailyCap({ tier: 'free', ai: false }, 0), 0);
});
