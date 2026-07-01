const test = require('node:test');
const assert = require('node:assert/strict');

global.detectATS = (url) => (/greenhouse\.io/i.test(String(url || ''))
  ? { applyMode: 'Standard ATS', source: 'greenhouse' }
  : { applyMode: 'Unknown', source: '' });

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

test('deriveAssistantMode returns job when the page is recognized but not tracked', () => {
  const mode = deriveAssistantMode({
    activeTab: { url: 'https://job-boards.greenhouse.io/reddit/jobs/7858506' },
    pageContext: { recognized: true, row: null, url: 'https://job-boards.greenhouse.io/reddit/jobs/7858506' },
  });

  assert.equal(mode.mode, 'job');
});

test('deriveAssistantMode ignores stale pageContext for another url and falls back to the active tab', () => {
  const mode = deriveAssistantMode({
    activeTab: { url: 'https://job-boards.greenhouse.io/reddit/jobs/7858506' },
    pageContext: {
      recognized: true,
      row: { company: 'Elsewhere', role: 'Old Role', status: 'Applied' },
      url: 'https://job-boards.greenhouse.io/other-company/jobs/1111111',
    },
  });

  assert.deepStrictEqual(mode, { mode: 'job', row: null, recognized: true });
});

test('buildTrackedRoleCards orders tracked summary before continue and review', () => {
  const cards = buildTrackedRoleCards({ status: 'Applied', fit: 6 });

  assert.deepStrictEqual(cards.map((card) => card.id), [
    'tracked-summary',
    'continue-application',
    'review-update',
  ]);
});
