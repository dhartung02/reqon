const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deriveBannerState,
  summarizeBannerFillResult,
} = require('../content.js');

test('deriveBannerState keeps tracked rows in tracked mode with continue CTA on fillable pages', () => {
  const state = deriveBannerState({
    row: { company: 'Reddit', role: 'Senior Group Product Manager', status: 'Applied', fit: 6 },
    job: { role: 'Senior Group Product Manager' },
    fill: { level: 'Likely fillable' },
  });

  assert.equal(state.recognized, true);
  assert.equal(state.fillable, true);
  assert.equal(state.model.mode, 'tracked');
  assert.equal(state.model.primaryCta, 'Continue application');
});

test('deriveBannerState falls back to untracked review CTA when the page is not fillable', () => {
  const state = deriveBannerState({
    row: null,
    job: { role: 'Principal Product Manager' },
    fill: { level: 'Manual-heavy' },
    fit: 7,
  });

  assert.equal(state.recognized, true);
  assert.equal(state.fillable, false);
  assert.equal(state.model.mode, 'untracked');
  assert.equal(state.model.primaryCta, 'Review job');
});

test('summarizeBannerFillResult combines direct, AI, and remaining counts for the banner message', () => {
  assert.equal(
    summarizeBannerFillResult({ factual: 5, answered: 2, resume: 1, ai: 3, remaining: 4 }),
    'Filled 11 fields: 8 direct, 3 AI-assisted, 4 still need review.'
  );
});
