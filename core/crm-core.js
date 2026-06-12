/**
 * crm-core — the single source of truth for the pure logic shared by the server (Node),
 * the React Native app, and the Chrome extension. ZERO runtime dependencies (no Node, no
 * DOM): environment-specific bits (uuid, clock) are INJECTED. Every export here is pinned
 * by the shared fixtures in tests/vectors/ (tests/run-core-vectors.js) so the three
 * consumers can never silently drift. Canonical scoring spec: agent/scoring-criteria.md.
 *
 * CommonJS so Node `require()` works as-is; an ESM shim (core/crm-core.mjs) re-exports it
 * for the RN/Expo bundler.
 */

// ---- requisition identity ----
const reqKey = x => (String(x.company || '') + '|' + String(x.role || '')).toLowerCase().trim();

// A stable posting id pulled from the link (greenhouse gh_jid / numeric job id, ashby uuid,
// generic /jobs|listing/<id>, jobId/reqId params). Lets distinct same-title reqs at one company
// coexist (different ids), while a re-capture of the SAME posting still dedupes.
function postingId(u) {
  if (!u) return '';
  const s = String(u);
  let m = s.match(/[?&]gh_jid=(\d+)/i) || s.match(/\/listing\/(\d+)/i) || s.match(/\/jobs?\/(\d{4,})/i) || s.match(/[?&](?:jobid|requisitionid|reqid)=([\w-]+)/i);
  if (m) return m[1].toLowerCase();
  m = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);   // ashby/uuid
  return m ? m[0].toLowerCase() : '';
}

// Same posting only if company+role match AND there aren't two provably-different posting ids.
// Strictly more conservative than reqKey alone — it only SPLITS apart same-title rows that carry
// different req ids (e.g. 3 "Staff Product Manager" at Dropbox); it never merges more than before.
function sameReq(a, b) {
  if (reqKey(a) !== reqKey(b)) return false;
  const ia = postingId(a.link || a.url), ib = postingId(b.link || b.url);
  return !(ia && ib && ia !== ib);
}

// ---- scoring ----
const expectedValue = x => +(((+x.fit || 0) * (+x.prob || 0)) / 10).toFixed(1);

// Tier from fit/prob per agent/scoring-criteria.md (EV = fit*prob/10). Optional `thr` overrides the
// default thresholds (Reqon "Tiers & rules" setting); omitting it preserves the canonical model so
// every existing caller is unchanged.
const DEFAULT_TIER_THRESHOLDS = { aEv: 5.2, aFit: 8, aProb: 6.5, bEv: 4.0 };
function computeTier(fit, prob, thr) {
  const t = thr || DEFAULT_TIER_THRESHOLDS;
  const aEv = t.aEv != null ? +t.aEv : 5.2;
  const aFit = t.aFit != null ? +t.aFit : 8;
  const aProb = t.aProb != null ? +t.aProb : 6.5;
  const bEv = t.bEv != null ? +t.bEv : 4.0;
  const f = +fit || 0, p = +prob || 0, ev = +((f * p) / 10).toFixed(1);
  if (ev >= aEv && f >= aFit && p >= aProb) return 'A';
  if (ev >= bEv) return 'B';
  return 'C';
}

// ---- sync reconcile (device↔server) ----
// Per-row last-writer-wins by updatedAt; unknown ids append (still subject to req-ID dedupe →
// idRemaps tells the client which of its rows is actually an existing row); tombstones propagate
// like any other edit. `genId`/`now` are injected so this stays dependency-free.
function reconcileSync(serverRows, clientRows, deps) {
  const genId = (deps && deps.genId) || (() => 'id-' + Math.random().toString(36).slice(2));
  const now = (deps && deps.now) || (() => new Date().toISOString());
  const out = serverRows.slice();
  const byId = new Map(out.map((r, i) => [r.id, i]));
  let applied = 0, conflicts = 0;
  const idRemaps = [];
  for (const c of (clientRows || [])) {
    if (!c || typeof c !== 'object') continue;
    if (!c.id) c.id = genId();
    c.updatedAt = c.updatedAt || now();
    const i = byId.has(c.id) ? byId.get(c.id) : -1;
    if (i >= 0) {
      const s = out[i];
      if ((c.updatedAt || '') > (s.updatedAt || '')) { c.syncedAt = now(); out[i] = c; applied++; }
      else if ((c.updatedAt || '') < (s.updatedAt || '') && JSON.stringify(c) !== JSON.stringify(s)) conflicts++;   // server wins; counted for the log
    } else {
      // unknown id — dedupe by posting identity before appending (capture raced on two devices)
      const dup = out.findIndex(r => sameReq(r, c));
      if (dup >= 0) { idRemaps.push({ from: c.id, to: out[dup].id }); conflicts++; continue; }
      c.syncedAt = now();
      out.push(c); applied++;
    }
  }
  return { rows: out, applied, conflicts, idRemaps };
}

module.exports = { reqKey, postingId, sameReq, expectedValue, computeTier, reconcileSync, DEFAULT_TIER_THRESHOLDS };
