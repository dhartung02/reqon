const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deriveBannerState,
  buildQuestionGroupsSnapshot,
  summarizeBannerFillResult,
  resolveBannerActionKind,
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

test('deriveBannerState uses review status CTA for tracked manual-heavy pages', () => {
  const state = deriveBannerState({
    row: { company: 'Reddit', role: 'Senior Group Product Manager', status: 'Applied', fit: 6 },
    job: { role: 'Senior Group Product Manager' },
    fill: { level: 'Manual-heavy' },
  });

  assert.equal(state.fillable, false);
  assert.equal(state.model.mode, 'tracked');
  assert.equal(state.model.primaryCta, 'Review status');
});

test('resolveBannerActionKind does not map review status CTAs to autofill', () => {
  assert.equal(resolveBannerActionKind({ mode: 'tracked', primaryCta: 'Continue application', fillable: true }), 'fill');
  assert.equal(resolveBannerActionKind({ mode: 'tracked', primaryCta: 'Review status', fillable: false }), 'board');
});

test('summarizeBannerFillResult combines direct, AI, and remaining counts for the banner message', () => {
  assert.equal(
    summarizeBannerFillResult({ factual: 5, answered: 2, resume: 1, ai: 3, remaining: 4 }),
    'Filled 11 fields: 8 direct, 3 AI-assisted, 4 still need review.'
  );
});

test('summarizeBannerFillResult avoids inventing a remaining count when totals are unknown', () => {
  assert.equal(
    summarizeBannerFillResult({ factual: 5, answered: 2, resume: 1, ai: 3 }),
    'Filled 11 fields so far: 8 direct, 3 AI-assisted.'
  );
});

test('buildQuestionGroupsSnapshot returns grouped counts and preserves remaining items', () => {
  const snapshot = buildQuestionGroupsSnapshot([
    { id: 'q1', label: 'First Name', kind: 'text', filled: true },
    { id: 'q2', label: 'How did you hear about this job?', kind: 'text', filled: false },
    { id: 'q3', label: 'Please describe your current company', kind: 'textarea', filled: false },
    { id: 'q4', label: 'Are you authorized to work in the U.S.?', kind: 'select-one', filled: true },
  ]);

  assert.equal(snapshot.total, 4);
  assert.equal(snapshot.remaining, 2);
  assert.equal(snapshot.groups.common.count, 3);
  assert.equal(snapshot.groups.common.remaining, 1);
  assert.equal(snapshot.groups['open-ended'].count, 1);
  assert.equal(snapshot.groups['open-ended'].remaining, 1);
  assert.deepEqual(
    snapshot.groups.common.items.map((item) => item.id),
    ['q1', 'q2', 'q4']
  );
});
