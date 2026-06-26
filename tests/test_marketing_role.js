// Tests for REQON_ROLE=marketing mode (server.js).
// Starts a real server on a high port, verifies the marketing surface is correct,
// and confirms no API write endpoints are reachable.
// Run: node tests/test_marketing_role.js
'use strict';
const http = require('node:http');
const assert = require('node:assert');
const { execFile } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 18799;
let proc;
let passed = 0;
const ok = (n, fn) => { fn(); console.log('  ✓ ' + n); passed++; };

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: PORT, path: urlPath, headers: { Accept: '*/*' } }, res => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

async function main() {
  // Boot server in marketing mode
  proc = execFile(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, REQON_ROLE: 'marketing', PORT: String(PORT), HOST: '127.0.0.1' },
  });
  proc.stderr.on('data', () => {});

  // Wait for the server to be ready (up to 5 s)
  for (let i = 0; i < 25; i++) {
    try { await get('/health'); break; } catch { await new Promise(r => setTimeout(r, 200)); }
  }

  // /health
  {
    const r = await get('/health');
    ok('/health returns 200', () => assert.strictEqual(r.status, 200));
    const j = JSON.parse(r.body);
    ok('/health payload has ok:true', () => assert.strictEqual(j.ok, true));
    ok('/health payload has service:reqon-marketing', () => assert.strictEqual(j.service, 'reqon-marketing'));
    ok('/health payload has role:marketing', () => assert.strictEqual(j.role, 'marketing'));
  }

  // /  (placeholder page)
  {
    const r = await get('/');
    ok('/ returns 200', () => assert.strictEqual(r.status, 200));
    ok('/ content-type is html', () => assert.ok(r.headers['content-type'].includes('html')));
    ok('/ body contains Reqon heading', () => assert.ok(r.body.includes('<h1>Reqon</h1>')));
    ok('/ body contains coming soon text', () => assert.ok(r.body.toLowerCase().includes('coming soon')));
    ok('/ body contains cloud link', () => assert.ok(r.body.includes('cloud.reqon.app')));
  }

  // API write endpoints must not be reachable
  {
    const r = await get('/api/reqs');
    ok('/api/reqs returns 404 (no API surface)', () => assert.strictEqual(r.status, 404));
  }
  {
    const r = await get('/api/health');
    ok('/api/health returns 404 (not the health path)', () => assert.strictEqual(r.status, 404));
  }
  {
    const r = await get('/some/deep/path');
    ok('unknown path returns 404', () => assert.strictEqual(r.status, 404));
  }

  console.log(`\n  ${passed} passed\n`);
}

main().catch(err => {
  console.error('FAIL:', err.message);
  process.exit(1);
}).finally(() => { if (proc) proc.kill(); });
