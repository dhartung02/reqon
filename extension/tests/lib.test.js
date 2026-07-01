// Tests for the extension's shared pure logic (lib.js). Run: node --test extension/tests/
// Mirrors the semantics the server + board rely on (postingId / reqKey / matchRow / answer match).
const test = require('node:test');
const assert = require('node:assert');
const {
  postingId,
  reqKey,
  sameReq,
  matchRow,
  bestAnswerMatch,
  detectATS,
  detectRemote,
  extractSalary,
  fillabilityHint,
  captureConfidence,
  shouldSkipAiField,
  isRetryableActionError,
} = require('../lib.js');

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

test('detectATS maps hosts to source + apply mode', () => {
  assert.deepStrictEqual(detectATS('https://boards.greenhouse.io/acme/jobs/1'), { source: 'greenhouse', applyMode: 'Standard ATS' });
  assert.deepStrictEqual(detectATS('https://jobs.ashbyhq.com/acme/listing/1'), { source: 'ashby', applyMode: 'Standard ATS' });
  assert.strictEqual(detectATS('https://acme.wd5.myworkdayjobs.com/x').applyMode, 'External');
  assert.strictEqual(detectATS('https://www.linkedin.com/jobs/view/1').applyMode, 'Easy Apply');
  assert.deepStrictEqual(detectATS('https://careers.acme.com/x'), { source: '', applyMode: 'Unknown' });
});

test('detectRemote reads remote/hybrid/onsite from JD text', () => {
  assert.strictEqual(detectRemote('This is a fully remote position.'), 'remote');
  assert.strictEqual(detectRemote('Hybrid: 3 days in office.'), 'hybrid');
  assert.strictEqual(detectRemote('Must work on-site in our NYC office.'), 'onsite');
  assert.strictEqual(detectRemote('We make great software.'), '');
});

test('extractSalary finds plausible pay, ignores noise', () => {
  assert.strictEqual(extractSalary('Base salary $120,000 - $160,000 per year'), '$120,000–$160,000');
  assert.strictEqual(extractSalary('Range: $180k–$240k'), '$180k–$240k');
  assert.strictEqual(extractSalary('Compensation: $200,000 annually'), '$200,000');
  assert.strictEqual(extractSalary('5+ years experience, 10% bonus'), '');   // no real salary
});

test('fillabilityHint classifies by ATS + form shape', () => {
  assert.strictEqual(fillabilityHint('External', {}).level, 'External redirect');
  assert.strictEqual(fillabilityHint('Easy Apply', {}).level, 'Easy Apply');
  assert.strictEqual(fillabilityHint('Standard ATS', { inputs: 6, textareas: 1, fillableNow: 5 }).level, 'Likely fillable');
  assert.strictEqual(fillabilityHint('Standard ATS', { inputs: 8, textareas: 0, hasPassword: true }).level, 'Manual-heavy');
  assert.strictEqual(fillabilityHint('Standard ATS', { inputs: 2, textareas: 4, fillableNow: 2 }).level, 'Partially fillable');
  assert.strictEqual(fillabilityHint('Unknown', { inputs: 0, textareas: 0 }).level, 'Unknown');
});

test('captureConfidence bands + flags gaps', () => {
  const hi = captureConfidence({ company: 'Acme', role: 'Principal PM', remote: 'remote', salary: '$200k', source: 'greenhouse', seniority: 'Principal' });
  assert.strictEqual(hi.level, 'High');
  assert.ok(hi.detected.includes('company') && hi.detected.includes('remote'));
  const lo = captureConfidence({ company: 'Unknown', role: 'Untitled lead' });
  assert.strictEqual(lo.level, 'Low');
  assert.ok(lo.needsReview.some(r => /role/.test(r)));
});

test('shouldSkipAiField only blocks unsafe input types', () => {
  assert.strictEqual(shouldSkipAiField('Create a password', 'password'), true);
  assert.strictEqual(shouldSkipAiField('Upload your resume', 'file'), true);
  assert.strictEqual(shouldSkipAiField('Do you now or will you in the future require sponsorship?', 'text'), false);
  assert.strictEqual(shouldSkipAiField('I agree to the privacy policy and consent to processing', 'text'), false);
  assert.strictEqual(shouldSkipAiField('LinkedIn profile URL', 'url'), false);
  assert.strictEqual(shouldSkipAiField('Why are you interested in this role?', 'textarea'), false);
});

test('isRetryableActionError only retries transient failures', () => {
  assert.strictEqual(isRetryableActionError(new Error('Network error reaching CRM (fetch failed)')), true);
  assert.strictEqual(isRetryableActionError(new Error('HTTP 500')), true);
  assert.strictEqual(isRetryableActionError(Object.assign(new Error('Requires the AI package'), { upgrade: { error: 'upgrade_required' } })), false);
  assert.strictEqual(isRetryableActionError(new Error('HTTP 401')), false);
  assert.strictEqual(isRetryableActionError(new Error('HTTP 422')), false);
});
