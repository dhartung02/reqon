// Regression test for the existing crash-early check: REQON_ROLE=cloud requires
// REQON_API_BASE_URL (server.js:444-446). Requiring server.js (rather than running it as the
// entry point) never reaches app.listen — see the `require.main !== module` guard at
// server.js:4417 — so this test is fast and never binds a port.
// Run: node tests/test_env_validation.js
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');
let passed = 0;
const ok = (n, fn) => { fn(); console.log('  ✓ ' + n); passed++; };

function requireServerWith(env) {
  return spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(SERVER)});console.log('OK-NO-CRASH');`],
    { env: { ...process.env, ...env }, encoding: 'utf8' }
  );
}

ok('cloud role without REQON_API_BASE_URL exits non-zero', () => {
  const r = requireServerWith({ REQON_ROLE: 'cloud', REQON_API_BASE_URL: '' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /REQON_API_BASE_URL is required/);
});

ok('cloud role with REQON_API_BASE_URL set boots without crashing', () => {
  const r = requireServerWith({ REQON_ROLE: 'cloud', REQON_API_BASE_URL: 'http://localhost:9999' });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /OK-NO-CRASH/);
});

ok('api role never requires REQON_API_BASE_URL', () => {
  const r = requireServerWith({ REQON_ROLE: 'api', REQON_API_BASE_URL: '' });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /OK-NO-CRASH/);
});

console.log(`\nenv validation: ${passed} passed`);
