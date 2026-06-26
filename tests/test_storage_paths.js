// Disk-aware storage paths (Render persistent-disk hardening). Run: node tests/test_storage_paths.js
// Deterministic, no server. Verifies lib/store + lib/users resolve under REQON_DATA_DIR and that the
// one-time users.json migration copies a legacy registry onto the disk without clobbering an existing
// one. Local/dev (no REQON_DATA_DIR) must still resolve to the repo root.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LEGACY = path.join(ROOT, 'users.json');
const savedEnv = process.env.REQON_DATA_DIR;
const savedMU = process.env.MULTIUSER;
const hadLegacy = fs.existsSync(LEGACY);
const legacyBackup = hadLegacy ? fs.readFileSync(LEGACY) : null;   // preserve a real registry if present

let pass = 0; const ok = (n) => { pass++; console.log('  ✓ ' + n); };
const mkTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reqon-disk-'));
const fresh = (m) => { delete require.cache[require.resolve(m)]; return require(m); };

try {
  process.env.MULTIUSER = '';

  // --- store: DATA_ROOT honors REQON_DATA_DIR ---
  const disk1 = mkTmp();
  process.env.REQON_DATA_DIR = disk1;
  let store = fresh('../lib/store');
  assert.strictEqual(store.pathsFor('owner').data, path.join(disk1, 'data.json'), 'owner data.json under REQON_DATA_DIR');
  assert.ok(store.pathsFor('owner').profile.startsWith(path.join(disk1, 'agent')), 'owner profile under <disk>/agent');
  ok('store: owner paths resolve under REQON_DATA_DIR');

  // --- users: migration copies a legacy root registry onto the disk when the disk has none ---
  const disk2 = mkTmp();
  process.env.REQON_DATA_DIR = disk2;
  fs.writeFileSync(LEGACY, JSON.stringify({ secret: 'legacy-secret', users: [{ id: 'old', username: 'old' }] }));
  fresh('../lib/users');                                  // require() triggers migrateLegacyUsersFile()
  const diskUsers = path.join(disk2, 'users.json');
  assert.ok(fs.existsSync(diskUsers), 'migration created the disk users.json');
  const migrated = JSON.parse(fs.readFileSync(diskUsers, 'utf8'));
  assert.strictEqual(migrated.secret, 'legacy-secret', 'migration preserved the session-signing secret');
  assert.strictEqual(migrated.users[0].id, 'old', 'migration preserved accounts');
  ok('users: legacy users.json migrated onto the disk');

  // --- migration must NOT overwrite an existing disk registry ---
  const disk3 = mkTmp();
  fs.writeFileSync(path.join(disk3, 'users.json'), JSON.stringify({ secret: 'disk-secret', users: [] }));
  process.env.REQON_DATA_DIR = disk3;                     // legacy file still present from above
  fresh('../lib/users');
  const keep = JSON.parse(fs.readFileSync(path.join(disk3, 'users.json'), 'utf8'));
  assert.strictEqual(keep.secret, 'disk-secret', 'existing disk users.json NOT overwritten by migration');
  ok('users: migration never clobbers an existing disk registry');

  // --- users write through to the disk path (create + verify round-trip) ---
  const disk4 = mkTmp();
  process.env.REQON_DATA_DIR = disk4;
  const users = fresh('../lib/users');
  users.create({ username: 'dustin', displayName: 'Dustin', password: 'pw-123456', role: 'admin' });
  assert.ok(fs.existsSync(path.join(disk4, 'users.json')), 'create() wrote users.json to the disk');
  assert.ok(users.verify('dustin', 'pw-123456'), 'created account verifies from the disk-backed registry');
  ok('users: accounts persist to and verify from the disk path');

  // --- local/dev: no REQON_DATA_DIR -> repo root, unchanged ---
  delete process.env.REQON_DATA_DIR;
  store = fresh('../lib/store');
  assert.strictEqual(store.pathsFor('owner').data, path.join(ROOT, 'data.json'), 'no REQON_DATA_DIR -> repo-root data.json');
  ok('store/users: local/dev falls back to the repo root when REQON_DATA_DIR is unset');

  console.log(`\nPASS — ${pass} storage-path checks`);
} catch (e) {
  console.error('\nFAIL —', e.message); process.exitCode = 1;
} finally {
  if (savedEnv === undefined) delete process.env.REQON_DATA_DIR; else process.env.REQON_DATA_DIR = savedEnv;
  if (savedMU === undefined) delete process.env.MULTIUSER; else process.env.MULTIUSER = savedMU;
  if (legacyBackup) fs.writeFileSync(LEGACY, legacyBackup); else { try { fs.unlinkSync(LEGACY); } catch (e) {} }
}
