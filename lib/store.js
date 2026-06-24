// ---------------------------------------------------------------------------
// Tenant-scoped store (ROADMAP-V3 · PR 0 · slice 1)
//
// Goal: make every per-user file (data, profile, boards, watchlist, notifications,
// digest-state, mail-state, push-tokens, interview-guides, backups) resolve through a
// single namespace resolver, so multi-user data separation is enforced in ONE place.
//
// NON-BREAKING by design:
//   - With multi-user OFF (default), or for the implicit "owner" user, paths resolve to the
//     EXACT legacy locations (root data.json, agent/*.json, backups/). Nothing moves; the
//     running single-user deployment is byte-for-byte unaffected and no migration is needed.
//   - Additional users get an isolated namespace under data/users/<userId>/.
//
// Request scoping uses AsyncLocalStorage so existing helpers can resolve the current user's
// paths per-request without threading a userId through every call site. Outside a request
// (scout/digest/CLI), code calls runAs(userId, fn) or falls back to the owner.
// ---------------------------------------------------------------------------
'use strict';
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const ROOT = path.resolve(__dirname, '..');
const AGENT = path.join(ROOT, 'agent');
const OWNER = 'owner';                                   // implicit single-user / legacy id
const multiUserEnabled = () => process.env.MULTIUSER === 'true';

const als = new AsyncLocalStorage();
/** Run `fn` with `userId` bound as the current tenant (per-request / per-job scope). */
function runAs(userId, fn) { return als.run({ userId: userId || OWNER }, fn); }
/** The current tenant id — the request's bound user, else the implicit owner. */
function currentUser() { const s = als.getStore(); return (s && s.userId) || OWNER; }

const slug = id => String(id || OWNER).toLowerCase().replace(/[^a-z0-9_-]/g, '') || OWNER;
const isLegacy = userId => !multiUserEnabled() || slug(userId) === OWNER;

// Resolve the full set of file paths for a user. The owner (and any user while multi-user is
// disabled) maps to the legacy locations — including the DATA_FILE / BACKUP_DIR env overrides
// used by tests — so existing behavior is preserved exactly.
function pathsFor(userId) {
  if (isLegacy(userId)) {
    return {
      userId: OWNER,
      dir: ROOT,
      data: process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(ROOT, 'data.json'),
      backups: process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(ROOT, 'backups'),
      profile: path.join(AGENT, 'profile.json'),
      boards: path.join(AGENT, 'boards.json'),
      watchlist: path.join(AGENT, 'watchlist.json'),
      notifications: path.join(AGENT, 'notifications.json'),
      digestState: path.join(AGENT, 'digest-state.json'),
      mailState: path.join(AGENT, 'mail-state.json'),
      pushTokens: path.join(AGENT, 'push-tokens.json'),
      guidesDir: path.join(AGENT, 'interview-guides'),
      scoutStatus: path.join(AGENT, 'scout-status.json'),
      sourceHealth: path.join(AGENT, 'source-health.json'),
      secrets: path.join(AGENT, 'secrets.json'),
      settings: path.join(AGENT, 'user-settings.json'),
      assistUsage: path.join(AGENT, 'assist-usage.json'),
      assistLog: path.join(AGENT, 'assist-log.jsonl'),
      cvCache: path.join(AGENT, 'cv-latest.json'),
      enrichLog: path.join(AGENT, 'enrichment-log.jsonl'),
      changeLog: path.join(AGENT, 'change-log.jsonl'),
      jobs: path.join(AGENT, 'jobs.json'),
    };
  }
  const base = path.join(ROOT, 'data', 'users', slug(userId));
  return {
    userId: slug(userId),
    dir: base,
    data: path.join(base, 'data.json'),
    backups: path.join(base, 'backups'),
    profile: path.join(base, 'profile.json'),
    boards: path.join(base, 'boards.json'),
    watchlist: path.join(base, 'watchlist.json'),
    notifications: path.join(base, 'notifications.json'),
    digestState: path.join(base, 'digest-state.json'),
    mailState: path.join(base, 'mail-state.json'),
    pushTokens: path.join(base, 'push-tokens.json'),
    guidesDir: path.join(base, 'interview-guides'),
    scoutStatus: path.join(base, 'scout-status.json'),
    sourceHealth: path.join(base, 'source-health.json'),
    secrets: path.join(base, 'secrets.json'),
    settings: path.join(base, 'user-settings.json'),
    assistUsage: path.join(base, 'assist-usage.json'),
    assistLog: path.join(base, 'assist-log.jsonl'),
    cvCache: path.join(base, 'cv-latest.json'),
    enrichLog: path.join(base, 'enrichment-log.jsonl'),
    changeLog: path.join(base, 'change-log.jsonl'),
    jobs: path.join(base, 'jobs.json'),
  };
}
/** Path set for the CURRENT tenant (call inside a request / runAs scope). */
function paths() { return pathsFor(currentUser()); }

