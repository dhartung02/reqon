const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveAssistantMode, buildTrackedRoleCards } = require('../sidepanel-mode.js');

test('deriveAssistantMode returns today when no job page is active', () => {
  assert.equal(deriveAssistantMode({
    activeTab: { url: 'https://www.google.com/' },
    pageContext: null,
  }).mode, 'today');
});

test('deriveAssistantMode returns tracked-job when a matched row is present', () => {
  const mode = deriveAssistantMode({
    activeTab: { url: 'https://job-boards.greenhouse.io/reddit/jobs/7858506' },
    pageContext: {
      recognized: true,
      row: { company: 'Reddit', role: 'Senior Group Product Manager', status: 'Applied' },
    },
  });

  assert.equal(mode.mode, 'tracked-job');
});

test('buildTrackedRoleCards orders tracked summary before continue and review', () => {
  const cards = buildTrackedRoleCards({ status: 'Applied', fit: 6 });

  assert.deepStrictEqual(cards.map((card) => card.id), [
    'tracked-summary',
    'continue-application',
    'review-update',
  ]);
});
