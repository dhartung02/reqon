#!/usr/bin/env node
// Zero-config syntax gate: `node --check` over every first-party .js file. No ESLint config
// exists yet (see docs/superpowers/specs/2026-07-02-ci-cd-pipeline-design.md) — this catches
// syntax errors only, on purpose, so CI doesn't go red on day one from pre-existing style.
// Run: node scripts/check-syntax.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ROOTS = ['server.js', 'lib', 'core', 'tests', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'vectors', '__pycache__']);

function collect(target, out) {
  const full = path.join(ROOT, target);
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(full))) return;
    for (const entry of fs.readdirSync(full)) collect(path.join(target, entry), out);
  } else if (target.endsWith('.js')) {
    out.push(full);
  }
}

const files = [];
for (const r of ROOTS) {
  try { collect(r, files); } catch (e) { /* optional root missing is fine */ }
}

let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed++;
    console.error(`  ✗ ${path.relative(ROOT, f)}`);
    console.error('    ' + r.stderr.trim().split('\n').join('\n    '));
  }
}

console.log(`\nsyntax check: ${files.length - failed}/${files.length} file(s) OK`);
process.exit(failed ? 1 : 0);
