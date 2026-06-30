// Multi-user tenancy invariants (ROADMAP PR0). Run: node tests/test_multiuser_isolation.js
// Deterministic, no server — exercises lib/store (namespacing) + lib/users (auth/tokens). Uses a
// throwaway users.json under a temp HOME-less path; cleans up after.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const USERS_FILE = path.join(ROOT, 'users.json');
const hadUsers = fs.existsSync(USERS_FILE);
const backup = hadUsers ? fs.readFileSync(USERS_FILE) : null;   // preserve a real registry if present

let pass = 0; const ok = (n) => { pass++; console.log('  ✓ ' + n); };
try {
  // fresh registry for the test
  try { fs.unlinkSync(USERS_FILE); } catch (e) {}
  delete require.cache[require.resolve('../lib/store')];
  delete require.cache[require.resolve('../lib/users')];

  // --- store: namespacing + scoping ---
  process.env.MULTIUSER = '';
  const store = require('../lib/store');
  assert.strictEqual(store.pathsFor('owner').data, store.pathsFor('anyone').data, 'multi-user OFF: everyone -> legacy');
  assert.ok(store.pathsFor('owner').data.endsWith('data.json'), 'owner -> legacy data.json');

  process.env.MULTIUSER = 'true';
  assert.ok(store.pathsFor('dustin').data.includes(path.join('data', 'users', 'dustin')), 'multi-user: dustin namespaced');
  assert.notStrictEqual(store.pathsFor('dustin').data, store.pathsFor('eric').data, 'distinct namespaces');
  assert.strictEqual(store.pathsFor('owner').data, path.join(ROOT, 'data.json'), 'owner stays legacy even when on');
  assert.strictEqual(store.slug('Eric!! '), 'eric', 'slug sanitizes');
  ok('store: per-user namespaces are distinct + owner stays legacy');

  let seen = '';
  store.runAs('dustin', () => { seen = store.currentUser(); });
  assert.strictEqual(seen, 'dustin', 'runAs binds currentUser');
  assert.strictEqual(store.currentUser(), 'owner', 'outside runAs -> owner');
  ok('store: runAs scopes the current tenant');

  // --- users: auth, sessions, tokens ---
  const users = require('../lib/users');
  users.create({ username: 'dustin', displayName: 'Dustin', password: 'dustin-pw-123', role: 'admin' });
  users.create({ username: 'eric', displayName: 'Eric', password: 'eric-pw-4567' });
  assert.ok(users.verify('dustin', 'dustin-pw-123'), 'correct password verifies');
  assert.ok(!users.verify('dustin', 'wrong'), 'wrong password rejected');
  assert.ok(!users.verify('eric', 'dustin-pw-123'), 'cross-credential rejected');
  ok('users: password verify (correct / wrong / cross)');

  const s = users.makeSession('dustin');
  assert.strictEqual(users.verifySession(s), 'dustin', 'valid session resolves');
  assert.strictEqual(users.verifySession(s.slice(0, -1) + (s.slice(-1) === '0' ? '1' : '0')), null, 'tampered session rejected');
  ok('users: signed sessions verify + reject tampering');

  const dTok = users.setToken('dustin'); const eTok = users.setToken('eric');
  assert.strictEqual(users.userByToken(dTok).id, 'dustin', 'token resolves to its user');
  assert.strictEqual(users.userByToken(eTok).id, 'eric', 'second token resolves to its user');
  assert.notStrictEqual(dTok, eTok, 'tokens differ');
  assert.strictEqual(users.userByToken('garbage'), null, 'bad token -> null');
  users.update('eric', { disabled: true });
  assert.strictEqual(users.userByToken(eTok), null, 'disabled user token rejected');
  assert.ok(!users.verify('eric', 'eric-pw-4567'), 'disabled user cannot log in');
  ok('users: per-user tokens bind correctly; disabled users locked out');

  console.log(`\nPASS — ${pass} multi-user isolation checks`);
} catch (e) {
  console.error('\nFAIL —', e.message); process.exitCode = 1;
} finally {
  // restore the original registry (or remove the test one)
  if (backup) fs.writeFileSync(USERS_FILE, backup); else { try { fs.unlinkSync(USERS_FILE); } catch (e) {} }
}
