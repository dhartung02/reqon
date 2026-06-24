// ---------------------------------------------------------------------------
// User registry + auth (ROADMAP-V3 · PR 0 · slice 2)
//
// A shared registry (users.json at repo root) of accounts for multi-user mode. Per-user DATA lives
// in its own namespace (lib/store.js); this file only holds identities + credentials.
//   - Passwords hashed with scrypt (stdlib), per-user salt, never stored plaintext.
//   - Sessions are stateless signed cookies: "<userId>.<HMAC(userId, secret)>" — verifiable without
//     a server-side session table; the signing secret is generated once and kept in users.json.
//   - userId is a slug of the username so the data namespace (data/users/<userId>/) is readable.
//
// When multi-user is OFF (store.multiUserEnabled() === false) the server ignores this entirely and
// behaves exactly as the single-user APP_TOKEN deployment.
// ---------------------------------------------------------------------------
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const USERS_FILE = path.join(ROOT, 'users.json');
const slug = u => String(u || '').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '').slice(0, 40);

function load() {
  let db;
  try { db = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch (e) { db = null; }
  if (!db || typeof db !== 'object') db = {};
  let dirty = false;
  if (!db.secret) { db.secret = crypto.randomBytes(32).toString('hex'); dirty = true; }   // persist so sessions verify
  if (!Array.isArray(db.users)) db.users = [];
  if (dirty) { try { save(db); } catch (e) {} }
  return db;
}
function save(db) {
  const tmp = USERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, USERS_FILE);
}
function secret() { return load().secret; }

// --- password hashing (scrypt) ---
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const dk = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${dk}`;
}
function verifyPassword(pw, stored) {
  try {
    const [alg, salt, dk] = String(stored).split('$');
    if (alg !== 'scrypt' || !salt || !dk) return false;
    const calc = crypto.scryptSync(String(pw), salt, 64).toString('hex');
    return calc.length === dk.length && crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(dk));
  } catch (e) { return false; }
}

// --- sessions (stateless signed cookie) ---
function sign(userId) { return crypto.createHmac('sha256', secret()).update(String(userId)).digest('hex'); }
function makeSession(userId) { return `${userId}.${sign(userId)}`; }
function verifySession(cookie) {
  if (!cookie || typeof cookie !== 'string') return null;
  const i = cookie.lastIndexOf('.');
  if (i < 1) return null;
  const uid = cookie.slice(0, i), sig = cookie.slice(i + 1), exp = sign(uid);
  try { if (sig.length === exp.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return uid; } catch (e) {}
  return null;
}

// --- registry ops ---
const publicView = u => u && ({ id: u.id, username: u.username, displayName: u.displayName, email: u.email || '', role: u.role, createdAt: u.createdAt, disabled: !!u.disabled, useSharedKey: !!u.useSharedKey });
function list() { return load().users.map(publicView); }
function count() { return load().users.length; }
function getById(id) { return load().users.find(u => u.id === id) || null; }
function getByUsername(name) { const s = slug(name); return load().users.find(u => u.id === s || slug(u.username) === s) || null; }

function create({ username, displayName, password, email = '', role = 'user', useSharedKey = false }) {
  const db = load();
  const id = slug(username);
  if (!id) throw new Error('username required (letters/numbers/-/_)');
  if (!password || String(password).length < 8) throw new Error('password must be at least 8 characters');
  if (db.users.some(u => u.id === id)) throw new Error('username already exists');
  const u = { id, username: String(username).trim(), displayName: String(displayName || username).trim(),
    email: String(email || '').trim(), passwordHash: hashPassword(password), role: role === 'admin' ? 'admin' : 'user',
    createdAt: new Date().toISOString(), disabled: false, useSharedKey: !!useSharedKey };
  db.users.push(u); save(db);
  return publicView(u);
}
function verify(username, password) {
  const u = getByUsername(username);
  if (!u || u.disabled) return null;
  return verifyPassword(password, u.passwordHash) ? u : null;
}
function update(id, patch) {
  const db = load(); const u = db.users.find(x => x.id === id); if (!u) return null;
  if (typeof patch.displayName === 'string') u.displayName = patch.displayName.trim();
  if (typeof patch.email === 'string') u.email = patch.email.trim();
  if (patch.role === 'admin' || patch.role === 'user') u.role = patch.role;
  if (typeof patch.disabled === 'boolean') u.disabled = patch.disabled;
  if (typeof patch.useSharedKey === 'boolean') u.useSharedKey = patch.useSharedKey;
  if (patch.password) { if (String(patch.password).length < 8) throw new Error('password too short'); u.passwordHash = hashPassword(patch.password); }
  save(db); return publicView(u);
}
function remove(id) { const db = load(); const n = db.users.length; db.users = db.users.filter(u => u.id !== id); save(db); return db.users.length < n; }

// Per-user access token (decision: extension/app/ingest bind to ONE user). Only the sha256 hash is
// stored; the plaintext is shown once at generation (for the pairing QR / token field).
const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
function setToken(id) {
  const db = load(); const u = db.users.find(x => x.id === id); if (!u) return null;
  const tok = crypto.randomBytes(24).toString('base64url');
  u.tokenHash = sha256(tok); save(db); return tok;
}
function userByToken(token) {
  if (!token) return null; const h = sha256(token);
  return load().users.find(u => u.tokenHash && u.tokenHash === h && !u.disabled) || null;
}
function hasToken(id) { const u = getById(id); return !!(u && u.tokenHash); }

// First-run bootstrap: create the initial admin if the registry is empty. Password from
// ADMIN_PASSWORD env, else APP_TOKEN, else a printed random one. Username from ADMIN_USER (default
// "admin"). No-op once any user exists.
function ensureBootstrapAdmin() {
  if (count() > 0) return null;
  const username = process.env.ADMIN_USER || 'admin';
  let pw = process.env.ADMIN_PASSWORD || process.env.APP_TOKEN || '';
  let generated = false;
  if (!pw || pw.length < 8) { pw = crypto.randomBytes(9).toString('base64url'); generated = true; }
  const u = create({ username, displayName: 'Admin', password: pw, role: 'admin', useSharedKey: true });
  console.log(`[users] bootstrapped admin "${username}"` + (generated ? ` with generated password: ${pw}  (change it in Settings → Users)` : ' (password from ADMIN_PASSWORD/APP_TOKEN)'));
  return u;
}

module.exports = {
  slug, list, count, getById, getByUsername, create, verify, update, remove,
  makeSession, verifySession, hashPassword, verifyPassword, ensureBootstrapAdmin,
  setToken, userByToken, hasToken,
};
