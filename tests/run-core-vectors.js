#!/usr/bin/env node
/**
 * Runs the shared fixtures against core/crm-core.js DIRECTLY (no server) — proving the
 * standalone module the React Native app and the extension import is correct on its own.
 * tests/run-vectors.js runs the SAME fixtures through server.js's re-export, so the two
 * together prove server == core. Run: node tests/run-core-vectors.js
 */
const fs = require('fs');
const path = require('path');
const core = require(path.join(__dirname, '..', 'core', 'crm-core.js'));

const vectors = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors', name), 'utf8'));
let pass = 0, fail = 0;
const check = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.error(`  ✗ ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};

for (const v of vectors('posting-id.json')) check(`postingId(${v.url || '""'})`, core.postingId(v.url), v.expect);
for (const v of vectors('same-req.json')) check(`sameReq: ${v.name}`, core.sameReq(v.a, v.b), v.expect);
for (const v of vectors('tier.json')) check(`tier(${v.fit},${v.prob})`, core.computeTier(v.fit, v.prob), v.expect);

// expectedValue sanity (EV = fit*prob/10, rounded to 1dp)
check('ev(8,7)', core.expectedValue({ fit: 8, prob: 7 }), 5.6);
check('ev(missing)', core.expectedValue({}), 0);

// reconcileSync with injected, deterministic deps (fixtures provide ids; deps rarely fire)
const deps = { genId: () => 'gen-id', now: () => '2026-06-10T23:59:59.000Z' };
for (const v of vectors('lww.json')) {
  const r = core.reconcileSync(JSON.parse(JSON.stringify(v.server)), JSON.parse(JSON.stringify(v.client)), deps);
  check(`lww: ${v.name} · len`, r.rows.length, v.expect.len);
  check(`lww: ${v.name} · applied`, r.applied, v.expect.applied);
  check(`lww: ${v.name} · conflicts`, r.conflicts, v.expect.conflicts);
  check(`lww: ${v.name} · idRemaps`, r.idRemaps.length, v.expect.idRemaps);
  for (const a of (v.expect.rows || [])) {
    const row = r.rows.find(x => x.id === a.id);
    check(`lww: ${v.name} · row ${a.id}.${a.field}`, row ? row[a.field] : '<missing>', a.value);
  }
}

console.log(`\ncore vectors: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
