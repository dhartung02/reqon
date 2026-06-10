#!/usr/bin/env node
/**
 * Asserts the extension's lib.js is semantically identical to the server on the shared
 * fixtures (postingId / sameReq). Guards against the "two implementations drift" risk.
 * Run: node tests/run-extension-vectors.js
 */
const fs = require('fs');
const path = require('path');
const ext = require(path.join(__dirname, '..', 'extension', 'lib.js'));

const vectors = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors', name), 'utf8'));
let pass = 0, fail = 0;
const check = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.error(`  ✗ ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};

for (const v of vectors('posting-id.json')) check(`ext.postingId(${v.url || '""'})`, ext.postingId(v.url), v.expect);
for (const v of vectors('same-req.json')) check(`ext.sameReq: ${v.name}`, ext.sameReq(v.a, v.b), v.expect);

// matchRow: posting-id wins over URL; tombstones excluded
const rows = [
  { id: 'a', company: 'Twilio', role: 'PM L2', link: 'https://job-boards.greenhouse.io/twilio/jobs/7963691' },
  { id: 'b', company: 'Acme', role: 'PM', link: 'https://acme.com/careers/123', deleted: true }
];
check('matchRow by posting-id (URL variant)', (ext.matchRow(rows, 'https://job-boards.greenhouse.io/twilio/jobs/7963691?utm=x') || {}).id, 'a');
check('matchRow excludes tombstones', ext.matchRow(rows, 'https://acme.com/careers/123'), null);
check('matchRow miss → null', ext.matchRow(rows, 'https://other.com/x'), null);

console.log(`\nextension vectors: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
