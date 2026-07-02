#!/usr/bin/env node
// Runs every existing test suite from one command. No new test framework — mirrors the existing
// hand-rolled runners (tests/run-vectors.js etc.), which already exit non-zero on failure via
// their own assert() calls.
// Run: node tests/run-all.js   (exit 0 = all green)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TESTS_DIR = __dirname;

const vectorRunners = ['run-vectors.js', 'run-core-vectors.js', 'run-extension-vectors.js'];
const discovered = fs.readdirSync(TESTS_DIR)
  .filter(f => /^test_.*\.js$/.test(f) || /\.test\.js$/.test(f))
  .sort();

const nodeSuites = [...vectorRunners, ...discovered];

let pass = 0, fail = 0;
const results = [];

for (const file of nodeSuites) {
  const full = path.join(TESTS_DIR, file);
  console.log(`\n--- ${file} ---`);
  const r = spawnSync(process.execPath, [full], { stdio: 'inherit' });
  const ok = r.status === 0;
  results.push({ file, ok });
  ok ? pass++ : fail++;
}

console.log(`\n--- run.sh (Python) ---`);
const py = spawnSync('bash', [path.join(TESTS_DIR, 'run.sh')], { stdio: 'inherit', cwd: path.join(TESTS_DIR, '..') });
const pyOk = py.status === 0;
results.push({ file: 'run.sh (Python)', ok: pyOk });
pyOk ? pass++ : fail++;

console.log(`\n=== run-all summary: ${pass}/${pass + fail} suite(s) passed ===`);
for (const r of results) if (!r.ok) console.log(`  ✗ ${r.file}`);
process.exit(fail ? 1 : 0);
