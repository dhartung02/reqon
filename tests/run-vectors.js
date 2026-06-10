#!/usr/bin/env node
/**
 * Shared test-vector runner (WP-0). The same JSON fixtures under tests/vectors/ are the
 * contract for every implementation of the core logic (server JS today; the mobile app's
 * port later). Requiring server.js does NOT start the server — side effects are guarded
 * behind `require.main === module`.
 *
 * Run: node tests/run-vectors.js   (exit 0 = all green)
 */
const fs = require('fs');
const path = require('path');
const srv = require(path.join(__dirname, '..', 'server.js'));

const vectors = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors', name), 'utf8'));
let pass = 0, fail = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; }
  else { fail++; console.error(`  ✗ ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
}

// postingId
for (const v of vectors('posting-id.json')) check(`postingId(${v.url || '""'})`, srv.postingId(v.url), v.expect);

// sameReq
for (const v of vectors('same-req.json')) check(`sameReq: ${v.name}`, srv.sameReq(v.a, v.b), v.expect);

// computeTier
for (const v of vectors('tier.json')) check(`tier(fit=${v.fit},prob=${v.prob})`, srv.computeTier(v.fit, v.prob), v.expect);

// reconcileSync (LWW + dedupe + tombstones)
for (const v of vectors('lww.json')) {
  // deep-copy: reconcile may mutate inputs
  const r = srv.reconcileSync(JSON.parse(JSON.stringify(v.server)), JSON.parse(JSON.stringify(v.client)));
  check(`lww: ${v.name} · len`, r.rows.length, v.expect.len);
  check(`lww: ${v.name} · applied`, r.applied, v.expect.applied);
  check(`lww: ${v.name} · conflicts`, r.conflicts, v.expect.conflicts);
  check(`lww: ${v.name} · idRemaps`, r.idRemaps.length, v.expect.idRemaps);
  for (const a of (v.expect.rows || [])) {
    const row = r.rows.find(x => x.id === a.id);
    check(`lww: ${v.name} · row ${a.id}.${a.field}`, row ? row[a.field] : '<missing row>', a.value);
  }
}

console.log(`\nvectors: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