// --- generic JSON helpers (mirror server.js readJsonSafe / writeJsonPretty semantics) ---
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return fallback; }
}
function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

// --- rows store for the current tenant ---
function readRows() {
  try { return JSON.parse(fs.readFileSync(paths().data, 'utf8')); }
  catch (e) { console.error('[store] read failed (' + currentUser() + '):', e.message); return []; }
}
function writeRows(rows) { writeJsonAtomic(paths().data, rows); }

/** Ensure a (non-owner) user's namespace dir exists. No-op for the legacy owner. */
function ensureUserDir(userId) {
  const p = pathsFor(userId);
  if (!isLegacy(userId)) { fs.mkdirSync(p.dir, { recursive: true }); fs.mkdirSync(p.backups, { recursive: true }); }
  return p;
}

const PER_USER_KEYS = ['data', 'profile', 'boards', 'watchlist', 'notifications', 'digestState', 'pushTokens'];

// Copy the existing single-user (legacy) board + config into a user's namespace. Used once, when
// multi-user is first enabled, so the operator's current board "becomes" their account. Idempotent:
// skips if the target already has data. The legacy root files are left intact (reversible — turning
// multi-user back off restores the original single-user board).
function migrateLegacyToUser(userId) {
  if (isLegacy(userId)) return { migrated: false, reason: 'is-owner' };
  const src = pathsFor(OWNER), dst = ensureUserDir(userId);
  if (fs.existsSync(dst.data)) return { migrated: false, reason: 'already-has-data' };
  let n = 0;
  for (const k of PER_USER_KEYS) { try { if (fs.existsSync(src[k])) { fs.copyFileSync(src[k], dst[k]); n++; } } catch (e) {} }
  try {
    if (fs.existsSync(src.guidesDir)) {
      fs.mkdirSync(dst.guidesDir, { recursive: true });
      for (const f of fs.readdirSync(src.guidesDir)) fs.copyFileSync(path.join(src.guidesDir, f), path.join(dst.guidesDir, f));
    }
  } catch (e) {}
  return { migrated: true, files: n };
}

// Seed a brand-new user's namespace so their scout/board work out of the box: empty pipeline +
// boards/watchlist from the shipped *.example.json. Profile is left empty so onboarding can fill it.
function seedNewUser(userId) {
  if (isLegacy(userId)) return false;
  const dst = ensureUserDir(userId);
  if (!fs.existsSync(dst.data)) writeJsonAtomic(dst.data, []);
  for (const [key, ex] of [['boards', 'boards.example.json'], ['watchlist', 'watchlist.example.json']]) {
    try {
      if (!fs.existsSync(dst[key])) {
        const example = path.join(AGENT, ex);
        if (fs.existsSync(example)) fs.copyFileSync(example, dst[key]);
      }
    } catch (e) {}
  }
  return true;
}

module.exports = {
  OWNER, multiUserEnabled, runAs, currentUser, pathsFor, paths,
  readJson, writeJsonAtomic, readRows, writeRows, ensureUserDir, slug,
  migrateLegacyToUser, seedNewUser,
};
