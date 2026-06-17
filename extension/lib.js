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

if (typeof module !== 'undefined') module.exports = { postingId, reqKey, sameReq, matchRow, bestAnswerMatch };
