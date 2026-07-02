/**
 * Shared pure logic for the Chrome extension — kept semantically IDENTICAL to server.js
 * (postingId / reqKey / sameReq). Verified against the same fixtures in tests/vectors/
 * via tests/run-extension-vectors.js. If you change these, change server.js too.
 */
function postingId(u) {
  if (!u) return '';
  const s = String(u);
  let m = s.match(/[?&]gh_jid=(\d+)/i) || s.match(/\/listing\/(\d+)/i) || s.match(/\/jobs?\/(\d{4,})/i) || s.match(/[?&](?:jobid|requisitionid|reqid)=([\w-]+)/i);
  if (m) return m[1].toLowerCase();
  m = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0].toLowerCase() : '';
}
const reqKey = x => (String(x.company || '') + '|' + String(x.role || '')).toLowerCase().trim();
function sameReq(a, b) {
  if (reqKey(a) !== reqKey(b)) return false;
  const ia = postingId(a.link || a.url), ib = postingId(b.link || b.url);
  return !(ia && ib && ia !== ib);
}
// Match a tracked row to the page the user is on: posting-id first (robust across URL
// variants of the same req), exact URL second.
function matchRow(rows, pageUrl) {
  const pid = postingId(pageUrl);
  if (pid) {
    const hit = rows.find(r => r.deleted !== true && postingId(r.link) === pid);
    if (hit) return hit;
  }
  const norm = u => String(u || '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
  const target = norm(pageUrl);
  return rows.find(r => r.deleted !== true && norm(r.link) === target) || null;
}

// Keyword-match a form question to a saved answer (apply-assist). Mirrors app/src/answers.ts —
// conservative: needs >=2 shared meaningful tokens before claiming a match, so it leaves a field
// blank rather than pasting the wrong answer.
const _STOP = new Set(
  'the a an to of for in on at and or your you our we us is are be do does did what why how when where which who please describe tell about this that these those role position company companies team teams with as it its their have has will would can could should i my me'.split(' '));
const _tokenize = s => (String(s || '').toLowerCase().match(/[a-z0-9+#]+/g) || []).filter(w => w.length > 2 && !_STOP.has(w));
function bestAnswerMatch(question, answers) {
  const q = new Set(_tokenize(question));
  if (!q.size) return null;
  let best = null, bestScore = 0;
  for (const a of (answers || [])) {
    const at = new Set([..._tokenize(a.q), ...((a.tags || []).flatMap(_tokenize))]);
    let score = 0;
    at.forEach(w => { if (q.has(w)) score++; });
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return bestScore >= 2 ? best : null;
}

// ---- clip-capture extraction (P1.10/P1.11) — pure, DOM-free so they're unit-testable ----
// All take already-extracted strings (URL, JD text, simple form stats) and return structured hints.

// Map a posting URL to its ATS source + a coarse apply mode. Mirrors the board's apply-mode vocab.
// applyMode ∈ Easy Apply | Standard ATS | External | Unknown ; source is the lowercase ATS slug.
const ATS_HOSTS = [
  { re: /(^|\.)greenhouse\.io/i, source: 'greenhouse', mode: 'Standard ATS' },
  { re: /(^|\.)ashbyhq\.com/i, source: 'ashby', mode: 'Standard ATS' },
  { re: /(^|\.)lever\.co/i, source: 'lever', mode: 'Standard ATS' },
  { re: /(^|\.)workable\.com/i, source: 'workable', mode: 'Standard ATS' },
  { re: /(^|\.)smartrecruiters\.com/i, source: 'smartrecruiters', mode: 'Standard ATS' },
  { re: /(^|\.)recruitee\.com/i, source: 'recruitee', mode: 'Standard ATS' },
  { re: /(^|\.)teamtailor\.com/i, source: 'teamtailor', mode: 'Standard ATS' },
  { re: /(^|\.)personio\.(de|com)/i, source: 'personio', mode: 'Standard ATS' },
  { re: /(^|\.)myworkdayjobs\.com/i, source: 'workday', mode: 'External' },
  { re: /(^|\.)icims\.com/i, source: 'icims', mode: 'External' },
  { re: /(^|\.)taleo\.net/i, source: 'taleo', mode: 'External' },
  { re: /(^|\.)successfactors\.com/i, source: 'successfactors', mode: 'External' },
  { re: /(^|\.)linkedin\.com/i, source: 'linkedin', mode: 'Easy Apply' },
  { re: /(^|\.)indeed\.com/i, source: 'indeed', mode: 'Easy Apply' },
];
function detectATS(url) {
  let host = '';
  try { host = new URL(String(url || '')).hostname; } catch (e) { host = String(url || ''); }
  for (const h of ATS_HOSTS) { if (h.re.test(host)) return { source: h.source, applyMode: h.mode }; }
  return { source: '', applyMode: 'Unknown' };
}

// Remote / hybrid / onsite from JD text. Conservative: returns '' when nothing is stated.
function detectRemote(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return '';
  if (/\bhybrid\b/.test(t)) return 'hybrid';
  if (/\b(fully remote|100% remote|remote[- ]first|work from home|wfh|remote, |remote\b)/.test(t)) {
    if (/\bon[- ]?site\b|\bin[- ]?office\b|\brelocat/.test(t) && !/\bfully remote|100% remote\b/.test(t)) return 'hybrid';
    return 'remote';
  }
  if (/\bon[- ]?site\b|\bin[- ]?office\b|\bin person\b/.test(t)) return 'onsite';
  return '';
}

// First plausible salary / range from JD text → a tidy display string, else ''. Handles $120k,
// $120,000, $120k–$160k, "120,000 - 160,000 per year". Ignores tiny numbers (equity %, years).
function extractSalary(text) {
  const t = String(text || '');
  if (!t) return '';
  const num = '\\$?\\d{2,3}(?:,\\d{3})?(?:\\.\\d+)?\\s*[kK]?';
  const range = new RegExp(num + '\\s*(?:[-–—]|to)\\s*' + num, '');
  let m = t.match(range);
  if (!m) {
    const single = new RegExp('\\$\\s*\\d{2,3}(?:,\\d{3})(?:\\.\\d+)?(?:\\s*(?:per year|/year|/yr|annually|a year))?', 'i');
    m = t.match(single);
    if (!m) { const k = t.match(new RegExp('\\$\\s*\\d{2,3}\\s*[kK]\\b')); if (k) m = k; }
  }
  if (!m) return '';
  const looksMoney = /\$|[kK]\b|,\d{3}/.test(m[0]);
  if (!looksMoney) return '';
  return m[0].replace(/\s*(?:per year|\/year|\/yr|annually|a year)\s*$/i, '')
    .replace(/\s+/g, ' ').replace(/\s*([-–—])\s*/, '–').trim();
}

// Estimate how fillable a posting's form is, from the ATS + simple DOM counts. Pure: caller passes
// {inputs, textareas, hasFile, hasPassword, fillableNow} (counts), we classify + explain.
// level ∈ Easy Apply | Likely fillable | Partially fillable | Manual-heavy | External redirect | Unknown
function fillabilityHint(applyMode, stats) {
  const s = stats || {};
  const reasons = [];
  if (applyMode === 'External') return { level: 'External redirect', reasons: ['Applies on an external portal (Workday/iCIMS/etc.) — likely account-gated.'] };
  if (applyMode === 'Easy Apply') return { level: 'Easy Apply', reasons: ['Platform Easy Apply — quick, but autofill is limited inside it.'] };
  const inputs = +s.inputs || 0, textareas = +s.textareas || 0;
  if (!inputs && !textareas) return { level: 'Unknown', reasons: ['No application form detected on this page yet.'] };
  if (s.hasPassword) reasons.push('Login/account required (password field present).');
  if (s.hasFile) reasons.push('Résumé upload required — left for you to do.');
  if (textareas >= 3) reasons.push(textareas + ' open-ended questions — most need your own words.');
  const fillableNow = s.fillableNow != null ? +s.fillableNow : inputs;
  let level;
  if (s.hasPassword) level = 'Manual-heavy';
  else if (fillableNow >= 4 && textareas <= 2) level = 'Likely fillable';
  else if (fillableNow >= 1) level = 'Partially fillable';
  else level = 'Manual-heavy';
  if (level === 'Likely fillable' && !reasons.length) reasons.push(fillableNow + ' standard fields can be auto-filled from your profile.');
  if (level === 'Partially fillable' && !reasons.some(r => /standard/.test(r))) reasons.push(fillableNow + ' standard field(s) fillable; the rest need review.');
  return { level, reasons };
}

// Roll captured clip metadata into a confidence band + human-readable detected / needs-review lists.
function captureConfidence(meta) {
  const m = meta || {};
  const detected = [], needsReview = [];
  const hasCompany = m.company && !/^(unknown|untitled)/i.test(m.company);
  const hasRole = m.role && !/^untitled/i.test(m.role);
  hasCompany ? detected.push('company') : needsReview.push('company unclear');
  hasRole ? detected.push('role') : needsReview.push('role/title unclear');
  if (m.remote) detected.push(m.remote); else needsReview.push('work location (remote/onsite)');
  if (m.salary) detected.push('salary'); else needsReview.push('salary not posted');
  if (m.source) detected.push(m.source);
  if (!m.seniority) needsReview.push('seniority unclear');
  let score = 0;
  if (hasCompany) score += 2; if (hasRole) score += 2;
  if (m.remote) score += 1; if (m.salary) score += 1; if (m.source) score += 1;
  const level = score >= 6 ? 'High' : score >= 4 ? 'Medium' : 'Low';
  return { level, detected, needsReview };
}

function shouldSkipAiField(sig, type) {
  const t = String(type || '').toLowerCase();
  if (['password', 'file', 'hidden', 'submit', 'button', 'checkbox', 'radio', 'range', 'color'].includes(t)) return true;
  return false;
}

function isRetryableActionError(err) {
  if (!err) return false;
  if (err.upgrade) return false;
  const msg = String(err.message || err);
  if (/Network error/i.test(msg)) return true;
  const m = msg.match(/HTTP\s+(\d{3})/i);
  if (!m) return false;
  const code = +m[1];
  return code >= 500;
}

function classifyQuestionField(label, kind) {
  const sig = String(label || '').toLowerCase();
  if (/why|describe|tell us|explain|what makes|share an example|walk us through|how have you/i.test(sig)) return 'open-ended';
  if (/first name|last name|preferred name|email|phone|linkedin|resume|résumé|cover letter|sponsorship|work authorization|how did you hear/i.test(sig)) return 'common';
  return String(kind || '').toLowerCase() === 'textarea' ? 'unique' : 'common';
}

function groupQuestionFields(fields) {
  const groups = {
    common: { id: 'common', items: [] },
    unique: { id: 'unique', items: [] },
    'open-ended': { id: 'open-ended', items: [] },
  };
  for (const field of (fields || [])) {
    const bucket = classifyQuestionField(field && field.label, field && field.kind);
    groups[bucket].items.push(field);
  }
  return groups;
}

if (typeof module !== 'undefined') module.exports = {
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
  classifyQuestionField,
  groupQuestionFields,
};
