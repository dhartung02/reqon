// Tests for the extension's shared pure logic (lib.js). Run: node --test extension/tests/
// Mirrors the semantics the server + board rely on (postingId / reqKey / matchRow / answer match).
const test = require('node:test');
const assert = require('node:assert');
const { postingId, reqKey, sameReq, matchRow, bestAnswerMatch } = require('../lib.js');

test('postingId extracts ids across ATS url shapes', () => {
  assert.strictEqual(postingId('https://boards.greenhouse.io/acme/jobs/4567890?gh_jid=4567890'), '4567890');
  assert.strictEqual(postingId('https://boards.greenhouse.io/acme/jobs/4567890'), '4567890');
  assert.strictEqual(postingId('https://jobs.ashbyhq.com/acme/listing/9988776'), '9988776');
  // Lever (and Ashby) use UUIDs — caught by the generic uuid matcher.
  const uuid = 'https://jobs.lever.co/acme/a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  assert.strictEqual(postingId(uuid), 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  assert.strictEqual(postingId(''), '');
});

test('reqKey is company|role lowercased + trimmed', () => {
  assert.strictEqual(reqKey({ company: 'Acme', role: 'Principal PM' }), 'acme|principal pm');
  assert.strictEqual(reqKey({ company: 'BetaCorp', role: 'Director, Data' }), 'betacorp|director, data');
});

test('sameReq matches same company+role unless posting ids conflict', () => {
  const a = { company: 'Acme', role: 'PM', link: 'https://x/jobs/111?gh_jid=111' };
  const b = { company: 'Acme', role: 'PM', link: 'https://x/jobs/111' };
  const c = { company: 'Acme', role: 'PM', link: 'https://x/jobs/222?gh_jid=222' };
  assert.strictEqual(sameReq(a, b), true);   // same key, one id present
  assert.strictEqual(sameReq(a, c), false);  // same key but conflicting posting ids
});

test('matchRow finds by posting id, then by url, skipping deleted', () => {
  const rows = [
    { company: 'Acme', role: 'PM', link: 'https://boards.greenhouse.io/acme/jobs/555?gh_jid=555' },
    { company: 'Beta', role: 'Eng', link: 'https://jobs.lever.co/beta/777', deleted: true },
  ];
  const hit = matchRow(rows, 'https://boards.greenhouse.io/acme/jobs/555?utm=x&gh_jid=555');
  assert.strictEqual(hit && hit.company, 'Acme');
  assert.strictEqual(matchRow(rows, 'https://jobs.lever.co/beta/777'), null);   // deleted is skipped
  assert.strictEqual(matchRow(rows, 'https://unknown/job/1'), null);
});

test('bestAnswerMatch needs >= 2 shared meaningful tokens', () => {
  const answers = [
    { q: 'Why do you want to work here?', a: 'because reasons', tags: ['motivation'] },
    { q: 'Describe your data platform experience', a: 'pipelines and snowflake', tags: ['data', 'platform'] },
  ];
  const m = bestAnswerMatch('Tell us about your data platform experience', answers);
  assert.ok(m && /pipelines/.test(m.a));
  assert.strictEqual(bestAnswerMatch('favorite color', answers), null);   // no confident match
});
