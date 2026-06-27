/**
 * Job Pipeline CRM — self-hosted server (Mac mini)
 * Node + Express, JSON-file store. Source of truth = data.json.
 * Excel is an on-demand EXPORT, never the live DB.
 *
 * Routes:
 *   GET  /api/reqs          -> all requisitions (JSON array)
 *   PUT  /api/reqs          -> replace full set (board sends whole state on save)
 *   POST /api/reqs/merge    -> append-only merge by company+role (job refreshes)
 *   GET  /api/export.xlsx   -> regenerate formatted workbook on demand
 *   POST /api/backup        -> timestamped snapshot of data.json into ./backups
 *   GET  /api/health        -> liveness/info
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ExcelJS = require('exceljs');
const QRCode = require('qrcode');
const docx = require('docx');
const store = require('./lib/store');   // tenant-scoped paths (ROADMAP-V3 PR0): owner==legacy paths
const users = require('./lib/users');   // user registry + auth (multi-user mode)
const MULTIUSER = () => store.multiUserEnabled();   // read live (env MULTIUSER=true)

// --- minimal .env loader (no dependency) ---------------------------------------
// Loads .env files into process.env on boot so secrets (e.g. OPENAI_API_KEY) live in a gitignored
// file rather than the code or the launchd plist. Precedence (highest first):
//   1. the REAL environment (Render dashboard / launchd / shell exports) — never overwritten
//   2. the disk-backed .env under REQON_DATA_DIR — where the Settings UI persists changes, so
//      in-app edits survive a redeploy (loaded after, overrides the repo file)
//   3. the committed repo .env — base/local defaults
// We snapshot the real-env keys BEFORE loading any file so a file can override another file but
// never the real environment.
const REAL_ENV_KEYS = new Set(Object.keys(process.env));
function loadDotenv(envPath, label) {
  try {
    if (!fs.existsSync(envPath)) return;
    let n = 0;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith('#')) continue;
      const eq = s.indexOf('=');
      if (eq < 1) continue;
      const k = s.slice(0, eq).trim();
      let v = s.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (REAL_ENV_KEYS.has(k)) continue;   // real environment always wins; file never overrides it
      process.env[k] = v; n++;              // file value applies (a later file may override an earlier one)
    }
    if (n) console.log(`[env] loaded ${n} var(s) from ${label}`);
  } catch (e) { console.error('[env] load failed:', e.message); }
}
loadDotenv(path.join(__dirname, '.env'), 'repo .env');
// The disk-backed .env is loaded just below, once REQON_DATA_DIR / DATA_DIR is resolved.

const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 = reachable on the LAN
const ROOT = __dirname;
// Persisted data root — defaults to the repo (local), or a mounted disk on an ephemeral host via
// REQON_DATA_DIR (mirrors lib/store.js). Code/examples/scripts stay under ROOT; only written data
// (guides, audit log, digest snapshots, and everything under lib/store.js) lives here.
const DATA_DIR = process.env.REQON_DATA_DIR ? path.resolve(process.env.REQON_DATA_DIR) : ROOT;
// Ensure the persisted-data dirs exist before anything writes (a fresh mounted disk starts empty).
try { for (const d of ['', 'agent', 'backups']) require('fs').mkdirSync(path.join(DATA_DIR, d), { recursive: true }); } catch (e) { console.error('[data-dir]', e.message); }
// Now that the data root is known, load the disk-backed .env (where the Settings UI persists changes
// on an ephemeral host). Loaded after the repo .env so in-app edits override committed defaults; the
// real environment still wins (see REAL_ENV_KEYS above). No-op locally where DATA_DIR === ROOT.
if (DATA_DIR !== ROOT) loadDotenv(path.join(DATA_DIR, '.env'), 'disk .env');
// Per-user file paths resolve through the tenant store (lib/store.js). With multi-user OFF
// (default) every key maps to the legacy location (root data.json, agent/*.json, backups/) so
// single-user behavior is unchanged; P.data / P.backups env overrides still apply (in store.js).
// `P.<key>` are getters: they resolve to the CURRENT request's tenant at access time.
const P = {
  get data() { return store.paths().data; },
  get backups() { return store.paths().backups; },
  get profile() { return store.paths().profile; },
  get boards() { return store.paths().boards; },
  get watchlist() { return store.paths().watchlist; },
  get notifications() { return store.paths().notifications; },
  get digestState() { return store.paths().digestState; },
  get pushTokens() { return store.paths().pushTokens; },
  get mailState() { return store.paths().mailState; },
  get guidesDir() { return store.paths().guidesDir; },
  get scoutStatus() { return store.paths().scoutStatus; },
  get sourceHealth() { return store.paths().sourceHealth; },
  get secrets() { return store.paths().secrets; },
  get settings() { return store.paths().settings; },
  get assistUsage() { return store.paths().assistUsage; },
  get assistLog() { return store.paths().assistLog; },
  get cvCache() { return store.paths().cvCache; },
  get enrichLog() { return store.paths().enrichLog; },
  get changeLog() { return store.paths().changeLog; },
};
// Per-user settings (ROADMAP-V3 PR0): these config keys live in the user's namespace, not shared
// .env — so each user has their own digest schedule/channels, AI caps/model, Gmail ingest, SMS, etc.
// Anything NOT in this set stays server-level in .env (SMTP sending identity, PUBLIC_URL, tokens,
// aggregator keys, APNs). Owner / single-user always read .env (unchanged).
const PER_USER_CFG = new Set([
  'DIGEST_ENABLED', 'DIGEST_TIME', 'DIGEST_CHANNEL', 'DIGEST_CHANNELS', 'DIGEST_DAYS', 'DIGEST_AFTER_SCOUT', 'DIGEST_TO', 'DIGEST_SLACK_WEBHOOK',
  'ASSIST_ENABLED', 'ASSIST_MODEL', 'ASSIST_DAILY_CALLS', 'ASSIST_MAX_TOKENS', 'ASSIST_MONTHLY_BUDGET', 'ASSIST_MONTHLY_TOKENS',
  'OPENAI_MODEL', 'OPENAI_JD_CHARS', 'OPENAI_MAX_TOKENS', 'OPENAI_PRICE_PER_1M', 'AI_ENRICH_MAX_PER_RUN', 'AI_ENRICH_TTL_DAYS',
  'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'GMAIL_LABEL', 'MAIL_AI', 'MAIL_SINCE_DAYS',
  'MAIL_NOTIFY_REJECTION', 'MAIL_NOTIFY_INTERVIEW', 'MAIL_NOTIFY_OFFER', 'MAIL_NOTIFY_CHANNELS',
  'SMS_METHOD', 'SMS_CARRIER', 'SMS_GATEWAY_NUMBER', 'SMS_TO', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM',
]);
const perUserScope = () => MULTIUSER() && store.currentUser() !== store.OWNER;
// Resolve a config value for the current tenant: per-user settings override .env for PER_USER_CFG keys.
function cfg(key) {
  if (perUserScope() && PER_USER_CFG.has(key)) { const s = store.readJson(P.settings, {}); if (key in s) return s[key]; }
  return process.env[key];
}
// Write per-user config keys to the tenant's settings.json (0600). Returns the count written.
function setUserCfg(updates) {
  const s = store.readJson(P.settings, {}); let n = 0;
  for (const [k, v] of Object.entries(updates)) { if (v === '' || v == null) delete s[k]; else s[k] = String(v); n++; }
  store.writeJsonAtomic(P.settings, s); try { fs.chmodSync(P.settings, 0o600); } catch (e) {}
  return n;
}
// Environment for a spawned subprocess (scout/digest/mail): the user's per-user settings + secrets
// overlaid on the shared env, so the Python honors per-user config without any Python changes.
function tenantEnv() {
  if (!perUserScope()) return process.env;
  const s = store.readJson(P.settings, {}); const sec = store.readJson(P.secrets, {});
  const env = { ...process.env }; for (const [k, v] of Object.entries(s)) env[k] = String(v);
  const k = aiKey(); if (k) env.OPENAI_API_KEY = k; for (const [kk, vv] of Object.entries(sec)) if (vv) env[kk] = String(vv);
  return env;
}
// Per-user AI key (decision #2): each user funds their own OpenAI usage unless an admin grants
// `useSharedKey` (server-funded). Single-user / implicit-owner -> the shared .env key, unchanged.
function aiKey() {
  if (!MULTIUSER()) return process.env.OPENAI_API_KEY || '';
  const uid = store.currentUser();
  if (uid === store.OWNER) return process.env.OPENAI_API_KEY || '';
  const u = users.getById(uid);
  if (u && u.useSharedKey) return process.env.OPENAI_API_KEY || '';
  return store.readJson(P.secrets, {}).OPENAI_API_KEY || '';
}
// Personal seed.json (gitignored) if present, else the shipped generic sample. Lets a fresh
// open-source clone boot with sample data and zero personal data committed.
const SEED_FILE = fs.existsSync(path.join(ROOT, 'seed.json')) ? path.join(ROOT, 'seed.json') : path.join(ROOT, 'seed.example.json');

// ---- data-safety knobs (read live so Settings changes take effect without restart) ----
// Auto-snapshots to keep (manual/phase snapshots are never auto-pruned).
const backupRetention = () => Math.max(1, Math.min(1000, parseInt(process.env.BACKUP_RETENTION || '50', 10) || 50));
// Refuse a full-array PUT that would drop more than this % of rows (0 disables the % guard;
// the empty-over-non-empty guard always applies). Default 20 = strict.
const putGuardPct = () => {
  const v = parseInt(process.env.PUT_GUARD_PCT, 10);
  return isNaN(v) ? 20 : Math.max(0, Math.min(100, v));
};

// ---------- store ----------
function ensureStore() {
  if (!fs.existsSync(P.data)) {
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    writeStore(seed);
    console.log(`[seed] No data.json found — seeded ${seed.length} requisitions from seed.json`);
  }
}
// Personal config (boards.json / watchlist.json) is gitignored; on a fresh clone, seed each from
// its shipped *.example.json so the app + scout boot with sample config and zero personal data.
function ensureConfig() {
  // Seed into the disk-aware owner store path (where the app + scout actually read boards/watchlist),
  // from the shipped *.example.json that always lives in the repo. Previously seeded into ROOT/agent,
  // which the app never reads when REQON_DATA_DIR points elsewhere.
  const owner = store.pathsFor(store.OWNER);
  for (const base of ['boards', 'watchlist']) {
    const real = owner[base];
    const example = path.join(ROOT, 'agent', base + '.example.json');
    try {
      if (!fs.existsSync(real) && fs.existsSync(example)) {
        fs.mkdirSync(path.dirname(real), { recursive: true });
        fs.copyFileSync(example, real);
        console.log(`[config] seeded ${base}.json from ${base}.example.json`);
      }
    } catch (e) {}
  }
}
function readStore() {
  try {
    return JSON.parse(fs.readFileSync(P.data, 'utf8'));
  } catch (e) {
    console.error('[store] read failed:', e.message);
    return [];
  }
}
function writeStore(rows) {
  // atomic write: write tmp then rename, so a crash mid-write never corrupts data.json
  const tmp = P.data + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2));
  fs.renameSync(tmp, P.data);
}
// ---------- row identity (WP-0 / sync foundation) ----------
// Every row carries a stable `id` (UUID) and `updatedAt` (ISO) so two stores can reconcile
// (per-row last-writer-wins). Deletes are tombstones ({deleted:true} + updatedAt), never splices,
// so a delete propagates through sync instead of the row resurrecting from the other side.
const nowIso = () => new Date().toISOString();
function touchRow(r) { r.updatedAt = nowIso(); r.syncedAt = r.updatedAt; return r; }
function ensureRowIdentity(rows) {
  let changed = 0;
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    if (!r.id) { r.id = crypto.randomUUID(); changed++; }
    // backfill updatedAt from `added` (date-only) so pre-sync rows sort older than fresh edits
    if (!r.updatedAt) { r.updatedAt = r.added ? (String(r.added).slice(0, 10) + 'T00:00:00.000Z') : nowIso(); changed++; }
    if (!r.syncedAt) { r.syncedAt = r.updatedAt; changed++; }
  }
  return changed;
}
const liveRows = rows => rows.filter(r => r && r.deleted !== true);

// Pure identity/scoring/sync logic now lives in core/crm-core.js — the single source shared by
// the server, the React Native app, and the Chrome extension (pinned by tests/vectors/).
const core = require('./core/crm-core');
const { reqKey, postingId, sameReq, expectedValue, computeTier, DEFAULT_TIER_THRESHOLDS } = core;
const { computeActionItems } = require('./lib/action-items');   // P2.1 unified action model
const { buildTimeline } = require('./lib/timeline');            // P2.5 per-role timeline
const { computePipelineHealth } = require('./lib/pipeline-health'); // P2.6 pipeline health score
const { computeFollowup } = require('./lib/followup');           // P2.8 follow-up recommendation
const jobs = require('./lib/jobs');                              // P2.9 unified background-job registry
const { computeAnalytics } = require('./lib/analytics');         // shared analytics (web + app parity)
// Tunable tier thresholds (Reqon "Tiers & rules" setting), persisted in boards.json. Merged over the
// canonical defaults so a partial override is fine and tiering stays consistent server-side.
function tierThresholds(boards) {
  const t = (boards && boards.tierThresholds && typeof boards.tierThresholds === 'object') ? boards.tierThresholds : {};
  return {
    aEv: t.aEv != null && !isNaN(+t.aEv) ? +t.aEv : DEFAULT_TIER_THRESHOLDS.aEv,
    aFit: t.aFit != null && !isNaN(+t.aFit) ? +t.aFit : DEFAULT_TIER_THRESHOLDS.aFit,
    aProb: t.aProb != null && !isNaN(+t.aProb) ? +t.aProb : DEFAULT_TIER_THRESHOLDS.aProb,
    bEv: t.bEv != null && !isNaN(+t.bEv) ? +t.bEv : DEFAULT_TIER_THRESHOLDS.bEv,
  };
}
// reconcileSync needs a uuid + clock; inject the server's so the change feed stamps real times.
const reconcileSync = (serverRows, clientRows) => core.reconcileSync(serverRows, clientRows, { genId: () => crypto.randomUUID(), now: nowIso });

// Merge-boundary policy (mirrors scout.py): enforce minTierToMerge + employment-type skips so
// ANY caller of /api/reqs/merge (scout, merge-into-crm.js, direct) honors the A/B-only invariant.
// Config-driven via boards.json (set minTierToMerge:"C" to allow everything). DEFAULT_SKIP_TYPES
// is defined later in the module but resolved at call time. Returns a reason string or null.
const TIER_RANK = { A: 3, B: 2, C: 1 };
function mergePolicyBlock(row, boards) {
  const minTier = ['A', 'B', 'C'].includes(String(boards.minTierToMerge || '').toUpperCase()) ? String(boards.minTierToMerge).toUpperCase() : 'B';
  const skip = Array.isArray(boards.skipEmploymentTypes) ? boards.skipEmploymentTypes : DEFAULT_SKIP_TYPES;
  const title = String(row.role || '').toLowerCase();
  const hit = skip.find(s => s && title.includes(String(s).toLowerCase()));
  if (hit) return 'employment-type:' + hit;
  const tier = row.tier || computeTier(row.fit, row.prob, tierThresholds(boards));
  if ((TIER_RANK[tier] || 0) < (TIER_RANK[minTier] || 2)) return 'below-tier:' + tier + '<' + minTier;
  return null;
}

// Append-only enrichment audit log — one JSON object per line. Every change reconstructable.
// Tenant-scoped (P.enrichLog) so one user's role history never bleeds into another's timeline.
function logEnrichment(entry) {
  try {
    const f = P.enrichLog;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, JSON.stringify(entry) + '\n');
  } catch (e) { console.error('[enrich-log]', e.message); }
}

// ---------- data-safety: snapshots, retention, change-log ----------
// Append-only board change-log — one JSON object per accepted PUT/restore. Keys + changed
// field names only (bounded; no full-row dumps), so any edit is reconstructable from the
// snapshots + this ledger.
function logChange(entry) {
  try {
    const f = P.changeLog;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, JSON.stringify(entry) + '\n');
  } catch (e) { console.error('[change-log]', e.message); }
}
function ensureBackupDir() { if (!fs.existsSync(P.backups)) fs.mkdirSync(P.backups, { recursive: true }); }
const backupStamp = () => new Date().toISOString().replace(/[:.]/g, '-');
// Copy the CURRENT store to backups/data.<kind>-<stamp>.json. kind 'auto' is the pre-overwrite
// safety snapshot (subject to retention); 'manual' is a user-triggered keep-forever snapshot.
function snapshotData(kind) {
  try {
    if (!fs.existsSync(P.data)) return null;
    ensureBackupDir();
    const stamp = backupStamp();
    const name = `data.${kind}-${stamp}.json`;
    fs.copyFileSync(P.data, path.join(P.backups, name));
    snapshotGuides(kind, stamp);   // bundle the attached interview guides alongside this snapshot
    return name;
  } catch (e) { console.error('[snapshot]', e.message); return null; }
}
// Interview guides live as files outside data.json, so a data snapshot alone would lose them.
// Bundle them (keyed by reqKey, so it's restorable) into a sibling guides.<kind>-<stamp>.json.
function snapshotGuides(kind, stamp) {
  try {
    const rows = readStore();
    const bundle = {};
    for (const r of rows) {
      if (!r.guideAt) continue;
      const k = reqKey(r);
      try { bundle[k] = { guideAt: r.guideAt, markdown: fs.readFileSync(guidePath(k), 'utf8') }; } catch (e) { /* file gone */ }
    }
    if (Object.keys(bundle).length) {
      fs.writeFileSync(path.join(P.backups, `guides.${kind}-${stamp}.json`), JSON.stringify(bundle, null, 2));
    }
  } catch (e) { console.error('[snapshot-guides]', e.message); }
}
// Restore the guide files from a guides bundle that sits beside a data snapshot (best-effort).
function restoreGuides(dataFileName) {
  try {
    const guidesName = dataFileName.replace(/^data\./, 'guides.');
    const fp = path.join(P.backups, guidesName);
    if (guidesName === dataFileName || !fs.existsSync(fp)) return 0;
    const bundle = JSON.parse(fs.readFileSync(fp, 'utf8'));
    fs.mkdirSync(GUIDE_DIR, { recursive: true });
    let n = 0;
    for (const [k, v] of Object.entries(bundle)) {
      if (v && typeof v.markdown === 'string') { fs.writeFileSync(guidePath(k), v.markdown, 'utf8'); n++; }
    }
    return n;
  } catch (e) { console.error('[restore-guides]', e.message); return 0; }
}
// Prune only auto snapshots down to the retention count (newest kept). Manual/phase/labeled
// backups are never touched.
function pruneAutoBackups() {
  try {
    ensureBackupDir();
    const keep = backupRetention();
    const byNewest = (re) => fs.readdirSync(P.backups)
      .filter(f => re.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(P.backups, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const x of byNewest(/^data\.auto-.*\.json$/).slice(keep)) { try { fs.unlinkSync(path.join(P.backups, x.f)); } catch (e) {} }
    // Prune the paired guide bundles to the same retention so they don't accumulate.
    for (const x of byNewest(/^guides\.auto-.*\.json$/).slice(keep)) { try { fs.unlinkSync(path.join(P.backups, x.f)); } catch (e) {} }
  } catch (e) { console.error('[prune]', e.message); }
}
// Diff two stores by reqKey -> { added:[keys], removed:[keys], changed:[{key, fields}] }.
function diffStores(before, after) {
  const bMap = new Map(before.map(r => [reqKey(r), r]));
  const aMap = new Map(after.map(r => [reqKey(r), r]));
  const added = [], removed = [], changed = [];
  for (const k of aMap.keys()) if (!bMap.has(k)) added.push(k);
  for (const k of bMap.keys()) if (!aMap.has(k)) removed.push(k);
  for (const [k, a] of aMap) {
    const b = bMap.get(k); if (!b) continue;
    const fields = [];
    for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) fields.push(f);
    }
    if (fields.length) changed.push({ key: k, fields });
  }
  return { added, removed, changed };
}
// Resolve a user-supplied backup filename safely inside P.backups (no path traversal).
function resolveBackup(name) {
  if (typeof name !== 'string' || !name) return null;
  if (path.basename(name) !== name) return null;            // had a separator -> reject
  if (!/^[\w.\-]+\.json$/.test(name)) return null;
  const fp = path.join(P.backups, name);
  if (path.dirname(path.resolve(fp)) !== path.resolve(P.backups)) return null;
  return fs.existsSync(fp) ? fp : null;
}
function backupKind(name) {
  if (/^data\.auto-/.test(name)) return 'auto';
  if (/^data\.manual-/.test(name)) return 'manual';
  if (/^data\.phase/.test(name)) return 'phase';
  return 'manual';
}

// ---------- app ----------
const app = express();

// ─── Render multi-service split ──────────────────────────────────────────────────────────────
// One codebase, four deployable roles selected by REQON_ROLE:
//   api       (api.reqon.app)       — backend + /health only; root returns JSON; no board UI.
//   cloud     (cloud.reqon.app)     — serves the board UI and reverse-proxies API paths to
//                                    REQON_API_BASE_URL.
//   marketing (reqon.app)           — public placeholder; no API, no data, no auth.
//   all       (local default)       — monolith (UI + API in one process); unchanged dev behavior.
const REQON_ROLE = (process.env.REQON_ROLE || 'all').toLowerCase();
const SERVE_API = REQON_ROLE === 'all' || REQON_ROLE === 'api';
const SERVE_UI  = REQON_ROLE === 'all' || REQON_ROLE === 'cloud';
const SERVE_MARKETING = REQON_ROLE === 'marketing';

// Liveness — always on, never gated. Render health checks hit this.
app.get('/health', (req, res) => {
  if (SERVE_MARKETING) return res.json({ ok: true, service: 'reqon-marketing', role: 'marketing' });
  res.json({ ok: true, service: SERVE_API ? 'reqon-api' : 'reqon-cloud', role: REQON_ROLE });
});

// Marketing role: serves marketing/index.html at / with self-hosted fonts + images.
// express.static handles all assets; the catch-all keeps the API surface unexposed.
if (SERVE_MARKETING) {
  app.use(express.static(path.join(__dirname, 'marketing')));
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'marketing', 'index.html')));
  // Block every other path — no API, auth, or write surface is reachable in this role.
  app.use((req, res) => res.status(404).type('text').send('Not found'));
}

// Cloud role proxies the dynamic paths to the API service. Registered BEFORE the body parser so the
// proxied request body streams through untouched. The browser stays same-origin with cloud.reqon.app
// (the board's ~70 /api calls, window.open, downloads, and links all keep working); cookies the API
// sets flow back through the proxy as cloud-origin cookies. No data/AI/secret logic runs in this role.
if (REQON_ROLE === 'cloud') {
  const target = (process.env.REQON_API_BASE_URL || '').replace(/\/$/, '');
  if (!target) { console.error('[cloud] REQON_API_BASE_URL is required when REQON_ROLE=cloud'); process.exit(1); }
  const { createProxyMiddleware } = require('http-proxy-middleware');
  // Mount at root with a pathFilter (NOT app.use('/api', …)) so Express doesn't strip the mount
  // segment — the full original path (/api/reqs, /login, …) is forwarded to the API intact.
  const proxy = createProxyMiddleware({
    target, changeOrigin: true, xfwd: true,
    pathFilter: (pathname) => /^\/(api|login|logout|guide|m|mobile|pair)(\/|$|\?)/.test(pathname) || pathname === '/api',
  });
  app.use(proxy);
  console.log('[cloud] proxying API paths -> ' + target);
}

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false }));
// ROADMAP-V3 PR0 slice 3: bind every request to its tenant namespace. Multi-user OFF -> owner
// (legacy paths; a no-op). resolveUserId/sessionUser below are function declarations (hoisted), so
// this closure resolves them at request time. AsyncLocalStorage propagates through async handlers.
app.use((req, res, next) => { const uid = resolveUserId(req); if (MULTIUSER()) store.ensureUserDir(uid); store.runAs(uid, () => next()); });

// ---------- auth (opt-in via APP_TOKEN; protects remote/tunnel exposure) ----------
// If APP_TOKEN is unset the server behaves exactly as before (open) — fine for a
// localhost-only box. Set APP_TOKEN before exposing it through a tunnel/port-forward.
// Mutable so the passphrase can be changed live from the board (POST /api/auth/passphrase) without
// a server restart — auth checks, the login cookie, and the pairing QR all read these.
let APP_TOKEN = process.env.APP_TOKEN || '';
const COOKIE = 'crm_auth';
const IMP_COOKIE = 'crm_imp';                 // admin marker cookie while impersonating a user
let TOKEN_HASH = APP_TOKEN ? crypto.createHash('sha256').update(APP_TOKEN).digest('hex') : '';
// Scoped, least-privilege token for automated ingestion (e.g. a ChatGPT Action). It authorizes
// ONLY append-only writes (POST /api/reqs/merge + /api/reqs/quickadd) — never reads, the profile
// (PII), settings, restore, or a full PUT. Leak blast radius = appending rows, nothing destructive.
// Read live from process.env so a Regenerate (which rewrites .env + process.env) takes effect
// immediately, no restart. Returns the sha256 hash to compare against, or '' when unset.
const ingestHash = () => process.env.INGEST_TOKEN ? crypto.createHash('sha256').update(process.env.INGEST_TOKEN).digest('hex') : '';
const INGEST_PATHS = new Set(['/reqs/merge', '/reqs/quickadd']); // relative to the /api mount

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
function safeEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}
function parseCookies(req) {
  const out = {}; const h = req.headers.cookie; if (!h) return out;
  h.split(';').forEach(p => { const i = p.indexOf('='); if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function isLoopback(req) {
  const ra = (req.socket && req.socket.remoteAddress) || '';
  return ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1';
}
// "Trusted local" = straight from loopback AND no proxy/tunnel headers, so cloudflared /
// Caddy / LAN traffic is NOT auto-trusted and must present the passphrase.
function tunneled(req) {
  return !!(req.headers['x-forwarded-for'] || req.headers['x-forwarded-host'] ||
    req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['cf-ray']);
}
const trustedLocal = req => isLoopback(req) && !tunneled(req);
// Multi-user: resolve the signed session cookie -> a live (non-disabled) user, or null.
function sessionUser(req) {
  const c = parseCookies(req)[COOKIE];
  const uid = c && users.verifySession(c);
  if (!uid) return null;
  const u = users.getById(uid);
  return (u && !u.disabled) ? u : null;
}
// Multi-user: resolve a per-user access token (X-CRM-Token / ?token) -> its user (extension/app/ingest).
function tokenUser(req) { const h = req.headers['x-crm-token'] || req.query.token; return h ? users.userByToken(h) : null; }
// The tenant id for this request: the session OR token user in multi-user mode, else the implicit owner.
function resolveUserId(req) { if (!MULTIUSER()) return store.OWNER; const u = sessionUser(req) || tokenUser(req); return u ? u.id : store.OWNER; }
function authed(req) {
  if (MULTIUSER()) return !!(sessionUser(req) || tokenUser(req));   // multi-user: valid user session OR per-user token
  if (!APP_TOKEN) return true;          // auth disabled -> original behavior
  if (trustedLocal(req)) return true;   // desktop board on the Mac itself
  const c = parseCookies(req)[COOKIE];
  if (c && safeEq(c, TOKEN_HASH)) return true;
  const h = req.headers['x-crm-token'] || req.query.token;
  if (h && safeEq(sha(h), TOKEN_HASH)) return true;
  return false;
}
const secureReq = req => (req.headers['x-forwarded-proto'] || '').includes('https');

function loginPage(nextUrl, msg, multi) {
  const nxt = String(nextUrl || (multi ? '/' : '/m')).replace(/"/g, '');
  const userField = multi ? `<input type="text" name="username" placeholder="Username" autofocus autocapitalize="none" autocomplete="username" style="margin-bottom:10px">` : '';
  return `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><meta name=theme-color content="#0e1217">
<title>Sign in</title><style>
body{background:#0e1217;color:#e9eef4;font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#161d26;border:1px solid #28333f;border-radius:16px;padding:26px;width:min(360px,90vw)}
h1{font-size:1.2rem;margin:0 0 4px}p{color:#7c8794;font-size:.84rem;margin:0 0 16px}
input{width:100%;box-sizing:border-box;background:#0e1217;border:1px solid #33414f;color:#e9eef4;border-radius:10px;padding:12px;font-size:16px;outline:none}
input:focus{border-color:#edc05a}button{width:100%;margin-top:12px;background:#edc05a;color:#15110a;border:0;border-radius:10px;padding:12px;font-weight:700;font-size:.95rem}
.err{color:#ef8268;font-size:.8rem;margin-top:10px}</style>
<form method="POST" action="/login">
<h1>Reqon</h1><p>${multi ? 'Sign in to your board.' : 'Enter the access passphrase.'}</p>
${userField}
<input type="password" name="passphrase" placeholder="${multi ? 'Password' : 'Passphrase'}" ${multi ? '' : 'autofocus'} autocomplete="current-password">
<input type="hidden" name="next" value="${nxt}">
<button type="submit">Sign in</button>
${msg ? `<div class="err">${msg}</div>` : ''}
</form>`;
}

app.get('/login', (req, res) => {
  if (MULTIUSER()) return res.type('html').send(loginPage(req.query.next, '', true));
  if (!APP_TOKEN) return res.status(503).send('Remote access disabled. Set APP_TOKEN env var and restart.');
  res.type('html').send(loginPage(req.query.next, ''));
});
app.post('/login', (req, res) => {
  const flags = ['HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=2592000'];
  if (secureReq(req)) flags.push('Secure');
  if (MULTIUSER()) {
    const next = (req.body.next || '/').startsWith('/') ? req.body.next : '/';
    const u = users.verify(req.body.username || '', req.body.passphrase || req.body.password || '');
    if (!u) return res.status(401).type('html').send(loginPage(next, 'Incorrect username or password.', true));
    res.setHeader('Set-Cookie', `${COOKIE}=${users.makeSession(u.id)}; ${flags.join('; ')}`);
    return res.redirect(next);
  }
  if (!APP_TOKEN) return res.status(503).send('Remote access disabled. Set APP_TOKEN env var and restart.');
  const ok = safeEq(sha(req.body.passphrase || ''), TOKEN_HASH);
  const next = (req.body.next || '/m').startsWith('/') ? req.body.next : '/m';
  if (!ok) return res.status(401).type('html').send(loginPage(next, 'Incorrect passphrase.'));
  res.setHeader('Set-Cookie', `${COOKIE}=${TOKEN_HASH}; ${flags.join('; ')}`);
  res.redirect(next);
});
app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
  res.redirect('/login');
});

// Mobile route — phone-first, read-only. Gated whenever APP_TOKEN is set; never served to a
// remote/tunneled client without a token.
function gateHtml(req, res, next) {
  if (authed(req)) return next();
  if (MULTIUSER()) return res.redirect('/login?next=' + encodeURIComponent(req.path));
  if (!APP_TOKEN) return res.status(503).send('Mobile/remote access is disabled. Set APP_TOKEN and restart to enable authenticated access.');
  return res.redirect('/login?next=' + encodeURIComponent(req.path));
}
// api role: root is a small JSON status, NOT the product UI (the board lives on cloud.reqon.app).
if (!SERVE_UI) {
  app.get('/', (req, res) => res.json({ ok: true, service: 'reqon-api', message: 'Reqon API. The product UI is at cloud.reqon.app.', health: '/health' }));
}

if (SERVE_UI) {
  app.get(['/m', '/mobile'], gateHtml, (req, res) => res.sendFile(path.join(ROOT, 'mobile.html')));

  // Desktop board: open on localhost (single-user), gated when reached remotely; in multi-user mode
  // a login is always required (no implicit owner from localhost).
  app.get(['/', '/index.html'], (req, res, next) => {
    if (authed(req) || (!APP_TOKEN && !MULTIUSER())) return next();
    return res.redirect('/login?next=/');
  }, (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

  // User guide — static help page (definitions, lanes, apply modes, integrations).
  app.get('/guide', (req, res, next) => {
    if (authed(req) || (!APP_TOKEN && !MULTIUSER())) return next();
    return res.redirect('/login?next=/guide');
  }, (req, res) => res.sendFile(path.join(ROOT, 'public', 'guide.html')));
}

// CORS. Two classes of caller:
//   • Credentialed browser apps (cloud.reqon.app, reqon.app, local dev) — must be on an ALLOWLIST to
//     receive Access-Control-Allow-Credentials (cookies). Configurable via CORS_ALLOWED_ORIGINS.
//   • Token-based capture tools (the bookmarklet on linkedin.com, the Chrome extension) — auth via
//     the X-CRM-Token header, NOT cookies, so echoing their origin WITHOUT credentials stays safe and
//     keeps them working from any page. Preflight (OPTIONS) must pass before the auth check below.
const CORS_ALLOWLIST = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ||
    'https://cloud.reqon.app,https://reqon.app,http://localhost:8787,http://localhost:3000,http://localhost:19006')
    .split(',').map((s) => s.trim()).filter(Boolean));
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    if (CORS_ALLOWLIST.has(origin)) res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CRM-Token');
  res.setHeader('Access-Control-Max-Age', '600');
  // Private Network Access: lets an https job page (e.g. linkedin.com) reach the local server
  // via the bookmarklet without Chrome blocking the preflight.
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------- company logos (server-acquired, shared cache) ----------
// The board shows a small company logo per req for polish. The SERVER fetches it once from a public
// favicon service and caches it on disk, SHARED across all users/boards (logos aren't private) — so
// the browser only ever talks to this origin, and the favicon source sees one request per company,
// ever. No SSRF risk: we only ever call google.com (the company is a query param, not a fetched URL).
// Unresolved logos return 204 → the board renders a colored monogram instead.
const LOGO_DIR = path.join(process.env.REQON_DATA_DIR ? path.resolve(process.env.REQON_DATA_DIR) : ROOT, 'agent', 'logos');
const LEGAL_SUFFIX = /\b(inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|gmbh|plc|sa|ag|holdings|group|technologies|labs|software|systems)\b\.?/gi;
function companyDomainGuess(name) {
  const slug = String(name || '').toLowerCase().replace(LEGAL_SUFFIX, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  return slug ? slug + '.com' : '';
}
const sanitizeDomain = (d) => String(d || '').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 100);
let logoFetching = new Set();   // in-flight de-dupe so a 200-row first paint doesn't stampede the source
app.get('/api/logo', async (req, res) => {
  const domain = sanitizeDomain(req.query.domain) || companyDomainGuess(req.query.company);
  if (!domain || !domain.includes('.')) return res.status(204).end();
  const file = path.join(LOGO_DIR, domain.replace(/[^a-z0-9.-]/g, '_') + '.png');
  const sendCached = () => { res.set('Cache-Control', 'public, max-age=604800'); res.type('png'); fs.createReadStream(file).pipe(res); };
  try { if (fs.statSync(file).size > 0) return sendCached(); } catch (e) { /* not cached yet */ }
  if (logoFetching.has(domain)) return res.status(204).end();   // another request is fetching it; render monogram this paint
  logoFetching.add(domain);
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    const buf = Buffer.from(await r.arrayBuffer());
    // Google returns a ~tiny default globe for unknown domains; treat very small payloads as "no logo".
    if (r.ok && buf.length > 200) {
      fs.mkdirSync(LOGO_DIR, { recursive: true });
      fs.writeFileSync(file, buf);
      return sendCached();
    }
    res.status(204).end();
  } catch (e) { res.status(204).end(); }
  finally { logoFetching.delete(domain); }
});

// Token-based login for extension / app clients: verifies username+password (multi-user) or
// passphrase (single-user) and returns a per-user API token for X-CRM-Token use.
// Placed BEFORE the /api auth gate — it is the credential exchange, not a protected resource.
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (MULTIUSER()) {
    const u = users.verify(String(username || ''), String(password || ''));
    if (!u) return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
    const tok = users.setToken(u.id);
    return res.json({ ok: true, token: tok, userId: u.id, displayName: u.displayName || u.username });
  }
  // Single-user: password field carries the APP_TOKEN passphrase.
  if (!APP_TOKEN) return res.json({ ok: true, token: '' });
  if (!safeEq(sha(String(password || '')), TOKEN_HASH)) return res.status(401).json({ ok: false, error: 'Invalid passphrase.' });
  return res.json({ ok: true, token: APP_TOKEN });
});

// Every /api request requires auth when APP_TOKEN is set — write endpoints are never open remotely.
// The scoped INGEST_TOKEN is accepted ONLY for append-only ingest routes (merge/quickadd), so an
// automated ingester (ChatGPT Action) can add roles but can't read PII, change settings, or wipe data.
app.use('/api', (req, res, next) => {
  if (authed(req)) return next();
  const ih = ingestHash();
  if (ih && req.method === 'POST' && INGEST_PATHS.has(req.path)) {
    const h = req.headers['x-crm-token'] || req.headers['x-ingest-token'] || req.query.token;
    if (h && safeEq(sha(h), ih)) return next();
  }
  res.status(401).json({ ok: false, error: 'auth required' });
});

if (SERVE_UI) app.use(express.static(path.join(ROOT, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, count: readStore().length, port: PORT, dataFile: P.data });
});

// ---------- multi-user: identity, accounts, onboarding (ROADMAP-V3 PR0 slices 3-4) ----------
function reqUser(req) { return MULTIUSER() ? sessionUser(req) : null; }
function requireAdmin(req, res, next) {
  if (!MULTIUSER()) return res.status(400).json({ ok: false, error: 'Multi-user is disabled.' });
  const u = sessionUser(req);
  if (!u || u.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin only.' });
  next();
}
// Who am I + onboarding state (drives the user menu + the first-run prompts).
app.get('/api/me', (req, res) => {
  if (!MULTIUSER()) return res.json({ ok: true, multiUser: false, user: { id: store.OWNER, displayName: 'Owner', role: 'admin', useSharedKey: true } });
  const u = sessionUser(req); if (!u) return res.status(401).json({ ok: false, error: 'not signed in' });
  const impId = users.verifySession(parseCookies(req)[IMP_COOKIE]);
  const imp = impId && users.getById(impId);
  res.json({ ok: true, multiUser: true, user: { id: u.id, username: u.username, displayName: u.displayName, role: u.role, useSharedKey: !!u.useSharedKey }, onboarded: readProfile().onboarded === true, impersonatedBy: (imp && imp.role === 'admin') ? imp.displayName || imp.username : null });
});
app.post('/api/me/password', (req, res) => {
  if (!MULTIUSER()) return res.status(400).json({ ok: false, error: 'Multi-user is disabled.' });
  const u = sessionUser(req); if (!u) return res.status(401).json({ ok: false, error: 'not signed in' });
  const b = req.body || {};
  if (!users.verifyPassword(b.current || '', users.getById(u.id).passwordHash)) return res.status(403).json({ ok: false, error: 'Current password is incorrect.' });
  try { users.update(u.id, { password: b.next || '' }); res.json({ ok: true }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
// Admin user management.
app.get('/api/users', requireAdmin, (req, res) => res.json({ ok: true, users: users.list() }));
app.post('/api/users', requireAdmin, async (req, res) => {
  const b = req.body || {};
  try {
    const u = users.create({ username: b.username, displayName: b.displayName, email: b.email, password: b.password, role: b.role, useSharedKey: !!b.useSharedKey });
    store.seedNewUser(u.id);
    let welcome = { skipped: 'not-requested' };
    if (b.sendWelcome !== false && u.email) { try { welcome = await sendWelcomeEmail(u, b.password); } catch (e) { welcome = { ok: false, error: e.message }; } }
    res.json({ ok: true, user: u, welcome });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
app.patch('/api/users/:id', requireAdmin, (req, res) => {
  const b = req.body || {}; const patch = {};
  for (const k of ['displayName', 'role', 'disabled', 'useSharedKey', 'password']) if (k in b) patch[k] = b[k];
  try { const u = users.update(req.params.id, patch); if (!u) return res.status(404).json({ ok: false, error: 'no such user' }); res.json({ ok: true, user: u }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const me = sessionUser(req); if (me && me.id === req.params.id) return res.status(400).json({ ok: false, error: "can't delete yourself" });
  res.json({ ok: users.remove(req.params.id) });
});
// Admin console (P0.7): per-user usage + server stats. Each user's numbers are read inside their
// own tenant context so the per-user namespaces stay the source of truth.
function dirSizeBytes(d) { let n = 0; try { for (const f of fs.readdirSync(d)) { const fp = path.join(d, f); const st = fs.statSync(fp); n += st.isDirectory() ? dirSizeBytes(fp) : st.size; } } catch (e) {} return n; }
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const rows = users.list().map(u => store.runAs(u.id, () => {
    const live = liveRows(readStore());
    const today = assistUsage(); const w30 = assistWindowStats(30); const rate = assistRatePer1M();
    const ss = readJsonSafe(P.scoutStatus, {}); const ds = readJsonSafe(P.digestState, {});
    let backups = 0; try { backups = fs.readdirSync(P.backups).filter(f => /^data\./.test(f)).length; } catch (e) {}
    return { id: u.id, displayName: u.displayName, email: u.email, role: u.role, disabled: u.disabled,
      onboarded: readProfile().onboarded === true, useSharedKey: u.useSharedKey, keyOwn: !u.useSharedKey && !!(store.readJson(P.secrets, {}).OPENAI_API_KEY),
      rows: live.length, applied: live.filter(r => r.status && r.status !== 'Not Applied').length,
      aiToday: { calls: today.calls || 0, tokens: today.tokens || 0 }, ai30dTokens: w30.tokens, ai30dCost: estCost(w30.tokens, rate),
      lastScout: ss.finishedAt || ss.startedAt || null, lastDigest: ds.lastSent || null,
      diskKB: Math.round(dirSizeBytes(store.pathsFor(u.id).dir) / 1024), backups };
  }));
  const server = { uptimeSec: Math.round(process.uptime()), node: process.version, userCount: rows.length,
    totalRows: rows.reduce((s, u) => s + u.rows, 0), shared30dTokens: rows.filter(u => u.useSharedKey).reduce((s, u) => s + u.ai30dTokens, 0),
    sharedKeySet: !!process.env.OPENAI_API_KEY, smtpConfigured: emailConfigured(), publicUrl: (process.env.PUBLIC_URL || '').trim() || null };
  res.json({ ok: true, server, users: rows });
});
// Append-only admin audit log (server-level): who did what to whom.
const ADMIN_AUDIT = path.join(DATA_DIR, 'agent', 'admin-audit.jsonl');
function logAdminAudit(entry) { try { fs.mkdirSync(path.dirname(ADMIN_AUDIT), { recursive: true }); fs.appendFileSync(ADMIN_AUDIT, JSON.stringify({ ts: nowIso(), ...entry }) + '\n'); } catch (e) {} }
// List a user's snapshots (admin restore picker).
app.get('/api/admin/users/:id/backups', requireAdmin, (req, res) => {
  const u = users.getById(req.params.id); if (!u) return res.status(404).json({ ok: false, error: 'no such user' });
  const list = store.runAs(u.id, () => {
    try { return fs.readdirSync(P.backups).filter(f => /^data\..*\.json$/.test(f)).map(f => { const st = fs.statSync(path.join(P.backups, f)); return { name: f, mtime: st.mtimeMs, kind: backupKind(f) }; }).sort((a, b) => b.mtime - a.mtime).slice(0, 50); } catch (e) { return []; }
  });
  res.json({ ok: true, backups: list });
});
// Admin-triggered per-user actions, all audited. Supports: digest, scout, restore, setCap.
app.post('/api/admin/users/:id/run', requireAdmin, (req, res) => {
  const u = users.getById(req.params.id); if (!u) return res.status(404).json({ ok: false, error: 'no such user' });
  const b = req.body || {}; const action = b.action; const adminId = (sessionUser(req) || {}).id;
  logAdminAudit({ admin: adminId, target: u.id, action });
  if (action === 'digest') { store.runAs(u.id, () => composeDigestAndDeliver()); return res.json({ ok: true, started: 'digest', user: u.id }); }
  if (action === 'scout') { const r = store.runAs(u.id, () => triggerScout('both', '')); return res.status(r.status || 200).json({ ...r, user: u.id }); }
  if (action === 'restore') { const r = store.runAs(u.id, () => restoreData(b.file)); return res.status(r.status || 200).json({ ...r, user: u.id }); }
  if (action === 'setCap') {
    const upd = {};
    if (b.monthlyTokens != null) upd.ASSIST_MONTHLY_TOKENS = String(Math.max(0, parseInt(b.monthlyTokens, 10) || 0));
    if (b.dailyCalls != null) upd.ASSIST_DAILY_CALLS = String(Math.max(0, Math.min(1000, parseInt(b.dailyCalls, 10) || 0)));
    store.runAs(u.id, () => setUserCfg(upd));
    return res.json({ ok: true, user: u.id, caps: upd });
  }
  return res.status(400).json({ ok: false, error: 'unknown action (digest|scout|restore|setCap)' });
});
// Impersonate-for-support: an admin assumes a user's session (audited), with a marker cookie so they
// can return to their own account. Signed sessions are stateless, so we re-derive both sides by id.
app.post('/api/admin/impersonate/:id', requireAdmin, (req, res) => {
  const target = users.getById(req.params.id); if (!target) return res.status(404).json({ ok: false, error: 'no such user' });
  const admin = sessionUser(req);
  logAdminAudit({ admin: admin.id, target: target.id, action: 'impersonate-start' });
  const flags = ['HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=2592000']; if (secureReq(req)) flags.push('Secure');
  res.setHeader('Set-Cookie', [`${COOKIE}=${users.makeSession(target.id)}; ${flags.join('; ')}`, `${IMP_COOKIE}=${users.makeSession(admin.id)}; ${flags.join('; ')}`]);
  res.json({ ok: true, impersonating: target.id, asAdmin: admin.id });
});
app.post('/api/admin/stop-impersonate', (req, res) => {
  const adminId = users.verifySession(parseCookies(req)[IMP_COOKIE]);
  const admin = adminId && users.getById(adminId);
  if (!admin || admin.role !== 'admin') return res.status(400).json({ ok: false, error: 'not impersonating' });
  logAdminAudit({ admin: admin.id, target: store.currentUser(), action: 'impersonate-stop' });
  const flags = ['HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=2592000']; if (secureReq(req)) flags.push('Secure');
  res.setHeader('Set-Cookie', [`${COOKIE}=${users.makeSession(admin.id)}; ${flags.join('; ')}`, `${IMP_COOKIE}=; HttpOnly; Path=/; Max-Age=0`]);
  res.json({ ok: true, restored: admin.id });
});
// Onboarding (Q2): brand-new users answer a couple of prompts; we save their search terms + mark
// them onboarded so their first board view is relevant. Résumé upload reuses /api/profile/resume;
// the first scout is kicked off by the client via /api/scout/run after this completes.
app.get('/api/onboarding', (req, res) => {
  const prof = readProfile(); const rows = liveRows(readStore());
  res.json({ ok: true, needed: MULTIUSER() && prof.onboarded !== true && rows.length === 0,
    roleTerms: prof.roleTerms || [], hasResume: !!(prof.workHistory && prof.workHistory.length) });
});
app.post('/api/onboarding/complete', (req, res) => {
  const b = req.body || {};
  const titles = Array.isArray(b.roleTerms) ? b.roleTerms.map(String).map(s => s.trim()).filter(Boolean).slice(0, 12) : [];
  try {
    const watch = readJsonSafe(P.watchlist, {}); watch.searchTerms = watch.searchTerms || {};
    if (titles.length) watch.searchTerms.titles = titles;
    if (Array.isArray(b.keywords) && b.keywords.length) watch.searchTerms.keywords = b.keywords.map(String).map(s => s.trim()).filter(Boolean);
    if (b.salaryTarget != null && !isNaN(+b.salaryTarget)) watch.searchTerms.salaryTarget = Math.max(0, Math.round(+b.salaryTarget));
    writeJsonPretty(P.watchlist, watch);
    if (typeof b.remoteOnly === 'boolean') { const boards = readJsonSafe(P.boards, {}); boards.remoteOnly = b.remoteOnly; writeJsonPretty(P.boards, boards); }
    const prof = readProfile(); prof.onboarded = true; if (titles.length) prof.roleTerms = titles;
    writeJsonPretty(P.profile, prof);
    res.json({ ok: true, onboarded: true, titles });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Device pairing: package this server's LAN URL + passphrase into one QR/code the app can
// scan or paste, instead of hand-typing both. Auth-gated like every /api route (when APP_TOKEN
// is set, only an authed board session — i.e. someone who already knows the passphrase — can
// fetch it), so the QR never exposes anything the requester hasn't already proven they have.
function lanBase() {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets).flat().find(n => n && n.family === 'IPv4' && !n.internal);
  return `http://${(lan && lan.address) || 'localhost'}:${PORT}`;
}
// The URL to bake into the pairing QR/code. Prefer (1) an explicit PUBLIC_URL env (e.g.
// https://dhartung02.dynet.com once Caddy fronts TLS), then (2) the proxy's forwarded host/proto
// when the board is reached through Caddy (so the app pairs to the public https origin, no port),
// else (3) the LAN http URL for same-network pairing. iOS ATS needs the https form.
function pairBase(req) {
  const explicit = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const fHost = req && (req.headers['x-forwarded-host'] || '');
  if (fHost) {
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    return `${proto}://${String(fHost).split(',')[0].trim()}`;
  }
  return lanBase();
}
app.get('/api/pair', async (req, res) => {
  // Fully guarded: the synchronous prep (lanBase + encodePairing) used to sit OUTSIDE the
  // promise's .catch, so any sync throw (e.g. an older core/crm-core.js missing encodePairing)
  // escaped to Express's default handler, which replies with an HTML error page — the board then
  // tried to JSON.parse "<!DOCTYPE…>" and surfaced "Unexpected token '<'". Wrapping everything in
  // try/catch guarantees this endpoint ALWAYS returns JSON.
  try {
    const url = pairBase(req);
    if (typeof core.encodePairing !== 'function') {
      throw new Error('core.encodePairing unavailable — server is running a stale build; restart it.');
    }
    // Multi-user: bake THIS user's per-user token so the paired device binds to their board
    // (regenerates the token — re-pairing supersedes old devices, like a passphrase change).
    const u = MULTIUSER() ? sessionUser(req) : null;
    const tok = u ? users.setToken(u.id) : APP_TOKEN;
    const code = core.encodePairing(url, tok);
    const qrSvg = await QRCode.toString(code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.json({ ok: true, url, hasToken: !!tok, code, qrSvg, user: u ? u.id : null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

app.get('/api/reqs', (req, res) => {
  res.json(readStore());
});

// Shared analytics (web + app parity) — computed once on the server so both surfaces show identical
// numbers. The app fetches this when a server is configured, else falls back to its local metrics.
app.get('/api/analytics', (req, res) => {
  try { res.json({ ok: true, ...computeAnalytics(readStore(), { today: new Date().toISOString().slice(0, 10), now: nowIso() }) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Pipeline health score (P2.6) — a band + main risk + recommended next actions, deterministic.
app.get('/api/pipeline-health', (req, res) => {
  try { res.json({ ok: true, ...computePipelineHealth(readStore(), { today: new Date().toISOString().slice(0, 10) }) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Unified, deterministic action items (P2.1) — derived from the live store + config, consumed by
// web / app / extension. Filter with ?surface=web|app|extension and/or ?type=apply_next,...
app.get('/api/action-items', (req, res) => {
  try {
    const w30 = assistWindowStats(30); const rate = assistRatePer1M(); const budget = assistMonthlyBudget();
    const cost30 = estCost(w30.tokens, rate);
    const ctx = {
      today: new Date().toISOString().slice(0, 10),
      profile: readProfile(),
      scoutStatus: readJsonSafe(P.scoutStatus, {}),
      sourceHealth: readJsonSafe(P.sourceHealth, {}),
      mailConfigured: !!(cfg('GMAIL_USER') && cfg('GMAIL_APP_PASSWORD')),
      remoteOnly: readJsonSafe(P.boards, {}).remoteOnly !== false,
      assist: { tokens30d: w30.tokens, budgetPct: (budget && cost30 != null) ? Math.round((cost30 / budget) * 100) : null },
    };
    let items = computeActionItems(readStore(), ctx);
    const surface = String(req.query.surface || '').trim();
    if (surface) items = items.filter(it => (it.surfaces || []).includes(surface));
    const types = String(req.query.type || '').split(',').map(s => s.trim()).filter(Boolean);
    if (types.length) items = items.filter(it => types.includes(it.type));
    const counts = items.reduce((m, it) => { m[it.severity] = (m[it.severity] || 0) + 1; return m; }, {});
    res.json({ ok: true, items, total: items.length, counts, generatedAt: nowIso() });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Unified background-job registry (P2.9) — observe scout/enrichment/gmail/guide/digest/backup
// without reading logs. ?type= / ?active=1 filters.
app.get('/api/jobs', (req, res) => {
  const opts = {};
  if (req.query.type) opts.type = String(req.query.type);
  if (req.query.active === '1' || req.query.active === 'true') opts.active = true;
  res.json({ ok: true, jobs: jobs.list(opts), counts: jobs.counts() });
});
app.get('/api/jobs/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ ok: false, error: 'no such job' });
  res.json({ ok: true, job: j });
});
app.post('/api/jobs/:id/cancel', (req, res) => {
  const r = jobs.cancel(req.params.id);
  res.status(r.ok ? 200 : 400).json(r);
});
// Trigger a job by type for the dispatchable kinds (others have their own parameterized endpoints).
app.post('/api/jobs', (req, res) => {
  const type = String((req.body || {}).type || '');
  if (type === 'scout') { const r = triggerScout('both', ''); return res.status(r.status || 200).json(r); }
  if (type === 'digest') { composeDigestAndDeliver(); return res.json({ ok: true, started: 'digest' }); }
  if (type === 'backup') { const job = jobs.create('backup', { label: 'Manual backup' }); try { const f = snapshotData('manual'); jobs.finish(job.id, { file: f }); return res.json({ ok: true, started: 'backup', file: f }); } catch (e) { jobs.fail(job.id, e.message); return res.status(500).json({ ok: false, error: e.message }); } }
  return res.status(400).json({ ok: false, error: 'Type not dispatchable here (use the dedicated endpoint): ' + (type || '(none)') });
});

// Full replace — the board sends its whole state on every debounced save.
// Hardened: snapshots the previous store before overwriting, refuses likely-corruption saves
// (empty over a non-empty store, or a >guard% row drop) unless ?allowShrink=1, prunes auto
// snapshots to the retention count, and appends a change-log entry.
app.put('/api/reqs', (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ ok: false, error: 'Expected a JSON array of requisitions.' });
  const current = readStore();
  const allowShrink = req.query.allowShrink === '1' || req.query.allowShrink === 'true';
  if (current.length > 0 && !allowShrink) {
    if (rows.length === 0) {
      return res.status(409).json({ ok: false, guard: 'empty', before: current.length, incoming: 0,
        error: 'Refused: empty save over a non-empty store (likely corruption). Retry your edit, or pass ?allowShrink=1 to force.' });
    }
    const pct = putGuardPct();
    if (pct > 0) {
      const minAllowed = Math.ceil(current.length * (1 - pct / 100));
      if (rows.length < minAllowed) {
        return res.status(409).json({ ok: false, guard: 'shrink', before: current.length, incoming: rows.length, minAllowed, pct,
          error: `Refused: save would drop ${current.length - rows.length} of ${current.length} rows (>${pct}% shrink). Pass ?allowShrink=1 to force.` });
      }
    }
  }
  // WP-0 identity safety net: new rows get ids; changed rows whose client didn't stamp a newer
  // updatedAt get touched server-side, so per-row LWW always has an honest timestamp.
  const byId = new Map(current.filter(r => r.id).map(r => [r.id, r]));
  const stripTs = r => { const { updatedAt, syncedAt, ...rest } = r; return JSON.stringify(rest); };
  for (const r of rows) {
    if (!r.id) { r.id = crypto.randomUUID(); r.updatedAt = r.updatedAt || nowIso(); r.syncedAt = nowIso(); continue; }
    const cur = byId.get(r.id);
    if (!cur) { r.updatedAt = r.updatedAt || nowIso(); r.syncedAt = nowIso(); continue; }
    if (stripTs(cur) !== stripTs(r)) {
      r.syncedAt = nowIso();   // server receive time — the delta-pull (`since`) feed
      if (!r.updatedAt || r.updatedAt <= (cur.updatedAt || '')) r.updatedAt = nowIso();   // LWW safety net
    }
  }
  try {
    if (current.length > 0) snapshotData('auto');   // pre-overwrite safety snapshot
    writeStore(rows);
    pruneAutoBackups();
    const d = diffStores(current, rows);
    logChange({ ts: new Date().toISOString(), action: 'put', before: current.length, after: rows.length, added: d.added, removed: d.removed, changed: d.changed });
    // Auto-build interview guides for rows that just entered an interview stage via the board's
    // whole-state save (the per-row PATCH path triggers separately). Background; bounded to genuine
    // transitions (prev status not already an interview stage).
    if (aiKey() && assistEnabled()) {
      const beforeStatus = new Map(current.map((r) => [reqKey(r), r.status]));
      for (const r of rows) {
        const k = reqKey(r);
        if (INTERVIEW_STAGES.has(r.status) && !r.guideAt && !INTERVIEW_STAGES.has(beforeStatus.get(k))) {
          buildAndStoreGuide(k).catch((e) => console.error('[interview-guide]', e.message));
        }
      }
    }
    res.json({ ok: true, count: rows.length });
  } catch (e) {
    console.error('[PUT /api/reqs]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Append-only merge by company+role. NEVER overwrites existing tracking edits.
// Accepts either a bare JSON array (local tooling) or an object { roles: [...] } /
// { requisitions: [...] } — GPT Actions require an object request body, not a top-level array.
app.post('/api/reqs/merge', (req, res) => {
  const b = req.body;
  const incoming = Array.isArray(b) ? b : (b && (Array.isArray(b.roles) ? b.roles : (Array.isArray(b.requisitions) ? b.requisitions : null)));
  if (!Array.isArray(incoming)) return res.status(400).json({ ok: false, error: 'Expected a JSON array, or an object { "roles": [...] }.' });
  const rows = readStore();
  const boards = readJsonSafe(P.boards, {});
  let added = 0, skippedPolicy = 0;
  const addedKeys = [], policyDrops = [];
  for (const x of incoming) {
    const k = reqKey(x);
    if (!k || k === '|') continue;
    if (!rows.some(r => sameReq(r, x))) {   // req-id aware: distinct same-title postings coexist
      // default any missing tracking fields so merged rows render cleanly
      const row = Object.assign({
        status: 'Not Applied', applied: '', interview: '', recruiter: '', referral: 'No',
        resume: '—', cover: 'No', followup: '', lastcontact: '', next: '', source: '',
        added: new Date().toISOString().slice(0, 10)
      }, x);
      if (!row.id) row.id = crypto.randomUUID();
      row.updatedAt = row.updatedAt || nowIso();
      // enforce the A/B-only + employment policy at the merge boundary (config-driven)
      const block = mergePolicyBlock(row, boards);
      if (block) { skippedPolicy++; policyDrops.push({ key: k, reason: block }); continue; }
      if (!row.applyMode) row.applyMode = inferApplyMode(row, boards);   // Phase 4: stamp how to apply
      rows.push(row);
      added++;
      addedKeys.push(k);
    }
  }
  try {
    writeStore(rows);
    res.json({ ok: true, added, skipped: incoming.length - added, skippedByPolicy: skippedPolicy, policyDrops, total: rows.length, addedKeys });
  } catch (e) {
    console.error('[POST /api/reqs/merge]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- quick-add (capture tools: bookmarklet, iOS Shortcut, /m form) ----------
// Accepts a single partial role (URL-only is fine). Builds an UNSCORED lead row with safe
// defaults (conf=unverified, reqCheck=lead) — no schema change. Dedupes by company|role.
const hostName = u => { try { return new URL(u).hostname.replace(/^www\./, '').split('.')[0]; } catch { return ''; } };
// Parse a shared page <title> into company / role / location. Confident on LinkedIn's
// "Company hiring Role in Location | LinkedIn" form; falls back gracefully — if it can't
// confidently split, the cleaned title becomes the role (company then defaults to the URL host).
function parseTitle(title) {
  const raw = String(title || '').trim();
  const wasLinkedIn = /\|\s*LinkedIn\b/i.test(raw);
  let t = raw
    .replace(/^\(\d+\)\s*/, '')                                          // strip "(3) " unread-count prefix
    .replace(/\s*\|\s*LinkedIn.*$/i, '')                                 // strip "| LinkedIn …"
    .replace(/\s*\|\s*(Indeed|Glassdoor|Greenhouse|Lever|Workday|Ashby|SmartRecruiters|iCIMS|ZipRecruiter).*$/i, '')
    .trim();
  let company = '', role = '', location = '', m;
  if ((m = t.match(/^(.{2,60}?)\s+hiring\s+(.+)$/i))) {                   // "Company hiring <rest> [in Location]"
    company = m[1].trim().replace(/,$/, '');
    const rest = m[2].trim();
    const im = rest.match(/^(.*\S)\s+in\s+(.+)$/i);                       // greedy -> split on the LAST " in "
    if (im) { role = im[1].trim(); location = im[2].trim(); }
    else { role = rest; }
  } else if (t.includes(' | ')) {                                        // LinkedIn job-view "Role | Company"
    const parts = t.split(' | ').map(s => s.trim()).filter(Boolean);
    role = parts[0]; company = parts.length > 1 ? parts[parts.length - 1] : '';
  } else if (wasLinkedIn && /\s[–—-]\s/.test(t)) {                       // LinkedIn "Role - Company" page title
    const idx = Math.max(t.lastIndexOf(' - '), t.lastIndexOf(' – '), t.lastIndexOf(' — '));
    role = t.slice(0, idx).trim();
    company = t.slice(idx + 3).trim();
  } else {
    role = t;                                                            // low confidence: keep cleaned title as role
  }
  return { company, role, location };
}
// Aggregators / job boards are never the employer — don't let them become the company.
const AGGREGATOR_HOSTS = new Set(['linkedin', 'indeed', 'glassdoor', 'ziprecruiter', 'google', 'lnkd', 'dice', 'monster']);

app.post('/api/reqs/quickadd', (req, res) => {
  const b = req.body || {};
  const link = b.link || b.url || '';
  let company = (b.company || '').trim();
  let role = (b.role || '').trim();
  let location = (b.location || '').trim();
  if ((!company || !role) && b.title) {
    const p = parseTitle(b.title);
    company = company || p.company;
    role = role || p.role;
    location = location || p.location;
  }
  // Never stamp an aggregator/job-board host (linkedin, indeed, …) as the company — leave it Unknown
  // so it reads as a lead to enrich, not a fake employer.
  if (company && AGGREGATOR_HOSTS.has(company.toLowerCase())) company = '';
  const host = hostName(link);
  if (!company) company = (host && !AGGREGATOR_HOSTS.has(host.toLowerCase())) ? host : 'Unknown';
  if (!role) role = b.title ? String(b.title).trim().slice(0, 140) : 'Untitled lead';
  if (!link && !b.title && !b.company) {
    return res.status(400).json({ ok: false, error: 'Provide at least a link or a title.' });
  }
  const today = new Date().toISOString().slice(0, 10);
  const source = b.source || 'quick-add';
  const row = {
    company, role, sector: b.sector || '', salary: b.salary || '', location, remote: b.remote || '',
    fit: '', prob: '', tier: 'C', conf: 'unverified',
    link, notes: b.notes || `Quick-add via ${source}. Unscored lead — review and score.`,
    status: 'Not Applied', applied: '', interview: '', recruiter: '', referral: 'No',
    resume: '—', cover: 'No', followup: '', lastcontact: '', next: '',
    added: today, reqCheck: 'lead', reqCheckNote: `Quick-add via ${source}; verify live + score.`, reqCheckedOn: today,
    source: b.sourceType || 'manual',   // origin for the source filter (ATS sources are stamped by the scout)
    needsEnrichment: true,   // Tier 1: every fresh capture is queued for deep enrichment
    id: crypto.randomUUID(), updatedAt: nowIso()
  };
  row.applyMode = inferApplyMode(row, readJsonSafe(P.boards, {}));   // Phase 4
  const rows = readStore();
  if (rows.some(r => sameReq(r, row))) {   // req-id aware: same title at one company is only a dup when the posting id matches
    return res.json({ ok: true, added: 0, skipped: 1, duplicate: true, company, role, total: rows.length });
  }
  rows.push(row);
  try {
    writeStore(rows);
    res.json({ ok: true, added: 1, company, role, tier: row.tier, total: rows.length });
    // fire-and-forget: enrich from the live posting (real company/role/location + AI score)
    if (row.link && b.enrich !== false) backgroundEnrich(reqKey(row));
  } catch (e) {
    console.error('[POST /api/reqs/quickadd]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- apply-mode backfill (Phase 4) ----------
// Stamp applyMode (inferred from source) onto rows that lack it. Never overwrites an existing
// value. Snapshots before writing. Idempotent.
app.post('/api/applymode/backfill', (req, res) => {
  const boards = readJsonSafe(P.boards, {});
  const rows = readStore();
  const before = rows.length;
  let stamped = 0;
  for (const r of rows) { if (!r.applyMode) { r.applyMode = inferApplyMode(r, boards); stamped++; } }
  if (stamped) {
    snapshotData('auto');
    writeStore(rows);
    pruneAutoBackups();
    logChange({ ts: new Date().toISOString(), action: 'applymode-backfill', before, after: rows.length, stamped });
  }
  res.json({ ok: true, stamped, total: rows.length });
});

// ---------- candidate profile + narrative library (Phase 5) ----------
const PROFILE_PYTHON = path.join(ROOT, 'agent', 'profile-from-resume.py');
function readProfile() {
  // personal profile.json (gitignored) if present, else the shipped generic example
  let p = readJsonSafe(P.profile, null);
  if (p == null) p = readJsonSafe(path.join(ROOT, 'agent', 'profile.example.json'), {});
  return Object.assign(
    { applicant: {}, seniority: [], roleTerms: [], industries: [], sectors: [], keywords: [], narratives: [], remoteOnly: true },
    p
  );
}
function snapshotProfile() {
  try { if (fs.existsSync(P.profile)) { ensureBackupDir(); const n = `profile.${backupStamp()}.json`; fs.copyFileSync(P.profile, path.join(P.backups, n)); return n; } } catch (e) {}
  return null;
}
const PROFILE_ARRAY_FIELDS = ['seniority', 'roleTerms', 'industries', 'sectors', 'priorityKeywords', 'secondaryKeywords'];

// Fold the user's keyword-weight overrides onto a parsed baseline. weight<=0 suppresses a term;
// a kw not in the baseline is added (default weight 3 = "emphasized" for the scout). The result is
// written to profile.keywords, which the server scout (scout.py) consumes — so overrides change
// what scores high. Durable across résumé re-parse (parsedKeywords holds the untouched baseline).
function applyKeywordOverrides(baseline, overrides) {
  const base = Array.isArray(baseline) ? baseline.filter(k => k && k.kw).map(k => ({ kw: String(k.kw), weight: +k.weight || 1 })) : [];
  const map = new Map(base.map(k => [k.kw.toLowerCase(), { kw: k.kw, weight: k.weight }]));
  for (const o of (Array.isArray(overrides) ? overrides : [])) {
    if (!o || !o.kw) continue;
    const kw = String(o.kw).trim(); if (!kw) continue;
    const key = kw.toLowerCase();
    const w = +o.weight;
    if (!isNaN(w) && w <= 0) { map.delete(key); continue; }       // suppress
    const cur = map.get(key);
    if (cur) cur.weight = isNaN(w) ? cur.weight : w;              // re-weight existing
    else map.set(key, { kw, weight: isNaN(w) ? 3 : w });         // add new emphasized term
  }
  return Array.from(map.values()).sort((a, b) => b.weight - a.weight);
}

app.get('/api/profile', (req, res) => res.json({ ok: true, profile: readProfile() }));

app.put('/api/profile', (req, res) => {
  const b = req.body || {};
  const cur = readProfile();
  const next = Object.assign({}, cur);
  if (b.applicant && typeof b.applicant === 'object') next.applicant = Object.assign({}, cur.applicant, b.applicant);
  for (const k of PROFILE_ARRAY_FIELDS) {
    if (Array.isArray(b[k])) next[k] = b[k].map(String).map(s => s.trim()).filter(Boolean);
  }
  if (Array.isArray(b.keywords)) next.keywords = b.keywords.filter(x => x && x.kw).map(x => ({ kw: String(x.kw), weight: +x.weight || 1 }));
  // Editable keyword-weight overrides (durable preference layer). Stored, then folded onto the
  // parsed baseline so profile.keywords (what the scout scores on) reflects the user's tuning.
  if (Array.isArray(b.keywordOverrides)) {
    next.keywordOverrides = b.keywordOverrides
      .filter(x => x && x.kw)
      .map(x => ({ kw: String(x.kw).trim(), weight: +x.weight || 0 }))
      .filter(x => x.kw);
    const baseline = (Array.isArray(cur.parsedKeywords) && cur.parsedKeywords.length) ? cur.parsedKeywords : cur.keywords;
    next.keywords = applyKeywordOverrides(baseline, next.keywordOverrides);
  }
  if (Array.isArray(b.narratives)) {
    next.narratives = b.narratives.filter(n => n && (n.title || n.body)).map(n => ({
      id: n.id || ('n' + crypto.randomBytes(4).toString('hex')),
      title: String(n.title || ''), body: String(n.body || ''),
      tags: Array.isArray(n.tags) ? n.tags.map(String).map(s => s.trim()).filter(Boolean) : []
    }));
  }
  if (typeof b.remoteOnly === 'boolean') next.remoteOnly = b.remoteOnly;
  // GitHub URL + professional summary (free text). github also mirrored onto applicant for the app.
  if (typeof b.github === 'string') { next.github = b.github.trim(); next.applicant = Object.assign({}, next.applicant, { github: b.github.trim() }); }
  if (typeof b.summary === 'string') next.summary = b.summary.trim();
  // Rich CV sections (Reqon app): structured entries + simple lists + EEO (stored only — never
  // auto-submitted; the apply-assist deliberately skips demographic fields).
  const objArr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : null);
  for (const k of ['education', 'workHistory']) { const a = objArr(b[k]); if (a) next[k] = a; }
  for (const k of ['awards', 'certs', 'volunteer']) {
    if (Array.isArray(b[k])) next[k] = b[k].map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (b.eeo && typeof b.eeo === 'object') next.eeo = Object.assign({}, cur.eeo, b.eeo);
  // Saved-answers library (Reqon): reusable Q&A + saved drafts the apply-assist / AI can pull from.
  if (Array.isArray(b.answers)) {
    next.answers = b.answers
      .filter((x) => x && typeof x === 'object' && (x.q || x.a))
      .map((x) => ({
        id: x.id ? String(x.id) : ('a' + crypto.randomBytes(4).toString('hex')),
        q: String(x.q || ''),
        a: String(x.a || ''),
        tags: Array.isArray(x.tags) ? x.tags.map(String).map((s) => s.trim()).filter(Boolean) : [],
      }));
  }
  try { snapshotProfile(); writeJsonPretty(P.profile, next); res.json({ ok: true, profile: next }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Resume upload (base64 JSON; no multipart dep). Snapshots profile, regenerates via
// profile-from-resume.py, then re-merges the user's manual fields + narratives.
app.post('/api/profile/resume', (req, res) => {
  const b = req.body || {};
  const fn = String(b.filename || '').trim();
  if (!/\.(docx|txt|md|pdf)$/i.test(fn)) return res.status(400).json({ ok: false, error: 'Use a .docx / .txt / .md / .pdf resume.' });
  if (typeof b.dataBase64 !== 'string' || !b.dataBase64) return res.status(400).json({ ok: false, error: 'Missing file data.' });
  let buf; try { buf = Buffer.from(b.dataBase64, 'base64'); } catch (e) { return res.status(400).json({ ok: false, error: 'Bad base64.' }); }
  if (!buf.length || buf.length > 8 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Empty or too-large file (8MB max).' });
  ensureBackupDir();
  const tmpPath = path.join(P.backups, 'resume-upload-' + backupStamp() + path.extname(fn).toLowerCase());
  try { fs.writeFileSync(tmpPath, buf); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  const preserved = readProfile();
  snapshotProfile();
  let child, done = false;
  const finish = (status, payload) => { if (done) return; done = true; try { fs.unlinkSync(tmpPath); } catch (e) {} res.status(status).json(payload); };
  try { child = spawn(resolvePython(), [PROFILE_PYTHON, tmpPath], { cwd: ROOT, env: tenantEnv() }); }
  catch (e) { return finish(500, { ok: false, error: 'python launch failed: ' + e.message }); }
  const killer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} }, 30000);
  let err = '';
  child.stderr && child.stderr.on('data', d => { err += d; });
  child.once('error', e => { clearTimeout(killer); finish(500, { ok: false, error: 'python launch failed: ' + (e.message || e) }); });
  child.once('exit', code => {
    clearTimeout(killer);
    if (code !== 0) return finish(500, { ok: false, error: 'resume parse failed: ' + (err.trim() || ('exit ' + code)) });
    const regen = readProfile();   // profile-from-resume.py rewrote applicant/seniority/keywords
    // Keep manually-curated sections the parser doesn't produce (incl. the Reqon CV + answers library).
    // NOTE: workHistory + education are intentionally NOT preserved — the parser now extracts them,
    // so a résumé re-upload must refresh those sections rather than re-apply the prior (stale) parse.
    // Manual edits to those sections persist between uploads via PUT /api/profile.
    for (const k of ['roleTerms', 'industries', 'sectors', 'priorityKeywords', 'secondaryKeywords', 'narratives',
      'awards', 'certs', 'volunteer', 'answers']) {
      if (Array.isArray(preserved[k]) && preserved[k].length) regen[k] = preserved[k];
    }
    if (preserved.eeo && typeof preserved.eeo === 'object') regen.eeo = preserved.eeo;
    // Keyword-weight overrides are a durable preference layer: keep the fresh parse as the baseline
    // (parsedKeywords), re-apply the user's overrides on top, and write the folded result to
    // keywords so the scout keeps honoring the tuning after a re-upload.
    regen.parsedKeywords = Array.isArray(regen.keywords) ? regen.keywords : [];
    if (Array.isArray(preserved.keywordOverrides) && preserved.keywordOverrides.length) {
      regen.keywordOverrides = preserved.keywordOverrides;
      regen.keywords = applyKeywordOverrides(regen.parsedKeywords, preserved.keywordOverrides);
    }
    try { writeJsonPretty(P.profile, regen); } catch (e) { return finish(500, { ok: false, error: e.message }); }
    finish(200, { ok: true, profile: regen });
  });
});

// ---------- AI application assistant (Phase 6) ----------
// Per-req cover-note / screening-answer drafts, grounded in the candidate profile + narrative
// library + JD. Budget-gated (daily call cap + per-call token cap), logged, editable, NEVER
// auto-submitted. Optional: needs OPENAI_API_KEY and ASSIST_ENABLED != 'false'.
const assistEnabled = () => cfg('ASSIST_ENABLED') !== 'false';
const assistModel = () => cfg('ASSIST_MODEL') || cfg('OPENAI_MODEL') || 'gpt-5.4-mini';
const assistDailyCalls = () => Math.max(0, parseInt(cfg('ASSIST_DAILY_CALLS') || '25', 10) || 0);
const assistMaxTokens = () => Math.max(64, Math.min(4000, parseInt(cfg('ASSIST_MAX_TOKENS') || '700', 10) || 700));
function assistUsage() {
  const today = new Date().toISOString().slice(0, 10);
  let u = readJsonSafe(P.assistUsage, {});
  if (u.date !== today) u = { date: today, calls: 0, tokens: 0 };
  return u;
}
function logAssist(entry) {
  try { fs.mkdirSync(path.dirname(P.assistLog), { recursive: true }); fs.appendFileSync(P.assistLog, JSON.stringify(entry) + '\n'); } catch (e) {}
}
// Pull the assistant text out of a Responses-API result (raw HTTP — no SDK output_text helper
// guaranteed, so handle both the convenience field and the structured output array).
function extractResponsesText(j) {
  if (typeof j.output_text === 'string' && j.output_text) return j.output_text;
  let text = '';
  for (const item of (j.output || [])) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) if ((c.type === 'output_text' || c.type === 'text') && c.text) text += c.text;
    }
  }
  return text;
}
function responsesTokens(j) {
  const u = j.usage || {};
  return u.total_tokens || ((u.input_tokens || 0) + (u.output_tokens || 0)) || 0;
}

// Unified OpenAI call. Uses the Responses API (/v1/responses) by default — this is what unlocks the
// high-value built-in tools (web_search, file_search) and structured function calling. Pass `tools`
// to enable them; the result carries any `toolCalls`. Set OPENAI_USE_CHAT=true to fall back to the
// legacy /chat/completions path. Signature is backward-compatible: {content, tokens} for callers
// that don't use tools.
async function chatCompletions(base, key, { model, system, user, maxTokens, temperature }) {
  const payload = { model, temperature, max_completion_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  const r = await fetch(base + '/chat/completions', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(payload) });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('OpenAI HTTP ' + r.status + ' ' + t.slice(0, 200)); }
  const j = await r.json();
  return { content: (((j.choices || [])[0] || {}).message || {}).content || '', tokens: (j.usage || {}).total_tokens || 0, toolCalls: [] };
}

async function openaiChat({ model, system, user, maxTokens, tools, toolChoice, temperature }) {
  const key = aiKey();
  if (!key) throw new Error('no OPENAI_API_KEY');
  // Per-user monthly token cap (admin-settable). 0/unset = no cap. Enforced at the single AI chokepoint.
  const cap = parseInt(cfg('ASSIST_MONTHLY_TOKENS'), 10) || 0;
  if (cap > 0 && assistWindowStats(30).tokens >= cap) throw new Error(`Monthly AI token cap reached (${cap.toLocaleString()}). Ask your admin to raise it.`);
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const temp = temperature != null ? temperature : 0.4;
  const usingTools = Array.isArray(tools) && tools.length;

  // Explicit opt-out, or no tools needed and Responses is unavailable -> legacy chat path.
  if (process.env.OPENAI_USE_CHAT === 'true') return chatCompletions(base, key, { model, system, user, maxTokens, temperature: temp });

  const payload = { model, temperature: temp, max_output_tokens: maxTokens, input: user };
  if (system) payload.instructions = system;
  if (usingTools) { payload.tools = tools; if (toolChoice) payload.tool_choice = toolChoice; }
  let r;
  try {
    r = await fetch(base + '/responses', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(payload) });
  } catch (e) {
    if (usingTools) throw e;
    return chatCompletions(base, key, { model, system, user, maxTokens, temperature: temp });   // network issue → fall back
  }
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    // If the Responses endpoint/params aren't supported for this account/model, transparently fall
    // back to chat/completions (unless tools were required — those only exist on Responses).
    if (!usingTools) { try { return await chatCompletions(base, key, { model, system, user, maxTokens, temperature: temp }); } catch (e2) { /* report the original */ } }
    throw new Error('OpenAI HTTP ' + r.status + ' ' + t.slice(0, 200));
  }
  const j = await r.json();
  const toolCalls = (j.output || []).filter((i) => i.type === 'function_call')
    .map((i) => ({ name: i.name, arguments: i.arguments, call_id: i.call_id }));
  return { content: extractResponsesText(j), tokens: responsesTokens(j), toolCalls };
}

// Built-in Responses tools, enabled by env (T2.4 file_search, T3.8 web_search). Returns undefined
// when none set, so the normal chat-fallback path still applies.
function assistTools() {
  const tools = [];
  if (process.env.ASSIST_WEB_SEARCH === 'true') tools.push({ type: 'web_search' });
  if (process.env.OPENAI_VECTOR_STORE_ID) tools.push({ type: 'file_search', vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID] });
  return tools.length ? tools : undefined;
}
// Force a single function-call (structured output) and return the parsed arguments (T1.1).
async function callTool({ system, user, tool, maxTokens }) {
  const { toolCalls, tokens } = await openaiChat({
    model: assistModel(), system, user, maxTokens: maxTokens || 500,
    tools: [tool], toolChoice: { type: 'function', name: tool.name }, temperature: 0.2,
  });
  const call = (toolCalls || [])[0];
  if (!call) throw new Error('model returned no structured result (function calling needs the Responses API)');
  let args; try { args = JSON.parse(call.arguments || '{}'); } catch (e) { throw new Error('could not parse model output'); }
  return { args, tokens };
}

app.post('/api/assist', async (req, res) => {
  if (!aiKey()) return res.status(400).json({ ok: false, error: 'No OpenAI key set — add one in Settings.' });
  if (!assistEnabled()) return res.status(403).json({ ok: false, error: 'AI assistant is disabled in Settings.' });
  const b = req.body || {};
  // 'answer' = reusable Q&A draft; 'tailor' = résumé/answer suggestions to close JD keyword gaps.
  const kind = ['cover', 'screening', 'answer', 'tailor', 'followup', 'thankyou'].includes(b.kind) ? b.kind : 'cover';
  const rows = readStore();
  const row = rows.find(r => reqKey(r) === String(b.key || '').toLowerCase().trim());
  const company = (row && row.company) || b.company || '';
  const role = (row && row.role) || b.role || '';
  if (kind !== 'answer' && !company && !role) return res.status(404).json({ ok: false, error: 'Req not found and no company/role provided.' });
  if (kind === 'answer' && !String(b.question || '').trim()) return res.status(400).json({ ok: false, error: 'A question is required to write an answer.' });
  const cap = assistDailyCalls();
  const u = assistUsage();
  if (cap && u.calls >= cap) return res.status(429).json({ ok: false, error: `Daily assistant cap reached (${u.calls}/${cap}). Raise it in Settings or wait.` });

  const p = readProfile();
  const a = p.applicant || {};
  const narr = (p.narratives || []).map(n => `- ${n.title}: ${n.body}`).join('\n');
  const jd = String(b.jd || (row && row.notes) || '').slice(0, parseInt(cfg('OPENAI_JD_CHARS') || '3500', 10));
  const keywords = String(b.keywords || '').slice(0, 1500);
  const system = 'You help a job candidate draft application materials. Write in first person, plain and PM-level, honest — no overclaiming, no flowery "ChatGPT" phrasing. Ground every claim ONLY in the candidate\'s narrative library; never invent employers, metrics, or titles. Be concise.';
  let user;
  if (kind === 'answer') {
    const targetLine = (company || role) ? `Target: ${role}${company ? ` at ${company}` : ''}\n` : '';
    user = `Candidate: ${a.name || ''}\n${targetLine}\nCandidate narrative library (use ONLY these facts):\n${narr || '(none provided)'}\n${jd ? `\nJob context:\n${jd}\n` : ''}\nApplication question:\n${b.question || ''}\n\nThe candidate's own keywords / thoughts to build from (incorporate these honestly; do not invent beyond the narratives):\n${keywords || '(none provided)'}\n\nWrite a clear, honest answer (120-180 words) the candidate can reuse, grounded in the narratives and shaped by their keywords. First person, plain.`;
  } else if (kind === 'screening') {
    user = `Candidate: ${a.name || ''}\nTarget: ${role} at ${company}\n\nCandidate narrative library (use ONLY these facts):\n${narr || '(none provided)'}\n\nJob context:\n${jd}\n\nScreening question:\n${b.question || ''}\n\nWrite a tight, honest answer (120-180 words) grounded in the narratives.`;
  } else if (kind === 'followup') {
    const ctx = String(b.context || '').slice(0, 500);
    const contact = String(b.contact || '').trim();
    user = `Candidate: ${a.name || ''}\nTarget: ${role}${company ? ` at ${company}` : ''}\nRecruiter/contact: ${contact || '(unknown — address generically)'}\n\nSituation: ${ctx || 'Follow up on a job application.'}\n\nCandidate narrative library (use ONLY these facts if you cite anything):\n${narr || '(none provided)'}\n\nWrite a SHORT, warm, professional follow-up message (60-110 words) the candidate can send. Reiterate genuine interest, reference the role, and ask a clear next-steps question. No overclaiming, no flattery, plain first-person. Output the message body only (no subject line, no placeholders like [Name] unless the contact is unknown).`;
  } else if (kind === 'thankyou') {
    const contact = String(b.contact || (row && row.recruiter) || '').trim();
    const interviewDate = String(b.interviewDate || (row && row.interview) || '').trim();
    user = `Candidate: ${a.name || ''}\nTarget: ${role}${company ? ` at ${company}` : ''}\nInterviewer/recruiter: ${contact || '(unknown)'}\nInterview date: ${interviewDate || 'recently'}\n\nCandidate narrative library (use ONLY these if citing experience):\n${narr || '(none provided)'}\n\nWrite a SHORT, warm thank-you note (80-120 words) the candidate can send after the interview. Express genuine appreciation for the interviewer's time, reference the role by name, briefly mention one specific reason you remain excited about the opportunity (grounded in the narratives if applicable — otherwise keep it general), and close by expressing continued interest and asking about timeline or next steps. First person, plain and professional — not sycophantic or over-polished. Output the message body only (no subject line).`;
  } else if (kind === 'tailor') {
    user = `Candidate: ${a.name || ''}\nTarget: ${role}${company ? ` at ${company}` : ''}\n\nCandidate narrative library (use ONLY these facts):\n${narr || '(none provided)'}\n\nJob context:\n${jd}\n\nKeywords the posting emphasizes that the résumé does NOT currently cover:\n${keywords || '(none provided)'}\n\nFor each missing keyword, say ONE of: (a) a concrete, HONEST résumé bullet or phrasing the candidate could add IF their narratives genuinely support it (cite which narrative), or (b) "gap — not supported by your background" when the narratives don't back it. Never fabricate experience. Output a short bulleted list.`;
  } else {
    user = `Candidate: ${a.name || ''}\nTarget: ${role} at ${company}\n\nCandidate narrative library (use ONLY these facts):\n${narr || '(none provided)'}\n\nJob context:\n${jd}\n\nDraft a short cover note (150-220 words): why this role fits, 1-2 concrete proof points from the narratives, and a confident close. First person, plain.`;
  }
  try {
    const { content, tokens } = await openaiChat({ model: assistModel(), system, user, maxTokens: assistMaxTokens(), tools: assistTools() });
    u.calls += 1; u.tokens += tokens || 0; writeJsonPretty(P.assistUsage, u);
    logAssist({ ts: new Date().toISOString(), key: reqKey({ company, role }), kind, model: assistModel(), tokens, question: (kind === 'screening' || kind === 'answer') ? String(b.question || '').slice(0, 200) : undefined });
    res.json({ ok: true, draft: content, kind, tokens, usage: { calls: u.calls, tokens: u.tokens, cap } });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Draft a professional summary from the candidate's own résumé/profile (work history, education,
// narratives, keywords). Honest, grounded — never invents employers/metrics. Returns text only;
// the user reviews and saves it. Reuses the assistant key + daily cap.
app.post('/api/profile/draft-summary', async (req, res) => {
  if (!aiKey()) return res.status(400).json({ ok: false, error: 'No OpenAI key set — add one in Settings → Advanced.' });
  if (!assistEnabled()) return res.status(403).json({ ok: false, error: 'AI assistant is disabled in Settings.' });
  const cap = assistDailyCalls();
  const u = assistUsage();
  if (cap && u.calls >= cap) return res.status(429).json({ ok: false, error: `Daily assistant cap reached (${u.calls}/${cap}).` });
  const p = readProfile();
  const a = p.applicant || {};
  const work = (p.workHistory || []).slice(0, 6).map(w => `- ${w.role || ''}${w.company ? ', ' + w.company : ''}${w.start || w.end ? ` (${w.start || ''}–${w.end || ''})` : ''}${w.description ? ': ' + String(w.description).slice(0, 240) : ''}`).join('\n');
  const edu = (p.education || []).slice(0, 4).map(e => `- ${e.level || ''} ${e.field || ''}${e.school ? ', ' + e.school : ''}`).join('\n');
  const narr = (p.narratives || []).map(n => `- ${n.title}: ${n.body}`).join('\n');
  const kw = (p.keywords || []).slice(0, 25).map(k => k.kw).join(', ');
  if (!work && !narr && !edu) return res.status(400).json({ ok: false, error: 'Add work history, education, or narratives first — there is nothing to summarize.' });
  const system = 'You write a concise first-person professional summary for a job candidate. Plain, senior-PM voice — honest, no flowery "ChatGPT" phrasing, no overclaiming. Ground every claim ONLY in the supplied work history, education, and narratives. Never invent employers, metrics, or titles.';
  const user = `Candidate: ${a.name || ''}${a.location ? ` (${a.location})` : ''}\nTarget seniority/domains: ${(p.seniority || []).join(', ')} · ${(p.sectors || []).join(', ')}\n\nWork history:\n${work || '(none)'}\n\nEducation:\n${edu || '(none)'}\n\nNarrative library:\n${narr || '(none)'}\n\nKeywords: ${kw || '(none)'}\n\nWrite a 2–4 sentence professional summary in first person the candidate can use as an "about me" / positioning statement. Lead with what they are and their strongest proven impact. No bullet points.`;
  try {
    const { content, tokens } = await openaiChat({ model: assistModel(), system, user, maxTokens: 320, temperature: 0.5 });
    u.calls += 1; u.tokens += tokens || 0; writeJsonPretty(P.assistUsage, u);
    logAssist({ ts: new Date().toISOString(), kind: 'summary', model: assistModel(), tokens });
    res.json({ ok: true, summary: (content || '').trim(), tokens, usage: { calls: u.calls, tokens: u.tokens, cap } });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Guided narrative builder (so you don't start from a blank slate). `suggest` mines the résumé /
// work history / keywords for 4–6 proof-point story ideas — each with a rough first-person seed and
// a few "things to elaborate on" prompts. `polish` tightens the user's rough notes into one clean,
// honest narrative. Both ground ONLY in supplied facts (never invent metrics/employers/titles).
function profileGrounding(p) {
  const a = p.applicant || {};
  const work = (p.workHistory || []).slice(0, 8).map(w => `- ${w.role || ''}${w.company ? ', ' + w.company : ''}${w.start || w.end ? ` (${w.start || ''}–${w.end || ''})` : ''}${w.description ? ': ' + String(w.description).slice(0, 400) : ''}`).join('\n');
  const edu = (p.education || []).slice(0, 4).map(e => `- ${e.level || ''} ${e.field || ''}${e.school ? ', ' + e.school : ''}`).join('\n');
  const kw = (p.keywords || []).slice(0, 30).map(k => k.kw).join(', ');
  return { a, work, edu, kw };
}
app.post('/api/profile/narratives/suggest', async (req, res) => {
  if (!aiKey()) return res.status(400).json({ ok: false, error: 'No OpenAI key set — add one in Settings → Advanced.' });
  if (!assistEnabled()) return res.status(403).json({ ok: false, error: 'AI assistant is disabled in Settings.' });
  const cap = assistDailyCalls(); const u = assistUsage();
  if (cap && u.calls >= cap) return res.status(429).json({ ok: false, error: `Daily assistant cap reached (${u.calls}/${cap}).` });
  const p = readProfile();
  const { a, work, edu, kw } = profileGrounding(p);
  if (!work && !edu) return res.status(400).json({ ok: false, error: 'Add work history or upload a résumé first — there is nothing to mine for narratives.' });
  const existing = (p.narratives || []).map(n => n.title).join('; ');
  const tool = { type: 'function', name: 'suggest_narratives',
    description: 'Propose 4–6 reusable proof-point narratives (stories) drawn ONLY from the candidate background.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      suggestions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        title: { type: 'string', description: 'short, punchy story title, e.g. "Product Catalog 0→1"' },
        cover: { type: 'array', items: { type: 'string' }, description: '2–3 specific things the candidate should elaborate on to make it land (a metric, the scope, their exact role, the business outcome)' },
        draft: { type: 'string', description: 'a rough 2–3 sentence FIRST-PERSON seed grounded only in the supplied facts; where a metric would strengthen it but is unknown, write a [bracketed prompt] like "[add $ or % impact]"' },
      }, required: ['title', 'cover', 'draft'] } },
    }, required: ['suggestions'] } };
  const system = 'You help a senior PM turn their résumé into reusable interview/application "narratives" — concrete proof-point stories. Ground every suggestion ONLY in the supplied work history, education, and keywords. Never invent employers, metrics, or titles; when a number would help but is not supplied, insert a [bracketed prompt] for the candidate to fill. Honest, plain, senior voice.';
  const user = `Candidate: ${a.name || ''}\nTarget domains: ${(p.sectors || []).join(', ')}\n\nWork history:\n${work || '(none)'}\n\nEducation:\n${edu || '(none)'}\n\nKeywords: ${kw || '(none)'}\n\nAlready-written narratives (do NOT duplicate these): ${existing || '(none yet)'}\n\nPropose 4–6 distinct, high-impact narratives worth writing, each with a rough seed draft and what to elaborate on.`;
  try {
    const { args, tokens } = await callTool({ system, user, tool, maxTokens: 900 });
    u.calls += 1; u.tokens += tokens || 0; writeJsonPretty(P.assistUsage, u);
    logAssist({ ts: new Date().toISOString(), kind: 'narrative-suggest', model: assistModel(), tokens });
    res.json({ ok: true, suggestions: (args.suggestions || []).slice(0, 6), tokens });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});
app.post('/api/profile/narratives/polish', async (req, res) => {
  if (!aiKey()) return res.status(400).json({ ok: false, error: 'No OpenAI key set — add one in Settings → Advanced.' });
  if (!assistEnabled()) return res.status(403).json({ ok: false, error: 'AI assistant is disabled in Settings.' });
  const b = req.body || {};
  if (!String(b.rough || '').trim()) return res.status(400).json({ ok: false, error: 'Write a few rough lines first, then polish.' });
  const cap = assistDailyCalls(); const u = assistUsage();
  if (cap && u.calls >= cap) return res.status(429).json({ ok: false, error: `Daily assistant cap reached (${u.calls}/${cap}).` });
  const tool = { type: 'function', name: 'polish_narrative',
    description: 'Tighten the candidate rough notes into ONE clean reusable narrative.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      title: { type: 'string', description: 'short story title' },
      body: { type: 'string', description: '60–110 words, first person, honest, skimmable; keep any real metrics, do NOT invent new ones' },
    }, required: ['title', 'body'] } };
  const system = 'You polish a job candidate\'s rough notes into one tight, reusable proof-point narrative. First person, plain senior voice, honest. Preserve real metrics; NEVER invent employers, numbers, or titles. If the notes contain [bracketed prompts] the candidate did not fill, drop them gracefully rather than fabricating.';
  const user = `Working title: ${b.title || '(none)'}\n\nRough notes from the candidate:\n${b.rough}\n\nPolish into one clean narrative (title + 60–110 word body).`;
  try {
    const { args, tokens } = await callTool({ system, user, tool, maxTokens: 400 });
    u.calls += 1; u.tokens += tokens || 0; writeJsonPretty(P.assistUsage, u);
    logAssist({ ts: new Date().toISOString(), kind: 'narrative-polish', model: assistModel(), tokens });
    res.json({ ok: true, title: (args.title || b.title || '').trim(), body: (args.body || '').trim(), tokens });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// Speech-to-text for the voice narrative builder (app). Accepts a base64 audio clip, transcribes it
// via OpenAI Whisper (multipart upload to /v1/audio/transcriptions), returns plain text the user then
// elaborates/polishes through the normal narrative path. The AI key never leaves the server. Whisper
// is billed per audio-minute (not tokens), so usage is logged as a call with byte size, tokens 0.
app.post('/api/transcribe', async (req, res) => {
  if (!aiKey()) return res.status(400).json({ ok: false, error: 'No OpenAI key set — add one in Settings.' });
  if (!assistEnabled()) return res.status(403).json({ ok: false, error: 'AI assistant is disabled in Settings.' });
  const b = req.body || {};
  const data = String(b.audioBase64 || '');
  if (!data) return res.status(400).json({ ok: false, error: 'No audio provided.' });
  const cap = assistDailyCalls(); const u = assistUsage();
  if (cap && u.calls >= cap) return res.status(429).json({ ok: false, error: `Daily assistant cap reached (${u.calls}/${cap}).` });
  let buf; try { buf = Buffer.from(data, 'base64'); } catch (e) { return res.status(400).json({ ok: false, error: 'Bad audio encoding.' }); }
  // Whisper accepts up to 25MB; the JSON body parser caps us at 8mb (~6MB decoded) first. Keep clips short.
  const maxMb = parseInt(cfg('TRANSCRIBE_MAX_MB') || '6', 10);
  if (buf.length > maxMb * 1024 * 1024) return res.status(413).json({ ok: false, error: `Recording too large (>${maxMb}MB). Keep narratives under a few minutes.` });
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = (cfg('OPENAI_TRANSCRIBE_MODEL') || 'whisper-1').trim();
  const filename = (String(b.filename || 'narrative.m4a').replace(/[^\w.\-]/g, '_')) || 'narrative.m4a';
  const mime = String(b.mimeType || 'audio/m4a').slice(0, 60);
  try {
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime }), filename);
    form.append('model', model);
    // A light prompt nudges Whisper toward résumé/product vocabulary spelling.
    form.append('prompt', String(b.prompt || 'A product manager describing a work accomplishment (CDP, data platform, AI, identity).').slice(0, 400));
    const r = await fetch(base + '/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + aiKey() }, body: form });
    if (!r.ok) { const t = await r.text().catch(() => ''); return res.status(502).json({ ok: false, error: 'OpenAI HTTP ' + r.status + ' ' + t.slice(0, 200) }); }
    const j = await r.json();
    u.calls += 1; writeJsonPretty(P.assistUsage, u);
    logAssist({ ts: new Date().toISOString(), kind: 'transcribe', model, tokens: 0, bytes: buf.length });
    res.json({ ok: true, text: String(j.text || '').trim() });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// Structured role scoring via function calling (T1.1). Returns fit/prob/tier/rationale — no prose
// parsing. The caller decides whether to write it back to the row.
app.post('/api/assist/score', async (req, res) => {
  if (!aiKey()) return res.status(400).json({ ok: false, error: 'No OpenAI key set — add one in Settings.' });
  if (!assistEnabled()) return res.status(403).json({ ok: false, error: 'AI assistant is disabled in Settings.' });
  const b = req.body || {};
  const rows = readStore();
  const row = rows.find((r) => reqKey(r) === String(b.key || '').toLowerCase().trim());
  const company = (row && row.company) || b.company || '';
  const role = (row && row.role) || b.role || '';
  if (!company && !role) return res.status(404).json({ ok: false, error: 'Req not found and no company/role provided.' });
  const p = readProfile();
  const a = p.applicant || {};
  const narr = (p.narratives || []).map((n) => `- ${n.title}: ${n.body}`).join('\n');
  const jd = String(b.jd || (row && row.notes) || '').slice(0, parseInt(cfg('OPENAI_JD_CHARS') || '3500', 10));
  const tool = { type: 'function', name: 'score_role',
    description: 'Score how well this role fits the candidate and the odds of landing an interview.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      fit: { type: 'number', description: '0-10: domain/résumé match' },
      prob: { type: 'number', description: '0-10: probability of getting a screen' },
      tier: { type: 'string', enum: ['A', 'B', 'C'] },
      rationale: { type: 'string', description: 'one or two sentences, honest' },
    }, required: ['fit', 'prob', 'tier', 'rationale'] } };
  const system = 'You score job fit for a Principal/Director-level product manager focused on data platforms, CDP, AI platform, and martech. Be honest and calibrated; remote-only (penalize on-site). Ground in the candidate facts; do not inflate.';
  const user = `Candidate: ${a.name || ''}\nSeniority: ${(p.seniority || []).join(', ')}\nDomains: ${(p.sectors || []).join(', ')}\n\nNarratives:\n${narr || '(none)'}\n\nTarget role: ${role}${company ? ` at ${company}` : ''}\nJob description:\n${jd || '(none provided)'}`;
  try {
    const { args, tokens } = await callTool({ system, user, tool, maxTokens: 300 });
    const u = assistUsage(); u.calls += 1; u.tokens += tokens || 0; writeJsonPretty(P.assistUsage, u);
    logAssist({ ts: new Date().toISOString(), key: reqKey({ company, role }), kind: 'score', model: assistModel(), tokens });
    res.json({ ok: true, fit: args.fit, prob: args.prob, tier: args.tier, rationale: args.rationale, tokens });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// Structured field mapping via function calling (T1.1). Given scanned form fields ({i, sig, type}),
// returns {i, value, confidence} grounded ONLY in the candidate's factual profile — for the
// extension's AI smart-fill of fields the deterministic matcher missed. Never invents values.
app.post('/api/assist/map-fields', async (req, res) => {
  if (!aiKey()) return res.status(400).json({ ok: false, error: 'No OpenAI key set — add one in Settings.' });
  if (!assistEnabled()) return res.status(403).json({ ok: false, error: 'AI assistant is disabled in Settings.' });
  const b = req.body || {};
  const fields = Array.isArray(b.fields) ? b.fields.slice(0, 60) : [];
  if (!fields.length) return res.json({ ok: true, fields: [], tokens: 0 });
  const p = readProfile();
  const a = p.applicant || {};
  const facts = {
    name: a.name || '', email: a.email || '', phone: a.phone || '', location: a.location || '',
    linkedin: a.linkedin || '', github: a.github || '', website: a.website || a.personalUrl || '',
    seniority: (p.seniority || [])[0] || '', authorized_us: 'Yes', requires_sponsorship: 'No',
  };
  const tool = { type: 'function', name: 'map_fields',
    description: 'Map application form fields to the candidate factual values. Only include a field when you are confident; never invent a value.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      fields: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        i: { type: 'integer', description: 'the field index given in the input' },
        value: { type: 'string' },
        confidence: { type: 'number', description: '0-1' },
      }, required: ['i', 'value', 'confidence'] } },
    }, required: ['fields'] } };
  const system = 'You map web-form fields to a candidate\'s known factual values. Use ONLY the provided facts. If a field has no confident match (or is a password/EEO/consent/essay), omit it. Never fabricate.';
  const user = `Candidate facts (the only values you may use):\n${JSON.stringify(facts, null, 2)}\n\nForm fields (index + signature text + html type):\n${fields.map((f) => `#${f.i} [${f.type || ''}] ${String(f.sig || '').slice(0, 160)}`).join('\n')}`;
  try {
    const { args, tokens } = await callTool({ system, user, tool, maxTokens: 600 });
    const u = assistUsage(); u.calls += 1; u.tokens += tokens || 0; writeJsonPretty(P.assistUsage, u);
    logAssist({ ts: new Date().toISOString(), key: 'map-fields', kind: 'mapfields', model: assistModel(), tokens });
    const out = (args.fields || []).filter((f) => f && Number.isInteger(f.i) && typeof f.value === 'string');
    res.json({ ok: true, fields: out, tokens });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// ---------- assist consumption monitor ----------
// OpenAI does NOT expose remaining credit balance via the API key (the old dashboard/billing
// endpoints are locked to browser sessions). So we report what we can measure exactly — the tokens
// we log on every call — plus an OPTIONAL user-set $/1M-token rate and monthly budget for cost
// estimation. Authoritative billing lives at platform.openai.com/usage.
function assistWindowStats(days) {
  const cutoff = Date.now() - days * 86400000;
  let calls = 0, tokens = 0;
  try {
    const txt = fs.readFileSync(P.assistLog, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let e; try { e = JSON.parse(line); } catch (_) { continue; }
      const t = Date.parse(e.ts); if (isNaN(t) || t < cutoff) continue;
      calls += 1; tokens += (+e.tokens || 0);
    }
  } catch (_) { /* no log yet */ }
  return { calls, tokens };
}
// Price is user-supplied — we never hardcode a model price (it would go stale / be wrong).
const assistRatePer1M = () => { const v = parseFloat(cfg('OPENAI_PRICE_PER_1M') || ''); return isFinite(v) && v > 0 ? v : null; };
const assistMonthlyBudget = () => { const v = parseFloat(cfg('ASSIST_MONTHLY_BUDGET') || ''); return isFinite(v) && v > 0 ? v : null; };
const estCost = (tokens, rate) => rate == null ? null : Math.round((tokens / 1e6) * rate * 100) / 100;

app.get('/api/assist/usage', (req, res) => {
  const u = assistUsage();
  const cap = assistDailyCalls();
  const w7 = assistWindowStats(7);
  const w30 = assistWindowStats(30);
  const rate = assistRatePer1M();
  const budget = assistMonthlyBudget();
  const cost30 = estCost(w30.tokens, rate);
  res.json({
    ok: true,
    enabled: assistEnabled(), keySet: !!aiKey(), model: assistModel(),
    today: { calls: u.calls, tokens: u.tokens, cap },
    last7d: { calls: w7.calls, tokens: w7.tokens, estCost: estCost(w7.tokens, rate) },
    last30d: { calls: w30.calls, tokens: w30.tokens, estCost: cost30 },
    ratePer1M: rate, monthlyBudget: budget,
    budgetUsedPct: (budget && cost30 != null) ? Math.min(100, Math.round((cost30 / budget) * 100)) : null,
    note: 'OpenAI does not expose remaining balance via API; see the dashboard for authoritative billing.',
    dashboard: 'https://platform.openai.com/usage'
  });
});

// Model picker — the real list from OpenAI (GET /v1/models), filtered to chat-capable gpt-* ids and
// cached 1h. No fabricated names: if there's no key or the call fails, fall back to the currently
// configured model(s) only, so the dropdown always at least round-trips the saved value.
let _modelCache = { at: 0, list: null };
async function listOpenAiModels() {
  const cur = [cfg('OPENAI_MODEL'), cfg('ASSIST_MODEL'), 'gpt-5.4-mini'].filter(Boolean);
  const fallback = [...new Set(cur)];
  if (!aiKey()) return { models: fallback, source: 'fallback' };
  if (_modelCache.list && Date.now() - _modelCache.at < 3600000) return { models: _modelCache.list, source: 'cache' };
  try {
    const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const r = await fetch(base + '/models', { headers: { Authorization: 'Bearer ' + aiKey() } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    let ids = (j.data || []).map(m => m.id).filter(id => /^(gpt|o\d|chatgpt)/i.test(id) && !/audio|realtime|transcribe|tts|image|embedding|moderation/i.test(id));
    ids = [...new Set([...ids, ...fallback])].sort();
    _modelCache = { at: Date.now(), list: ids };
    return { models: ids, source: 'api' };
  } catch (e) {
    return { models: fallback, source: 'fallback', error: e.message };
  }
}
app.get('/api/assist/models', async (req, res) => {
  const r = await listOpenAiModels();
  res.json({ ok: true, ...r, current: { scoring: cfg('OPENAI_MODEL') || 'gpt-5.4-mini', assistant: cfg('ASSIST_MODEL') || '' } });
});

// ---------- interview prep guide (auto-generated when a role reaches an interview stage) ----------
// Stored as Markdown in agent/interview-guides/<sha1(key)>.md and "attached" to the row via
// row.guideAt. Generated from the candidate's narratives + the role's JD; grounded, never invented.
const INTERVIEW_STAGES = new Set(['Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer']);
const GUIDE_DIR = path.join(DATA_DIR, 'agent', 'interview-guides');
const guidePath = (key) => path.join(GUIDE_DIR, crypto.createHash('sha1').update(key).digest('hex') + '.md');
const guideMaxTokens = () => Math.max(800, parseInt(process.env.GUIDE_MAX_TOKENS || '1800', 10) || 1800);

const guideResearchMaxTokens = () => Math.max(guideMaxTokens(), parseInt(process.env.GUIDE_RESEARCH_MAX_TOKENS || '2800', 10) || 2800);

// Build the guide. opts.research = true runs an opt-in web_search pass: the model researches the
// company's real interview process/questions AND the company's own careers / "how we hire" page,
// cites sources, and blends that with standard role/seniority question patterns. Default (no research)
// is the original grounded-only guide — no network calls, no extra cost. Candidate-specific claims are
// ALWAYS grounded only in the narrative library; research only adds company/role/industry context.
async function generateInterviewGuide(row, opts = {}) {
  const research = !!opts.research;
  const p = readProfile();
  const a = p.applicant || {};
  const narr = (p.narratives || []).map((n) => `- ${n.title}: ${n.body}`).join('\n');
  const jd = String(row.notes || '').slice(0, parseInt(cfg('OPENAI_JD_CHARS') || '3500', 10));
  const company = row.company || '', role = row.role || '';
  const groundRule = 'Ground every candidate-specific claim ONLY in their narrative library — never invent employers, metrics, or titles. Be specific and actionable, not generic.';
  let system, sections, tools, maxTokens, researchHint = '';
  if (research) {
    const domain = companyDomainGuess(company);
    system = 'You are an expert interview coach preparing a candidate for a specific role. Use the web_search tool to research (1) the interview process and real questions people report for THIS company and role, and (2) the company\'s OWN careers / "how we hire" / interview-prep page for their stated guidance. Prefer recent, reputable sources; cite each inline as a markdown link, and never present an unverified rumor as fact. Blend that intel with standard interview-question patterns appropriate to this seniority and domain. ' + groundRule;
    sections = `## Role snapshot\n## ${company || 'The company'}'s interview process (what the research shows — cite sources; say "couldn't verify" where unsure)\n## Likely questions & how to answer (10–12: company/role-specific ones from the research PLUS standard patterns for this seniority + domain; 1–2 lines of guidance each)\n## Why you fit (from your narratives)\n## Your stories to lead with (map specific narratives to STAR)\n## Smart questions to ask them\n## Things to clarify / possible red flags\n## Sources (the links you used)\n## 48-hour prep checklist`;
    tools = [{ type: 'web_search' }, ...(assistTools() || [])];
    maxTokens = guideResearchMaxTokens();
    researchHint = `\n${domain ? `Company site to check for their careers/interview page: https://${domain}\n` : ''}Research ${company || 'the company'}'s interview process${role ? ` for the "${role}" role` : ''} on the web before writing; cite what you find.\n`;
  } else {
    system = 'You are an expert interview coach preparing a candidate for a specific role. Produce a concise, practical interview prep guide in Markdown. ' + groundRule;
    sections = `## Role snapshot\n## Why you fit (from your narratives)\n## Likely questions & how to answer (8–10, mixing behavioral + role-specific; one or two lines of guidance each)\n## Your stories to lead with (map specific narratives to STAR)\n## Smart questions to ask them\n## Things to clarify / possible red flags\n## 48-hour prep checklist`;
    tools = assistTools();
    maxTokens = guideMaxTokens();
  }
  const user = `Candidate: ${a.name || ''}\nTarget role: ${role}${company ? ` at ${company}` : ''}\n${researchHint}\nCandidate narrative library (use ONLY these facts for "your story" parts):\n${narr || '(none provided)'}\n\nJob context:\n${jd || '(none provided)'}\n\nWrite an interview prep guide with exactly these sections:\n${sections}\nKeep it tight and skimmable.`;
  const { content, tokens } = await openaiChat({ model: assistModel(), system, user, maxTokens, tools, temperature: 0.5 });
  return { markdown: content, tokens };
}

// Generate + persist + attach to the row. Re-reads the store before stamping guideAt so it never
// clobbers a concurrent edit. Used by the manual POST and the PATCH status-change trigger.
async function buildAndStoreGuide(key, opts = {}) {
  const rows = readStore();
  const row = rows.find((r) => reqKey(r) === key);
  if (!row) throw new Error('no row for key');
  const { markdown, tokens } = await generateInterviewGuide(row, opts);
  if (!markdown || !markdown.trim()) throw new Error('empty guide from model');
  fs.mkdirSync(GUIDE_DIR, { recursive: true });
  fs.writeFileSync(guidePath(key), markdown, 'utf8');
  const rows2 = readStore();
  const r2 = rows2.find((r) => reqKey(r) === key);
  if (r2) { r2.guideAt = new Date().toISOString(); touchRow(r2); writeStore(rows2); }
  logChange({ ts: nowIso(), action: 'interview-guide', key, tokens: tokens || 0, researched: !!opts.research });
  return markdown;
}

// Tiny Markdown -> HTML (headings, lists, bold/italic/code) — enough for the guide; no deps.
function mdToHtml(md) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>');
  let html = '', inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const line of String(md || '').split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^###\s+(.*)/))) { closeList(); html += '<h3>' + inline(m[1]) + '</h3>'; }
    else if ((m = line.match(/^##\s+(.*)/))) { closeList(); html += '<h2>' + inline(m[1]) + '</h2>'; }
    else if ((m = line.match(/^#\s+(.*)/))) { closeList(); html += '<h1>' + inline(m[1]) + '</h1>'; }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(m[1]) + '</li>'; }
    else if (line.trim() === '') { closeList(); }
    else { closeList(); html += '<p>' + inline(line) + '</p>'; }
  }
  closeList();
  return html;
}
function guideHtmlPage(title, bodyHtml, guideAt) {
  const esc = (s) => String(s || '').replace(/</g, '&lt;');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Interview guide — ${esc(title)}</title><style>
:root{color-scheme:dark}
body{margin:0;background:#0B0C0E;color:#E2E8F0;font:16px/1.6 -apple-system,system-ui,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:40px 22px 80px}
.brand{font:700 .7rem/1 "Spline Sans",system-ui;letter-spacing:.26em;text-transform:uppercase;color:#00E5A3;margin-bottom:6px}
h1{font-size:1.6rem;margin:.2em 0} h2{font-size:1.15rem;margin:1.6em 0 .4em;color:#00E5A3;border-bottom:1px solid #1d2630;padding-bottom:.2em}
h3{font-size:1rem;margin:1.1em 0 .3em;color:#C8FF49}
ul{padding-left:1.2em} li{margin:.25em 0} code{background:#16181C;padding:1px 5px;border-radius:4px;font-size:.9em}
.meta{color:#64748B;font-size:.8rem;margin-bottom:1.5em}
.print{position:fixed;top:16px;right:16px;background:#00E5A3;color:#08130d;border:0;border-radius:8px;padding:8px 14px;font:700 .85rem inherit;cursor:pointer}
@media print{.print{display:none}}
</style></head><body><button class="print" onclick="window.print()">Print / PDF</button>
<div class="wrap"><div class="brand">Reqon · Interview prep</div><h1>${esc(title)}</h1>
<div class="meta">${guideAt ? 'Generated ' + esc(String(guideAt).slice(0, 10)) : ''}</div>
${bodyHtml}</div></body></html>`;
}

// Open the guide (styled HTML page — what the board card links to).
// Raw guide markdown as JSON (P1.4) — the app fetches this (authed) and renders it natively, since a
// WebView can't easily send the X-CRM-Token for the styled HTML page.
app.get('/api/reqs/:key/guide.json', (req, res) => {
  const key = decodeURIComponent(req.params.key || '').toLowerCase().trim();
  const fp = guidePath(key);
  const row = readStore().find((r) => reqKey(r) === key);
  if (!row) return res.status(404).json({ ok: false, error: 'no row matches key', key });
  if (!fs.existsSync(fp)) return res.json({ ok: true, exists: false, key, company: row.company, role: row.role });
  res.json({ ok: true, exists: true, key, company: row.company, role: row.role, guideAt: row.guideAt || null, markdown: fs.readFileSync(fp, 'utf8') });
});
app.get('/api/reqs/:key/guide', (req, res) => {
  const key = decodeURIComponent(req.params.key || '').toLowerCase().trim();
  const fp = guidePath(key);
  if (!fs.existsSync(fp)) {
    return res.status(404).set('Content-Type', 'text/html; charset=utf-8')
      .send('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0B0C0E;color:#E2E8F0;padding:40px">No interview guide yet for this role — generate it from the board card.</body>');
  }
  const md = fs.readFileSync(fp, 'utf8');
  const row = readStore().find((r) => reqKey(r) === key) || {};
  const title = [row.role, row.company].filter(Boolean).join(' · ') || 'Interview guide';
  res.set('Content-Type', 'text/html; charset=utf-8').send(guideHtmlPage(title, mdToHtml(md), row.guideAt));
});

// Force (re)generate a guide (board "Generate guide" button). Awaits so the card can open it after.
app.post('/api/reqs/:key/guide', async (req, res) => {
  if (!aiKey()) return res.status(400).json({ ok: false, error: 'No OpenAI key set — add one in Settings.' });
  if (!assistEnabled()) return res.status(403).json({ ok: false, error: 'AI assistant is disabled in Settings.' });
  const key = decodeURIComponent(req.params.key || '').toLowerCase().trim();
  const research = req.body?.research === true || req.query.research === '1' || req.query.research === 'true';
  const job = jobs.create('interview_guide', { label: 'Interview guide · ' + key + (research ? ' · researched' : '') });
  try {
    await buildAndStoreGuide(key, { research });
    jobs.finish(job.id, { key, researched: research });
    res.json({ ok: true, key, researched: research, url: '/api/reqs/' + encodeURIComponent(key) + '/guide' });
  } catch (e) {
    jobs.fail(job.id, e.message);
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ---------- CV builder (Reqon) ----------
// Assembles a downloadable .docx CV from the candidate's profile. The summary is AI-written when a
// key is available (grounded in the same facts), else deterministic. Body sections are ALWAYS the
// real structured fields (work history / education / narratives / awards) — never invented.
// CV cache is tenant-scoped (P.cvCache) so one user's last-built CV never leaks to another.

function cvSections(p) {
  const a = p.applicant || {};
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    name: String(a.name || ''),
    contact: [a.email, a.phone, a.location].filter(Boolean).map(String),
    links: [a.linkedin, a.github, a.website || a.personalUrl].filter(Boolean).map(String),
    experience: list(p.workHistory).filter((w) => w && (w.company || w.role)).map((w) => ({
      company: String(w.company || ''), role: String(w.role || ''),
      dates: [w.start, w.end].filter(Boolean).join(' – '), description: String(w.description || ''),
    })),
    education: list(p.education).filter((e) => e && (e.school || e.field)).map((e) => ({
      school: String(e.school || ''), level: String(e.level || e.degree || ''),
      field: String(e.field || ''), dates: [e.start, e.end].filter(Boolean).join(' – '),
    })),
    highlights: list(p.narratives).filter((n) => n && (n.title || n.body))
      .map((n) => (n.title && n.body ? `${n.title} — ${n.body}` : String(n.title || n.body))),
    awards: list(p.awards).map(String), certs: list(p.certs).map(String), volunteer: list(p.volunteer).map(String),
  };
}

async function cvSummary(p, tailor) {
  const a = p.applicant || {};
  const facts = [
    a.name ? `Name: ${a.name}` : '',
    (p.seniority || []).length ? `Seniority: ${(p.seniority || []).join(', ')}` : '',
    (p.sectors || []).length ? `Domains: ${(p.sectors || []).join(', ')}` : '',
    (p.workHistory || []).map((w) => `${w.role || ''} at ${w.company || ''}: ${w.description || ''}`).filter((x) => x.trim() !== ' at : ').join('\n'),
    (p.narratives || []).map((n) => `- ${n.title}: ${n.body}`).join('\n'),
  ].filter(Boolean).join('\n').trim();
  // Optional per-role tailoring: bias the summary's emphasis toward a target role/JD, still grounded.
  const t = tailor && (tailor.role || tailor.company || tailor.jd) ? tailor : null;
  const targetLine = t ? `Target role: ${[t.role, t.company].filter(Boolean).join(' at ')}`.trim() : '';
  const jd = t && t.jd ? `\nTarget job description:\n${String(t.jd).slice(0, parseInt(cfg('OPENAI_JD_CHARS') || '3500', 10))}` : '';
  if (facts && aiKey() && assistEnabled()) {
    try {
      const system = t
        ? 'Write a 2–3 sentence professional summary for the top of a CV, tailored to the target role — lead with the candidate\'s most relevant experience for it. Ground ONLY in the facts provided; never invent employers, titles, or metrics, and never claim skills not in the facts. No first-person pronouns, no flowery phrasing.'
        : 'Write a 2–3 sentence professional summary for the top of a CV, in a crisp résumé voice. Ground ONLY in the facts provided — never invent employers, titles, or metrics. No first-person pronouns, no flowery phrasing.';
      const user = t ? `${targetLine}${jd}\n\nCandidate facts (use ONLY these):\n${facts}` : facts;
      const { content } = await openaiChat({ model: assistModel(), system, user, maxTokens: 220 });
      if (content && content.trim()) return { text: content.trim(), source: 'ai' };
    } catch (e) { /* fall through to deterministic */ }
  }
  const sen = (p.seniority || [])[0] || 'Product leader';
  const dom = (p.sectors || []).slice(0, 3).join(', ');
  const base = dom ? `${sen} focused on ${dom}.` : (facts ? `${sen}.` : '');
  return { text: t && base ? `${base} Targeting ${[t.role, t.company].filter(Boolean).join(' at ')}.` : base, source: 'template' };
}

function cvMarkdown(s, summary) {
  const L = [];
  if (s.name) L.push(`# ${s.name}`);
  if (s.contact.length) L.push(s.contact.join(' · '));
  if (s.links.length) L.push(s.links.join(' · '));
  if (summary) L.push('', '## Summary', summary);
  if (s.experience.length) { L.push('', '## Experience'); for (const e of s.experience) { L.push(`**${e.role}** — ${e.company}${e.dates ? ` (${e.dates})` : ''}`); if (e.description) L.push(e.description); } }
  if (s.highlights.length) { L.push('', '## Highlights'); for (const h of s.highlights) L.push(`- ${h}`); }
  if (s.education.length) { L.push('', '## Education'); for (const e of s.education) L.push(`${[e.level, e.field].filter(Boolean).join(', ')}${e.school ? ` — ${e.school}` : ''}${e.dates ? ` (${e.dates})` : ''}`); }
  for (const [t, arr] of [['Awards', s.awards], ['Certifications', s.certs], ['Volunteer', s.volunteer]]) if (arr.length) { L.push('', `## ${t}`); for (const x of arr) L.push(`- ${x}`); }
  return L.join('\n');
}

function cvDocxBuffer(s, summary) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
  const kids = [];
  const para = (text) => new Paragraph({ children: [new TextRun({ text })] });
  const head = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 60 } });
  const bullets = (arr) => arr.forEach((x) => kids.push(new Paragraph({ text: x, bullet: { level: 0 } })));
  if (s.name) kids.push(new Paragraph({ children: [new TextRun({ text: s.name, bold: true, size: 36 })] }));
  if (s.contact.length) kids.push(new Paragraph({ children: [new TextRun({ text: s.contact.join('   ·   '), size: 20 })] }));
  if (s.links.length) kids.push(new Paragraph({ children: [new TextRun({ text: s.links.join('   ·   '), size: 20 })] }));
  if (summary) { kids.push(head('Summary')); kids.push(para(summary)); }
  if (s.experience.length) {
    kids.push(head('Experience'));
    for (const e of s.experience) {
      kids.push(new Paragraph({ children: [new TextRun({ text: e.role || '', bold: true }), new TextRun({ text: e.company ? `   —   ${e.company}` : '' }), ...(e.dates ? [new TextRun({ text: `    ${e.dates}`, italics: true })] : [])] }));
      if (e.description) kids.push(para(e.description));
    }
  }
  if (s.highlights.length) { kids.push(head('Highlights')); bullets(s.highlights); }
  if (s.education.length) { kids.push(head('Education')); for (const e of s.education) kids.push(para(`${[e.level, e.field].filter(Boolean).join(', ')}${e.school ? ` — ${e.school}` : ''}${e.dates ? `  (${e.dates})` : ''}`)); }
  if (s.awards.length) { kids.push(head('Awards')); bullets(s.awards); }
  if (s.certs.length) { kids.push(head('Certifications')); bullets(s.certs); }
  if (s.volunteer.length) { kids.push(head('Volunteer')); bullets(s.volunteer); }
  if (!kids.length) kids.push(para('Add work history, education, and narratives in your profile to build a CV.'));
  return Packer.toBuffer(new Document({ sections: [{ children: kids }] }));
}

// Build CV content (AI summary if available) + cache it; returns the markdown preview + source.
app.post('/api/cv', async (req, res) => {
  try {
    const b = req.body || {};
    const tailor = b.tailor && typeof b.tailor === 'object'
      ? { role: String(b.tailor.role || ''), company: String(b.tailor.company || ''), jd: String(b.tailor.jd || '') }
      : null;
    const p = readProfile();
    const s = cvSections(p);
    const { text: summary, source } = await cvSummary(p, tailor);
    const markdown = cvMarkdown(s, summary);
    const tailoredFor = tailor && (tailor.role || tailor.company) ? [tailor.role, tailor.company].filter(Boolean).join(' at ') : null;
    try { writeJsonPretty(P.cvCache, { sections: s, summary, source, tailoredFor, builtAt: new Date().toISOString() }); } catch (e) {}
    res.json({ ok: true, markdown, source, name: s.name, tailoredFor });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Print-styled HTML CV — open in a browser and "Save as PDF" (no PDF dependency needed).
function cvHtml(s, summary) {
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const ul = (arr) => (arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  const sec = (title, inner) => (inner ? `<h2>${esc(title)}</h2>${inner}` : '');
  const item = (head, org, dates, body) =>
    `<div class="item"><div class="row"><span class="role">${esc(head)}</span>${org ? `<span class="org"> — ${esc(org)}</span>` : ''}${dates ? `<span class="dates">${esc(dates)}</span>` : ''}</div>${body ? `<p>${esc(body)}</p>` : ''}</div>`;
  const exp = s.experience.map((e) => item(e.role, e.company, e.dates, e.description)).join('');
  const edu = s.education.map((e) => item([e.level, e.field].filter(Boolean).join(', '), e.school, e.dates, '')).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.name || 'CV')} — CV</title>
<style>
  :root{--ink:#16181c;--muted:#5a5d77;--accent:#00936b}
  *{box-sizing:border-box}
  body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--ink);max-width:760px;margin:0 auto;padding:32px;line-height:1.5}
  h1{font-size:26px;margin:0 0 2px}
  .contact,.links{color:var(--muted);font-size:13px;margin:2px 0}
  h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);border-bottom:1px solid #e3e3e8;padding-bottom:4px;margin:22px 0 8px}
  .item{margin:8px 0}.row{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}
  .role{font-weight:600}.dates{margin-left:auto;color:var(--muted);font-size:12px}
  p{margin:4px 0}ul{margin:4px 0;padding-left:18px}li{margin:2px 0}
  .hint{background:#f4f6f9;border:1px solid #e3e3e8;border-radius:8px;padding:10px 12px;color:var(--muted);font-size:13px;margin-bottom:18px}
  @media print{.hint{display:none}body{padding:0;max-width:none}}
</style></head><body>
<div class="hint">Use your browser's Share / Print → "Save as PDF" to download this CV.</div>
${s.name ? `<h1>${esc(s.name)}</h1>` : ''}
${s.contact.length ? `<div class="contact">${s.contact.map(esc).join(' · ')}</div>` : ''}
${s.links.length ? `<div class="links">${s.links.map(esc).join(' · ')}</div>` : ''}
${summary ? sec('Summary', `<p>${esc(summary)}</p>`) : ''}
${sec('Experience', exp)}
${s.highlights.length ? sec('Highlights', ul(s.highlights)) : ''}
${sec('Education', edu)}
${s.awards.length ? sec('Awards', ul(s.awards)) : ''}
${s.certs.length ? sec('Certifications', ul(s.certs)) : ''}
${s.volunteer.length ? sec('Volunteer', ul(s.volunteer)) : ''}
</body></html>`;
}

app.get('/api/cv.html', async (req, res) => {
  try {
    let cache = readJsonSafe(P.cvCache, null);
    if (!cache || !cache.sections) { const p = readProfile(); cache = { sections: cvSections(p), summary: (await cvSummary(p)).text }; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(cvHtml(cache.sections, cache.summary || ''));
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Stream the CV as a .docx (uses the last POST /api/cv content, else builds fresh).
app.get('/api/cv.docx', async (req, res) => {
  try {
    let cache = readJsonSafe(P.cvCache, null);
    if (!cache || !cache.sections) { const p = readProfile(); cache = { sections: cvSections(p), summary: (await cvSummary(p)).text }; }
    const buf = await cvDocxBuffer(cache.sections, cache.summary || '');
    const safe = (String(cache.sections.name || 'CV').replace(/[^\w .-]/g, '').trim() || 'CV') + ' CV.docx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.send(buf);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ---------- morning digest (Phase 7) ----------
// Composed server-side from the store (deterministic, no external calls). Delivered by an
// in-server scheduler via Slack webhook or SMTP email, with a file fallback always written.
// (Express can't reach the M365/Slack MCP connectors, so we use a webhook / SMTP.)
const DIGEST_PYTHON = path.join(ROOT, 'agent', 'digest.py');
const digestEnabled = () => cfg('DIGEST_ENABLED') === 'true';
const digestTime = () => /^\d{1,2}:\d{2}$/.test(cfg('DIGEST_TIME') || '') ? cfg('DIGEST_TIME') : '07:00';
const digestChannel = () => ['file', 'slack', 'email'].includes(cfg('DIGEST_CHANNEL')) ? cfg('DIGEST_CHANNEL') : 'file';
const digestDays = () => Math.max(1, Math.min(60, parseInt(cfg('DIGEST_DAYS') || '1', 10) || 1));
// Local date-only day delta. Parses "YYYY-MM-DD" as LOCAL midnight (not UTC) so a same-day
// date reads as 0 days regardless of clock time / timezone (fixes the 7am "1 day old" bug).
function daysSinceServer(d) {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  let then;
  if (m) { then = new Date(+m[1], +m[2] - 1, +m[3]); }
  else { const t = Date.parse(d); if (isNaN(t)) return null; then = new Date(t); }
  then.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today - then) / 864e5));   // round absorbs DST hour shifts
}

function composeDigest(days) {
  days = Math.max(1, Math.min(60, days || digestDays()));
  const rows = liveRows(readStore());
  const hy = hygieneSettings(readJsonSafe(P.boards, {}));
  const ev = r => +(((+r.fit || 0) * (+r.prob || 0)) / 10).toFixed(1);
  const byEv = (a, b) => ev(b) - ev(a);
  const newFinds = rows.filter(r => { const d = daysSinceServer(r.added); return d != null && d < days && r.status === 'Not Applied'; }).sort(byEv);
  const followUps = rows.filter(r => { if (!hy.followupStatuses.includes(r.status)) return false; const d = daysSinceServer(r.lastcontact || r.applied); return d != null && d >= hy.followupDays; }).sort(byEv);
  const closed = rows.filter(r => (r.reqCheck || '') === 'closed' && r.status !== 'Archived').sort(byEv);
  const today = new Date().toISOString().slice(0, 10);
  const line = r => `[${r.tier || '?'}] EV ${ev(r)} · ${r.company} — ${r.role}`;
  const sec = (title, items, extra) => {
    let t = `\n${title} (${items.length})\n`;
    if (!items.length) t += '  — none —\n';
    else items.slice(0, 25).forEach(r => { t += '  • ' + line(r) + (extra ? extra(r) : '') + (r.link ? '\n    ' + r.link : '') + '\n'; });
    return t;
  };
  const text =
    `Job Pipeline CRM — morning digest ${today}\n` +
    sec(`🆕 New finds (last ${days}d)`, newFinds) +
    sec('⏰ Follow-ups due', followUps, r => r.applied ? ` · applied ${r.applied}` : '') +
    sec('✖ Newly-closed reqs', closed);
  const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const htmlSec = (title, items, extra) => `<h3 style="margin:14px 0 6px;color:#1F1E5D">${title} (${items.length})</h3>` +
    (items.length ? '<ul style="margin:0;padding-left:18px">' + items.slice(0, 25).map(r =>
      `<li style="margin:3px 0"><b>[${r.tier || '?'}]</b> EV ${ev(r)} · ${esc(r.company)} — ${esc(r.role)}${extra ? extra(r) : ''}${r.link ? ` · <a href="${esc(r.link)}">open</a>` : ''}</li>`).join('') + '</ul>' : '<p style="margin:0;color:#5A5D77">— none —</p>');
  const html = `<div style="font-family:system-ui,Arial,sans-serif;color:#1F1E5D;max-width:640px">` +
    `<h2 style="color:#1F1E5D">Job Pipeline CRM — morning digest <span style="color:#706CFF">${today}</span></h2>` +
    htmlSec(`🆕 New finds (last ${days}d)`, newFinds) +
    htmlSec('⏰ Follow-ups due', followUps, r => r.applied ? ` · applied ${esc(r.applied)}` : '') +
    htmlSec('✖ Newly-closed reqs', closed) + `</div>`;
  return {
    subject: `Job Pipeline CRM digest ${today} — ${newFinds.length} new · ${followUps.length} follow-ups · ${closed.length} closed`,
    text, html, counts: { newFinds: newFinds.length, followUps: followUps.length, closed: closed.length }, generatedAt: new Date().toISOString()
  };
}

// ---------- notification channels (Phase: notifications) ----------
const ALL_CHANNELS = ['inapp', 'file', 'slack', 'email', 'sms', 'push'];
function parseChannels(str, fallback) {
  const set = String(str || '').split(',').map(s => s.trim().toLowerCase()).filter(c => ALL_CHANNELS.includes(c));
  return set.length ? [...new Set(set)] : (fallback || []);
}
// Digest channels: new multi-select DIGEST_CHANNELS, else the legacy single DIGEST_CHANNEL, else file.
function digestChannels() { return parseChannels(cfg('DIGEST_CHANNELS'), [digestChannel()]); }
// US carrier email-to-SMS gateways — a free SMS path that reuses SMTP (no Twilio account). Carrier-
// dependent and best-effort (carriers filter/throttle), but $0. number@gateway -> arrives as a text.
const CARRIER_GATEWAYS = {
  verizon: 'vtext.com', att: 'txt.att.net', tmobile: 'tmomail.net', sprint: 'messaging.sprintpcs.com',
  uscellular: 'email.uscc.net', boost: 'sms.myboostmobile.com', cricket: 'sms.cricketwireless.net',
  metro: 'mymetropcs.com', googlefi: 'msg.fi.google.com', xfinity: 'vtext.com', visible: 'vtext.com'
};
const smsMethod = () => (cfg('SMS_METHOD') === 'email' ? 'email' : 'twilio');
const twilioConfigured = () => !!(cfg('TWILIO_ACCOUNT_SID') && cfg('TWILIO_AUTH_TOKEN') && cfg('TWILIO_FROM') && cfg('SMS_TO'));
function smsGatewayAddress() {
  const digits = String(cfg('SMS_GATEWAY_NUMBER') || '').replace(/\D/g, '');
  const dom = CARRIER_GATEWAYS[(cfg('SMS_CARRIER') || '').toLowerCase()];
  return (digits && dom) ? `${digits}@${dom}` : '';
}
const emailSmsConfigured = () => !!(emailConfigured() && smsGatewayAddress());
const smsConfigured = () => smsMethod() === 'email' ? emailSmsConfigured() : twilioConfigured();
const slackConfigured = () => !!cfg('DIGEST_SLACK_WEBHOOK');
const emailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER);
function channelReady(ch) {
  return ch === 'inapp' || ch === 'file' ? true
    : ch === 'slack' ? slackConfigured()
    : ch === 'email' ? emailConfigured()
    : ch === 'sms' ? smsConfigured()
    : ch === 'push' ? apnsConfigured()
    : false;
}
// In-app feed — a capped notifications log the board can poll + show as a bell with an unread count.
function appendInApp(n) {
  try {
    const feed = readJsonSafe(P.notifications, { items: [] });
    feed.items = feed.items || [];
    feed.items.unshift({ id: 'n' + crypto.randomBytes(4).toString('hex'), ts: new Date().toISOString(), read: false,
      title: n.title || '', body: n.body || '', kind: n.kind || 'info', link: n.link || '' });
    feed.items = feed.items.slice(0, 100);
    writeJsonPretty(P.notifications, feed);
  } catch (e) {}
}
// SMS — routes to the configured method. 'email' = free carrier email-to-SMS gateway over SMTP;
// 'twilio' = Twilio REST. Both soft-fail (skip) when not configured.
async function sendSms(text) {
  if (smsMethod() === 'email') {
    if (!emailSmsConfigured()) return { ok: false, skipped: 'email-sms-not-configured' };
    // Plain, short, text-only so the carrier gateway delivers it as a clean SMS (no HTML).
    await sendEmailPayload({ subject: '', text: String(text).slice(0, 300), html: '', to: smsGatewayAddress(), counts: {} });
    return { ok: true, via: 'email-gateway' };
  }
  if (!twilioConfigured()) return { ok: false, skipped: 'sms-not-configured' };
  const sid = cfg('TWILIO_ACCOUNT_SID');
  const auth = Buffer.from(sid + ':' + cfg('TWILIO_AUTH_TOKEN')).toString('base64');
  const form = new URLSearchParams({ To: cfg('SMS_TO'), From: cfg('TWILIO_FROM'), Body: String(text).slice(0, 1500) });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST', headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Twilio HTTP ' + r.status + ' ' + t.slice(0, 120)); }
  return { ok: true, via: 'twilio' };
}
async function sendSlack(text) {
  const url = cfg('DIGEST_SLACK_WEBHOOK') || '';
  if (!url) return { ok: false, skipped: 'slack-not-configured' };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!r.ok) throw new Error('Slack webhook HTTP ' + r.status);
  return { ok: true };
}
async function sendEmailPayload(payload) {
  if (!emailConfigured()) return { ok: false, skipped: 'email-not-configured' };
  const tmp = path.join(P.backups, 'digest-payload-' + backupStamp() + '.json');
  ensureBackupDir(); fs.writeFileSync(tmp, JSON.stringify(payload));
  await new Promise((resolve, reject) => {
    let err = '';
    const child = spawn(resolvePython(), [DIGEST_PYTHON, '--send-file', tmp], { cwd: ROOT, env: tenantEnv() });
    child.stderr && child.stderr.on('data', d => { err += d; });
    child.once('error', e => reject(e));
    child.once('exit', code => { try { fs.unlinkSync(tmp); } catch (e) {} code === 0 ? resolve() : reject(new Error('email send failed: ' + (err.trim() || ('exit ' + code)))); });
  });
  return { ok: true };
}
// Current tenant's email (for per-user digest delivery). '' in single-user / no email set.
function currentUserEmail() { if (!MULTIUSER()) return ''; const u = users.getById(store.currentUser()); return (u && u.email) || ''; }
// Welcome email for a new user — sent from the server's outbound identity (DIGEST_FROM / SMTP_USER,
// e.g. reqonapp@gmail.com) to the user's address. Best-effort; skips if SMTP or email is missing.
const _he = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
async function sendWelcomeEmail(user, tempPassword) {
  if (!user || !user.email) return { ok: false, skipped: 'no-email' };
  if (!emailConfigured()) return { ok: false, skipped: 'smtp-not-configured' };
  const base = (process.env.PUBLIC_URL || '').trim() || lanBase() || ('http://localhost:' + PORT);
  const name = user.displayName || user.username || user.id;
  const pwLine = tempPassword ? `Temporary password: ${tempPassword}  (change it in Settings after your first sign-in)\n` : '';
  const text = `Hi ${name},\n\nAn account was created for you on Reqon — your self-hosted job-search command center.\n\n` +
    `Sign in: ${base}/login\nUsername: ${user.id}\n${pwLine}\n` +
    `On first sign-in you'll answer a couple of quick questions (the roles you're after, an optional résumé) so your board starts relevant.\n\n— Reqon`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;color:#1F1E5D;max-width:560px;line-height:1.55">` +
    `<h2 style="color:#1F1E5D">Welcome to <span style="color:#00B57F">Reqon</span> 👋</h2>` +
    `<p>Hi ${_he(name)}, an account was created for you on Reqon — your job-search command center.</p>` +
    `<p><b>Sign in:</b> <a href="${_he(base)}/login">${_he(base)}/login</a><br><b>Username:</b> ${_he(user.id)}` +
    (tempPassword ? `<br><b>Temporary password:</b> <code>${_he(tempPassword)}</code> <span style="color:#5A5D77">(change it in Settings after first sign-in)</span>` : '') + `</p>` +
    `<p>On first sign-in we'll ask a couple of quick questions (target roles, an optional résumé) so your board starts relevant.</p>` +
    `<p style="color:#5A5D77">— Reqon</p></div>`;
  return sendEmailPayload({ subject: 'Welcome to Reqon', text, html, to: user.email, counts: {} });
}
// Deliver a digest payload to every requested channel. File is always written. Per-channel failures
// are collected (one bad channel doesn't sink the rest). Returns {delivered:[], skipped:[], errors:[]}.
async function deliverDigest(channels, payload) {
  const want = Array.isArray(channels) ? channels : parseChannels(channels, [digestChannel()]);
  const out = { delivered: [], skipped: [], errors: [] };
  try {
    fs.mkdirSync(path.join(DATA_DIR, 'agent'), { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, 'agent', 'digest-latest.html'), payload.html);
    fs.writeFileSync(path.join(DATA_DIR, 'agent', 'digest-latest.txt'), payload.text);
  } catch (e) {}
  const set = new Set(want); set.add('file');   // file fallback always
  for (const ch of set) {
    try {
      let r;
      if (ch === 'file') { out.delivered.push('file'); continue; }
      if (ch === 'inapp') { const c = payload.counts || {}; appendInApp({ title: 'Digest', body: `${c.newFinds || 0} new · ${c.followUps || 0} follow-ups · ${c.closed || 0} closed`, kind: 'digest' }); out.delivered.push('inapp'); continue; }
      if (ch === 'slack') r = await sendSlack(payload.text);
      else if (ch === 'email') { const to = currentUserEmail(); r = await sendEmailPayload(to ? { ...payload, to } : payload); }
      else if (ch === 'sms') r = await sendSms(payload.subject || payload.text.slice(0, 300));
      else if (ch === 'push') { const c = payload.counts || {}; r = await sendPush({ title: 'Morning digest', body: `${c.newFinds || 0} new · ${c.followUps || 0} follow-ups · ${c.closed || 0} closed`, eventKey: 'digest-' + new Date().toISOString().slice(0, 10) }); }
      if (r && r.ok) out.delivered.push(ch);
      else out.skipped.push({ channel: ch, reason: (r && r.skipped) || 'not configured' });
    } catch (e) { out.errors.push({ channel: ch, error: e.message }); }
  }
  return out;
}
// Generic short-event notification (used by Gmail ingest). Dispatches to the given channels.
async function dispatchNotify({ title, body, channels, kind, eventKey }) {
  const want = new Set(Array.isArray(channels) ? channels : parseChannels(channels, ['inapp']));
  const out = { delivered: [], skipped: [], errors: [] };
  for (const ch of want) {
    try {
      let r;
      if (ch === 'inapp') { appendInApp({ title, body, kind: kind || 'event' }); out.delivered.push('inapp'); continue; }
      if (ch === 'file') { out.skipped.push({ channel: 'file', reason: 'n/a for events' }); continue; }
      if (ch === 'slack') r = await sendSlack(`*${title}*\n${body}`);
      else if (ch === 'email') r = await sendEmailPayload({ subject: title, text: title + '\n\n' + body, html: `<h3>${title}</h3><p>${body}</p>`, counts: {} });
      else if (ch === 'sms') r = await sendSms(title + ' — ' + body);
      else if (ch === 'push') r = await sendPush({ title, body, eventKey: eventKey || 'evt-' + Date.now() });
      if (r && r.ok) out.delivered.push(ch); else out.skipped.push({ channel: ch, reason: (r && r.skipped) || 'not configured' });
    } catch (e) { out.errors.push({ channel: ch, error: e.message }); }
  }
  return out;
}

app.get('/api/digest', (req, res) => {
  const days = req.query.days ? parseInt(req.query.days, 10) : digestDays();
  res.json({ ok: true, digest: composeDigest(days) });
});

app.post('/api/digest/send', async (req, res) => {
  const b = req.body || {};
  // accept an explicit channels array (test a specific set) or fall back to the configured set
  const channels = Array.isArray(b.channels) ? parseChannels(b.channels.join(','), digestChannels())
    : (b.channel ? parseChannels(b.channel, digestChannels()) : digestChannels());
  try {
    const payload = composeDigest(b.days);
    const r = await deliverDigest(channels, payload);
    let st = readJsonSafe(P.digestState, {});
    st.lastSent = new Date().toISOString(); st.lastChannel = r.delivered.join('+'); st.lastCounts = payload.counts;
    writeJsonPretty(P.digestState, st);
    res.json({ ok: true, delivered: r.delivered, skipped: r.skipped, errors: r.errors, counts: payload.counts });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// In-app notification feed (the board polls this + shows a bell with an unread count).
app.get('/api/notifications', (req, res) => {
  const feed = readJsonSafe(P.notifications, { items: [] });
  const items = (feed.items || []).slice(0, 50);
  res.json({ ok: true, items, unread: items.filter(i => !i.read).length });
});
app.post('/api/notifications/read', (req, res) => {
  const feed = readJsonSafe(P.notifications, { items: [] });
  const ids = Array.isArray((req.body || {}).ids) ? new Set(req.body.ids) : null;
  (feed.items || []).forEach(i => { if (!ids || ids.has(i.id)) i.read = true; });
  writeJsonPretty(P.notifications, feed);
  res.json({ ok: true, unread: (feed.items || []).filter(i => !i.read).length });
});

// In-server scheduler: once a minute, if enabled and the local HH:MM matches and we haven't
// sent today, compose + deliver. Runs only while the server is up (launchd keeps it up).
function digestScheduler() {
  try {
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const today = now.toISOString().slice(0, 10);
    // Runs inside a tenant context; digestEnabled()/digestTime() resolve THAT user's settings via cfg().
    const sendIfDue = () => {
      if (!digestEnabled()) return;
      if (digestTime().padStart(5, '0') !== hhmm) return;       // each user's own scheduled time
      const st = readJsonSafe(P.digestState, {});
      if ((st.lastSent || '').slice(0, 10) === today) return;   // once-a-day guard (per-user file)
      composeDigestAndDeliver();
    };
    if (MULTIUSER()) {
      for (const u of users.list().filter(x => !x.disabled)) store.runAs(u.id, sendIfDue);   // per-user schedule + content
    } else {
      sendIfDue();   // owner / single-user (shared .env config)
    }
  } catch (e) { console.error('[digest]', e.message); }
}
async function composeDigestAndDeliver() {
  const job = jobs.create('digest', { label: 'Morning digest' });
  try {
    const payload = composeDigest();
    const r = await deliverDigest(digestChannels(), payload);   // push is now just another channel
    const st = readJsonSafe(P.digestState, {});
    st.lastSent = new Date().toISOString(); st.lastChannel = r.delivered.join('+'); st.lastCounts = payload.counts;
    writeJsonPretty(P.digestState, st);
    console.log('[digest] delivered:', r.delivered.join(', ') || '(none)', r.errors.length ? 'errors:' + JSON.stringify(r.errors) : '', payload.counts);
    jobs.finish(job.id, { delivered: r.delivered, counts: payload.counts });
  } catch (e) { jobs.fail(job.id, e.message); console.error('[digest] delivery failed:', e.message); }
}

// ---------- enrichment queue (Tier 2 infra) ----------
// The scout's STEP 0 reads this queue, then PATCHes each row back with enriched fields.
app.get('/api/reqs/needing-enrichment', (req, res) => {
  const rows = readStore();
  const queue = liveRows(rows).filter(r => r.needsEnrichment === true);
  res.json({ ok: true, count: queue.length, rows: queue });
});

// PATCH one row by reqKey (company|role, lowercased). Merges provided `fields`, computes the
// diff, writes an append-only audit-log entry, and (if fit/prob changed without an explicit tier)
// auto-derives tier. Pass result/sourceUrl/note for the log. conf=verified must be set explicitly
// by the caller — and ONLY when the live posting was confirmed this run.
// Per-role timeline (P2.5) — "how this role got here", reconstructed from the row's timestamped
// fields + its enrichment-log entries (tenant-scoped). Read-only, deterministic.
function enrichEntriesForKey(key) {
  const out = [];
  try {
    const txt = fs.readFileSync(P.enrichLog, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let e; try { e = JSON.parse(line); } catch (_) { continue; }
      if (e && String(e.key || '').toLowerCase().trim() === key) out.push(e);
    }
  } catch (_) { /* no log yet */ }
  return out;
}
app.get('/api/reqs/:key/timeline', (req, res) => {
  const key = decodeURIComponent(req.params.key || '').toLowerCase().trim();
  const row = readStore().find(r => reqKey(r) === key);
  if (!row) return res.status(404).json({ ok: false, error: 'no row matches key', key });
  const events = buildTimeline(row, enrichEntriesForKey(key));
  res.json({ ok: true, key, company: row.company, role: row.role, events, count: events.length });
});

// Deterministic follow-up recommendation for a role (P2.8) — state/channel/timing/contact. The
// message itself is drafted on demand via POST /api/assist {kind:'followup'}. Read-only.
app.get('/api/reqs/:key/followup', (req, res) => {
  const key = decodeURIComponent(req.params.key || '').toLowerCase().trim();
  const row = readStore().find(r => reqKey(r) === key);
  if (!row) return res.status(404).json({ ok: false, error: 'no row matches key', key });
  res.json({ ok: true, key, ...computeFollowup(row, new Date().toISOString().slice(0, 10)) });
});

app.patch('/api/reqs/:key', (req, res) => {
  const key = decodeURIComponent(req.params.key || '').toLowerCase().trim();
  const body = req.body || {};
  const fields = body.fields || {};
  const rows = readStore();
  const idx = rows.findIndex(r => reqKey(r) === key);
  if (idx < 0) {
    logEnrichment({ ts: new Date().toISOString(), run: body.run || null, key, action: 'enrich', result: 'fail', note: 'no row matched key' });
    return res.status(404).json({ ok: false, error: 'no row matches key', key });
  }
  const before = rows[idx];
  const apply = Object.assign({}, fields);
  // advancing to a new interview stage means a new round — clear the previous thank-you flag
  if (apply.status && (apply.status === 'Hiring Manager' || apply.status === 'Panel')) apply.thankYouSent = '';
  // auto-derive tier when scoring changed but tier wasn't explicitly provided (AUTO-promote/demote)
  if ((('fit' in apply) || ('prob' in apply)) && !('tier' in apply)) {
    apply.tier = computeTier(apply.fit != null ? apply.fit : before.fit, apply.prob != null ? apply.prob : before.prob, tierThresholds(readJsonSafe(P.boards, {})));
  }
  const changes = {};
  for (const k of Object.keys(apply)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(apply[k])) changes[k] = { old: before[k] === undefined ? null : before[k], new: apply[k] };
  }
  Object.assign(rows[idx], apply);
  touchRow(rows[idx]);
  const after = rows[idx];
  try { writeStore(rows); }
  catch (e) { return res.status(500).json({ ok: false, error: e.message }); }

  const entry = {
    ts: new Date().toISOString(),
    run: body.run || null,
    key,
    action: 'enrich',
    result: body.result || (Object.keys(changes).length ? 'pass' : 'noop'),
    changes,
    sourceUrl: body.sourceUrl || (apply.link != null ? apply.link : null),
    note: body.note || null
  };
  if (before.tier !== after.tier) entry.tier = { old: before.tier === undefined ? null : before.tier, new: after.tier };
  if (before.conf !== after.conf) entry.conf = { old: before.conf === undefined ? null : before.conf, new: after.conf };
  logEnrichment(entry);

  // Auto-create the interview prep guide the first time a role enters an interview stage (manual
  // move OR mail-ingest advance both land here). Fire-and-forget so the PATCH stays fast.
  if (changes.status && INTERVIEW_STAGES.has(after.status) && !after.guideAt && aiKey() && assistEnabled()) {
    buildAndStoreGuide(key).catch((e) => console.error('[interview-guide]', e.message));
  }

  res.json({ ok: true, key, changes, tier: after.tier, conf: after.conf, needsEnrichment: after.needsEnrichment === true, guidePending: !!(changes.status && INTERVIEW_STAGES.has(after.status) && !after.guideAt), logged: true });
});

// ---------- sync (WP-0): device↔server reconcile ----------
// Reconcile logic lives in core/crm-core.js (reconcileSync, wrapped above with server uuid/clock).
app.post('/api/sync', (req, res) => {
  const b = req.body || {};
  const clientRows = Array.isArray(b.rows) ? b.rows : [];
  const since = typeof b.since === 'string' ? b.since : '';
  const current = readStore();
  ensureRowIdentity(current);
  const { rows: merged, applied, conflicts, idRemaps } = reconcileSync(current, clientRows);
  try {
    if (applied > 0) {
      snapshotData('auto'); pruneAutoBackups();
      writeStore(merged);
      logChange({ ts: nowIso(), action: 'sync', clientSent: clientRows.length, applied, conflicts, idRemaps: idRemaps.length, after: merged.length });
    }
    // Delta feed: when the client sends a `since` cursor we normally return only rows changed
    // since then — BUT a row the client doesn't have yet must ALWAYS be sent, even if its
    // syncedAt predates the cursor (e.g. a freshly-paired or re-paired device with a stale
    // cursor, or rows whose syncedAt was backfilled from old `added` dates). Otherwise the
    // device can sit at 0 rows forever. So: always send rows the client is missing; for rows it
    // already has, honor the cursor.
    const clientIds = new Set(clientRows.map(r => r && r.id).filter(Boolean));
    const back = since
      ? merged.filter(r => !clientIds.has(r.id) || (r.syncedAt || r.updatedAt || '') > since)
      : merged;
    res.json({ ok: true, rows: back, serverTime: nowIso(), applied, conflicts, idRemaps });
  } catch (e) {
    console.error('[POST /api/sync]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Hard-purge tombstones (explicit maintenance only — deletes are otherwise soft).
app.post('/api/maintenance/purge-tombstones', (req, res) => {
  const rows = readStore();
  const keep = rows.filter(r => r.deleted !== true);
  const purged = rows.length - keep.length;
  if (purged > 0) {
    snapshotData('manual');
    writeStore(keep);
    logChange({ ts: nowIso(), action: 'purge-tombstones', purged, after: keep.length });
  }
  res.json({ ok: true, purged, total: keep.length });
});

// ---------- lead enrichment worker (fetch posting → JSON-LD/OG → real fields) ----------
async function fetchHtml(url) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept': 'text/html' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(timer); }
}
function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
function metaContent(html, prop) {
  const re = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '["\'][^>]*>', 'i');
  const m = html.match(re); if (!m) return '';
  const c = m[0].match(/content=["']([^"']*)["']/i); return c ? c[1].trim() : '';
}
function parseJsonLdJobs(html) {
  const out = []; const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) {
    let d; try { d = JSON.parse(m[1].trim()); } catch (e) { continue; }
    const arr = Array.isArray(d) ? d : (d && Array.isArray(d['@graph']) ? d['@graph'] : [d]);
    for (const o of arr) {
      const t = o && o['@type'];
      if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) out.push(o);
    }
  }
  return out;
}
function extractJobMeta(html, url) {
  const res = { company: '', role: '', location: '', remote: '', jd: '', employmentType: '' };
  const jobs = parseJsonLdJobs(html);
  if (jobs.length) {
    const j = jobs[0];
    res.role = stripTags(j.title || '');
    const org = j.hiringOrganization;
    res.company = stripTags((org && (org.name || (typeof org === 'string' ? org : ''))) || '');
    const addr = a => { const ad = a && a.address; if (!ad) return ''; return [ad.addressLocality, ad.addressRegion].filter(v => v && !/^n\/?a$/i.test(String(v).trim())).join(', '); };
    const jl = j.jobLocation; let loc = '';
    if (Array.isArray(jl)) loc = jl.map(addr).filter(Boolean).join(' / '); else if (jl) loc = addr(jl);
    res.jd = stripTags(j.description || '').slice(0, 4000);
    const remote = j.jobLocationType === 'TELECOMMUTE' || /\bremote\b/i.test(loc) || /\bremote\b/i.test(res.jd.slice(0, 400));
    if (remote) { res.remote = 'remote'; res.location = loc || 'Remote'; }
    else if (loc) { res.location = loc; res.remote = 'onsite'; }
    res.employmentType = (Array.isArray(j.employmentType) ? j.employmentType.join(',') : j.employmentType) || '';
  }
  const ogTitle = (metaContent(html, 'og:title') || '').replace(/\s*\|\s*[^|]*$/, '').trim();
  const titleTag = stripTags(((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]) || '')
    .replace(/\s*\|\s*[^|]*$/, '').replace(/^job application for\s+/i, '').trim();
  // COMPANY — the ATS URL slug is authoritative (greenhouse/ashby/lever put the company in the path).
  // Title fragments like "Staff Product Manager - Enterprise AI" are a TEAM, not the company, so we
  // never split a "- X" / ", X" tail off as the company. Fallbacks: JSON-LD org, then "… at Company".
  const urlCompany = companyFromUrl(url);
  if (urlCompany) res.company = urlCompany;
  if (!res.company) { const m = titleTag.match(/\s+at\s+(\S.+)$/i); if (m) res.company = m[1].trim(); }
  // ROLE — keep the full title (og:title on ATS boards is the pure role and may contain "-"/","); only
  // trim a trailing " at <company>" if present. Never truncate at a dash/comma.
  if (!res.role) res.role = ogTitle || titleTag.replace(/\s+at\s+\S.+$/i, '').trim();
  if (res.role && res.company) {
    res.role = res.role.replace(new RegExp('\\s+at\\s+' + res.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'), '').trim();
  }
  if (!res.jd) { const ogd = metaContent(html, 'og:description'); if (ogd) res.jd = ogd.slice(0, 2000); }
  if (!res.remote && /\bremote\b/i.test(res.jd.slice(0, 400))) res.remote = 'remote';   // detect remote when JSON-LD didn't
  return res;
}
// Company from an ATS URL slug — greenhouse/ashby/lever/workable put it in the path; the most
// reliable source when page metadata lacks a company. Title-cases the slug (twilio -> Twilio).
function companyFromUrl(url) {
  try {
    const u = new URL(url); const h = u.hostname.toLowerCase();
    const seg = u.pathname.split('/').filter(Boolean);
    let slug = '';
    if (h.includes('greenhouse.io') || h.includes('ashbyhq.com') || h.includes('lever.co') || h.includes('workable.com')) slug = seg[0] || '';
    else if (h.includes('myworkdayjobs.com')) slug = h.split('.')[0] || '';
    if (!slug || /^(jobs?|careers?|apply|embed|en|en-us|o|p)$/i.test(slug)) return '';
    return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
  } catch (e) { return ''; }
}
function guessSector(text) {
  const t = (text || '').toLowerCase();
  if (/\b(cdp|customer data platform)\b/.test(t)) return 'CDP / Customer Data';
  if (/\b(genai|gen ai|llm|agentic|\bml\b|machine learning|ai platform|\bai\/ml\b|model)\b/.test(t)) return 'AI Platform';
  if (/\b(identity|iam|sso|scim|authn|authz|access management)\b/.test(t)) return 'Identity / Data';
  if (/\b(martech|marketing|audience|segment|engagement|campaign|crm)\b/.test(t)) return 'Martech / Engagement';
  if (/\b(data platform|data product|pipeline|snowflake|data lake|etl|warehouse|data infra|databricks)\b/.test(t)) return 'Data Infra';
  return 'Enterprise SaaS';
}
async function scoreLead(company, role, jd) {
  if (!aiKey()) return null;
  try {
    const prof = readProfile();   // disk-aware + tenant-scoped (was a stale ROOT/agent/profile.json read)
    const kws = (prof.keywords || []).slice(0, 30).map(k => k.kw).join(', ');
    const system = 'You score job fit for a Principal/Director-level Product Manager who is remote-only (US). Priority domains (fit 8-10): data platform, AI/LLM/agentic platform, CDP, martech/identity, API/developer platform, IAM/SSO. Secondary (~7): usage-billing, catalog/commerce, enterprise SaaS. Penalize on-site heavily. Return ONLY compact JSON: {"fit":<0-10>,"prob":<0-10>,"sector":"<CDP / Customer Data|Martech / Engagement|Data Infra|Identity / Data|Enterprise SaaS|AI Platform>"}.';
    const user = 'Candidate keywords: ' + kws + '\n\nCompany: ' + company + '\nRole: ' + role + '\nJD:\n' + String(jd || '').slice(0, 3000);
    const { content } = await openaiChat({ model: assistModel(), system, user, maxTokens: 120 });
    const m = content && content.match(/\{[\s\S]*\}/); if (!m) return null;
    const j = JSON.parse(m[0]);
    const num = v => { const n = parseFloat(v); return isNaN(n) ? null : Math.max(0, Math.min(10, n)); };
    return { fit: num(j.fit), prob: num(j.prob), sector: j.sector };
  } catch (e) { return null; }
}
// Fetch a row's posting and compute the enriched field set (no store I/O). Returns
// {fields, scored} or null when there's no link / no extractable metadata. Shared by the
// manual /api/enrich/run route AND quickadd's background auto-enrich.
async function computeEnrichFields(row, opts) {
  opts = opts || {};
  const url = row.link || row.url || '';
  if (!url) return null;
  const html = await fetchHtml(url);
  const meta = extractJobMeta(html, url);
  if (!meta.company && !meta.role) return null;
  const fields = {};
  if (meta.company) fields.company = meta.company;
  if (meta.role) fields.role = meta.role;
  if (meta.location) fields.location = meta.location;
  if (meta.remote) fields.remote = meta.remote;
  if (meta.jd) fields.notes = meta.jd.slice(0, 1200) + ' [enriched ' + new Date().toISOString().slice(0, 10) + ']';
  let sector = guessSector((meta.role || '') + ' ' + (meta.jd || ''));
  let scored = null;
  if (opts.score !== false) scored = await scoreLead(meta.company || row.company, meta.role || row.role, meta.jd);
  if (scored) { if (scored.fit != null) fields.fit = scored.fit; if (scored.prob != null) fields.prob = scored.prob; if (scored.sector) sector = scored.sector; }
  fields.sector = sector;
  fields.conf = 'boardonly';
  fields.needsEnrichment = false;
  if (('fit' in fields) || ('prob' in fields)) fields.tier = computeTier(fields.fit != null ? fields.fit : row.fit, fields.prob != null ? fields.prob : row.prob, tierThresholds(readJsonSafe(P.boards, {})));
  return { fields, scored };
}
// Apply enriched fields to rows[idx], but if the corrected company+role now matches a DIFFERENT
// existing row (e.g. a lead resolves to a role the scout already tracks), drop the lead instead of
// duplicating — the existing (possibly edited/verified) row wins. Mutates `rows`.
function applyEnrichedRow(rows, idx, fields) {
  // probe with the post-enrichment company/role but the row's existing link (carries the req id)
  const probe = { company: fields.company || rows[idx].company, role: fields.role || rows[idx].role, link: fields.link || rows[idx].link };
  const dup = rows.findIndex((r, j) => j !== idx && sameReq(r, probe) && r.deleted !== true);
  if (dup >= 0) {
    // tombstone (not splice) so the duplicate lead's removal propagates through sync
    const removed = rows[idx];
    removed.deleted = true; touchRow(removed);
    return { action: 'merged', key: reqKey(removed), into: reqKey(probe), changes: {} };
  }
  const before = Object.assign({}, rows[idx]);
  Object.assign(rows[idx], fields);
  touchRow(rows[idx]);
  const changes = {};
  for (const k of Object.keys(fields)) if (JSON.stringify(before[k]) !== JSON.stringify(fields[k])) changes[k] = { old: before[k] === undefined ? null : before[k], new: fields[k] };
  return { action: 'updated', key: reqKey(rows[idx]), changes };
}
// Fire-and-forget enrichment of one row by key — used by quickadd so a capture becomes a full,
// scored row on its own. Re-reads the store after the (slow) fetch so a concurrent save isn't lost.
// Never throws; logs to the enrichment audit log.
async function backgroundEnrich(key) {
  const job = jobs.create('enrichment', { label: 'Enrich · ' + key });
  try {
    let rows = readStore();
    let idx = rows.findIndex(r => reqKey(r) === key);
    if (idx < 0) { jobs.fail(job.id, 'row not found'); return; }
    jobs.phase(job.id, 'fetching posting', 30);
    const ce = await computeEnrichFields(rows[idx], { score: true });
    if (!ce) { jobs.fail(job.id, 'could not fetch posting'); return; }
    rows = readStore();                                   // re-read post-fetch
    idx = rows.findIndex(r => reqKey(r) === key);
    if (idx < 0) { jobs.fail(job.id, 'row removed during enrich'); return; }
    const res = applyEnrichedRow(rows, idx, ce.fields);
    writeStore(rows);
    logEnrichment({ ts: new Date().toISOString(), run: 'auto-enrich', key, action: 'enrich',
      result: res.action === 'merged' ? 'merged' : 'pass', changes: res.changes,
      note: res.action === 'merged' ? ('resolved to already-tracked ' + res.into + '; duplicate lead removed') : ('auto-enrich on capture' + (ce.scored ? ' + AI score' : '')) });
    jobs.finish(job.id, { action: res.action, scored: !!ce.scored });
  } catch (e) { jobs.fail(job.id, e.message); console.error('[auto-enrich]', e.message); }
}
// POST /api/enrich/run  body: {key?: "company|role"} single, or {all:true}/none => all needsEnrichment leads.
// Full-auth only. Fetches each posting, extracts real fields, optionally AI-scores, audits, snapshots first.
app.post('/api/enrich/run', async (req, res) => {
  const body = req.body || {};
  const wantKey = body.key ? String(body.key).toLowerCase().trim() : null;
  const doScore = body.score !== false;
  const rows = readStore();
  const targets = rows.map((r, i) => ({ r, i })).filter(o => wantKey ? reqKey(o.r) === wantKey : o.r.needsEnrichment === true);
  if (!targets.length) return res.json({ ok: true, enriched: 0, failed: 0, results: [], note: 'No matching leads to enrich.' });
  let snapped = false; const results = [];
  // descending index order so a dedupe splice never shifts an index we haven't processed yet
  targets.sort((a, b) => b.i - a.i);
  for (const { r, i } of targets) {
    try {
      const ce = await computeEnrichFields(r, { score: doScore });
      if (!ce) { results.push({ key: reqKey(r), ok: false, note: 'no link or no metadata (JS-only page?)' }); continue; }
      if (!snapped) { snapshotData('auto'); snapped = true; }
      const res = applyEnrichedRow(rows, i, ce.fields);
      logEnrichment({ ts: new Date().toISOString(), run: 'enrich-worker', key: res.key, action: 'enrich',
        result: res.action === 'merged' ? 'merged' : 'pass', changes: res.changes, sourceUrl: r.link || null,
        note: res.action === 'merged' ? ('resolved to already-tracked ' + res.into + '; duplicate lead removed') : ('JSON-LD/OG enrichment' + (ce.scored ? ' + AI score' : '')) });
      if (res.action === 'merged') results.push({ key: res.key, ok: true, merged: true, into: res.into });
      else results.push({ key: res.key, ok: true, company: rows[i].company, role: rows[i].role, scored: !!ce.scored });
    } catch (e) { results.push({ key: reqKey(r), ok: false, note: e.message }); }
  }
  try { writeStore(rows); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  const enriched = results.filter(x => x.ok).length;
  res.json({ ok: true, enriched, failed: results.length - enriched, results });
});

// ---------- push (WP-0): APNs sender + device registry ----------
// Token-based APNs (.p8 / ES256 JWT over HTTP/2, zero deps). INERT until the four APNS_* env
// vars are set — same gating pattern as SMTP/Slack. Outbound-only: works behind NAT, no tunnel.
const apnsConfigured = () => !!(process.env.APNS_KEY_P8_PATH && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_BUNDLE_ID);
let apnsJwtCache = { token: '', iat: 0 };
function apnsAuthToken() {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwtCache.token && now - apnsJwtCache.iat < 2400) return apnsJwtCache.token;   // APNs: reuse 20–60 min
  const key = fs.readFileSync(path.resolve(ROOT, process.env.APNS_KEY_P8_PATH), 'utf8');
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b64({ alg: 'ES256', kid: process.env.APNS_KEY_ID }) + '.' + b64({ iss: process.env.APNS_TEAM_ID, iat: now });
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  apnsJwtCache = { token: unsigned + '.' + sig, iat: now };
  return apnsJwtCache.token;
}
const pushDevices = () => readJsonSafe(P.pushTokens, []);
// payload: {title, body, eventKey} — eventKey lets the app dedupe vs its own local notifications.
async function sendPush(payload) {
  if (!apnsConfigured()) return { ok: false, skipped: 'apns-not-configured' };
  const devices = pushDevices();
  if (!devices.length) return { ok: false, skipped: 'no-devices' };
  const host = process.env.APNS_ENV === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
  const body = JSON.stringify({ aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' }, eventKey: payload.eventKey || '' });
  const http2 = require('http2');
  let sent = 0, failed = 0;
  const client = http2.connect('https://' + host);
  try {
    await Promise.all(devices.map(d => new Promise(resolve => {
      const req = client.request({
        ':method': 'POST', ':path': '/3/device/' + d.token,
        'authorization': 'bearer ' + apnsAuthToken(),
        'apns-topic': process.env.APNS_BUNDLE_ID, 'apns-push-type': 'alert',
        'content-type': 'application/json'
      });
      req.on('response', h => { h[':status'] === 200 ? sent++ : failed++; });
      req.on('error', () => { failed++; resolve(); });
      req.on('close', resolve);
      req.end(body);
    })));
  } catch (e) { console.error('[push]', e.message); } finally { try { client.close(); } catch (e) {} }
  console.log(`[push] "${payload.title}" sent=${sent} failed=${failed}`);
  return { ok: true, sent, failed };
}
app.post('/api/push/register', (req, res) => {
  const b = req.body || {};
  const token = String(b.token || '').trim();
  if (!token) return res.status(400).json({ ok: false, error: 'token required' });
  const list = pushDevices();
  if (!list.some(d => d.token === token)) {
    list.push({ token, platform: b.platform || 'ios', registeredAt: nowIso() });
    writeJsonPretty(P.pushTokens, list);
  }
  res.json({ ok: true, devices: list.length, apnsConfigured: apnsConfigured() });
});
// Manual test push (full-auth) — verifies the APNs pipeline without waiting on a scout run.
app.post('/api/push/test', async (req, res) => {
  const r = await sendPush({ title: 'Job Pipeline CRM', body: (req.body || {}).message || 'Test push from the server.', eventKey: 'test-' + Date.now() });
  res.json(Object.assign({ ok: true }, r));
});
// APNs config (board-managed; mirrors the env-only setup). NEVER echoes the .p8 contents — only
// whether each piece is set + non-secret IDs. The key can be a server path OR a pasted .p8 body
// (written to a 0600 file under agent/, which is gitignored).
// Uploaded APNs signing key — under the persistent data dir so it survives redeploys. Consumers
// resolve APNS_KEY_P8_PATH via path.resolve(ROOT, ...), which passes an absolute path through
// unchanged, so we store an absolute path when disk-backed and a ROOT-relative path locally.
const APNS_KEY_FILE = path.join(DATA_DIR, 'agent', 'apns-AuthKey.p8');
const pushConfigPayload = () => {
  let keySet = false;
  try { keySet = !!(process.env.APNS_KEY_P8_PATH && fs.existsSync(path.resolve(ROOT, process.env.APNS_KEY_P8_PATH))); } catch (e) {}
  return {
    ok: true,
    configured: apnsConfigured(),
    keyId: process.env.APNS_KEY_ID || '',
    teamId: process.env.APNS_TEAM_ID || '',
    bundleId: process.env.APNS_BUNDLE_ID || '',
    env: process.env.APNS_ENV === 'production' ? 'production' : 'sandbox',
    keyPath: process.env.APNS_KEY_P8_PATH || '',
    keySet,
    devices: pushDevices().length,
  };
};
app.get('/api/push/config', (req, res) => res.json(pushConfigPayload()));
app.post('/api/push/config', (req, res) => {
  const b = req.body || {};
  const upd = {};
  if (b.clear === true) {
    upd.APNS_KEY_ID = ''; upd.APNS_TEAM_ID = ''; upd.APNS_BUNDLE_ID = ''; upd.APNS_KEY_P8_PATH = '';
  } else {
    if (typeof b.keyId === 'string') upd.APNS_KEY_ID = b.keyId.trim();
    if (typeof b.teamId === 'string') upd.APNS_TEAM_ID = b.teamId.trim();
    if (typeof b.bundleId === 'string') upd.APNS_BUNDLE_ID = b.bundleId.trim();
    if (typeof b.env === 'string') upd.APNS_ENV = b.env === 'production' ? 'production' : 'sandbox';
    // Key: either a pasted .p8 body (written to a 0600 file) or an explicit server path. Blank = keep.
    if (typeof b.keyP8 === 'string' && b.keyP8.includes('BEGIN PRIVATE KEY')) {
      try { fs.mkdirSync(path.dirname(APNS_KEY_FILE), { recursive: true }); fs.writeFileSync(APNS_KEY_FILE, b.keyP8.trim() + '\n', { mode: 0o600 }); }
      catch (e) { return res.status(500).json({ ok: false, error: 'could not save key: ' + e.message }); }
      // Absolute when disk-backed (resolves regardless of CWD); ROOT-relative locally (unchanged).
      upd.APNS_KEY_P8_PATH = DATA_DIR === ROOT ? path.relative(ROOT, APNS_KEY_FILE) : APNS_KEY_FILE;
    } else if (typeof b.keyPath === 'string' && b.keyPath.trim()) {
      upd.APNS_KEY_P8_PATH = b.keyPath.trim();
    }
  }
  try { if (Object.keys(upd).length) setEnvVars(upd); }
  catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  res.json(pushConfigPayload());
});

// ---------- scout trigger (deterministic core; optional OpenAI enrichment) ----------
// POST /api/scout/run {mode:'find'|'validate'|'both'}  -> spawns agent/scout_run.py detached,
//   returns immediately. GET /api/scout/status -> live progress from agent/scout-status.json.
// The child inherits the server env, so OPENAI_API_KEY / OPENAI_MODEL (if set) enable the
// LLM rescoring layer. One run at a time; killed after a hard timeout.
const SCOUT_RUNNER = path.join(ROOT, 'agent', 'scout_run.py');
const SCOUT_TIMEOUT_MS = 6 * 60 * 1000;
let scoutChild = null;     // current child process, or null when idle
let scoutMeta = null;      // { mode, startedAt } for the active run

function resolvePython() {
  if (process.env.SCOUT_PYTHON) return process.env.SCOUT_PYTHON;
  for (const p of ['/usr/bin/python3', '/opt/homebrew/bin/python3', '/usr/local/bin/python3']) {
    try { if (fs.existsSync(p)) return p; } catch (e) {}
  }
  return 'python3'; // last resort: PATH lookup
}
function writeScoutStatus(obj) {
  try { fs.writeFileSync(P.scoutStatus, JSON.stringify(obj, null, 2)); } catch (e) {}
}

app.get('/api/scout/status', (req, res) => {
  let last = null;
  try { last = JSON.parse(fs.readFileSync(P.scoutStatus, 'utf8')); } catch (e) {}
  const llmEnabled = !!aiKey();
  res.json({
    ok: true, running: !!scoutChild, current: scoutMeta, last,
    llmEnabled, llmModel: llmEnabled ? (cfg('OPENAI_MODEL') || 'gpt-5.4-mini') : null
  });
});

// ---------- Gmail response ingest: app-managed config + server-run ----------
// Credentials live in .env (written via setEnvVars, picked up without a restart). The config
// endpoints NEVER return the app password — only whether it's set + its last 4. The run endpoint
// spawns agent/mail_ingest.py and returns its report (the user's own pipeline data, not secrets).
const mailConfigPayload = () => ({
  ok: true,
  configured: !!(cfg('GMAIL_USER') && cfg('GMAIL_APP_PASSWORD')),
  user: cfg('GMAIL_USER') || '',
  passSet: !!cfg('GMAIL_APP_PASSWORD'),
  passLast4: last4(cfg('GMAIL_APP_PASSWORD') || ''),
  label: cfg('GMAIL_LABEL') || 'INBOX',
  ai: cfg('MAIL_AI') === 'true',
  sinceDays: parseInt(cfg('MAIL_SINCE_DAYS') || '14', 10) || 14,
});
app.get('/api/mail/config', (req, res) => res.json(mailConfigPayload()));
app.post('/api/mail/config', (req, res) => {
  const b = req.body || {};
  const upd = {};
  if (b.clear === true) { upd.GMAIL_USER = ''; upd.GMAIL_APP_PASSWORD = ''; }
  else {
    if (typeof b.user === 'string') upd.GMAIL_USER = b.user.trim();
    if (typeof b.password === 'string' && b.password) upd.GMAIL_APP_PASSWORD = b.password.trim(); // blank = keep current
    if (typeof b.label === 'string') upd.GMAIL_LABEL = b.label.trim() || 'INBOX';
    if (typeof b.ai === 'boolean') upd.MAIL_AI = b.ai ? 'true' : 'false';
    if (b.sinceDays != null && b.sinceDays !== '') {
      const d = Math.max(1, Math.min(90, parseInt(b.sinceDays, 10) || 14));
      upd.MAIL_SINCE_DAYS = String(d);
    }
  }
  try { if (Object.keys(upd).length) { if (perUserScope()) setUserCfg(upd); else setEnvVars(upd); } }   // Gmail ingest is per-user
  catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  res.json(mailConfigPayload());
});
let mailChild = null;
app.post('/api/mail/run', (req, res) => {
  if (mailChild) return res.status(409).json({ ok: false, error: 'A mail run is already in progress.' });
  if (!cfg('GMAIL_USER') || !cfg('GMAIL_APP_PASSWORD')) {
    return res.status(400).json({ ok: false, error: 'Gmail isn’t configured yet.' });
  }
  const apply = (req.body || {}).apply === true;   // default: dry-run (writes nothing)
  const argv = [path.join(ROOT, 'agent', 'mail_ingest.py')];
  if (apply) argv.push('--apply');
  if (cfg('MAIL_AI') === 'true') argv.push('--ai');
  let child, out = '', err = '', done = false;
  const uid = store.currentUser();   // capture tenant for the async exit handler (per-user notifications)
  const job = jobs.create('gmail_ingest', { label: 'Gmail ingest' + (apply ? ' (apply)' : ' (dry-run)') });
  const finish = (status, payload) => { if (done) return; done = true; mailChild = null; payload && payload.ok ? jobs.finish(job.id, payload.summary || null) : jobs.fail(job.id, (payload && payload.error) || 'failed'); res.status(status).json(payload); };
  try { child = spawn(resolvePython(), argv, { cwd: ROOT, env: tenantEnv() }); }
  catch (e) { return finish(500, { ok: false, error: 'Could not start mail ingest: ' + (e.message || e) }); }
  mailChild = child;
  jobs.onCancel(job.id, () => { try { child.kill('SIGKILL'); } catch (e) {} });
  const killer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} }, 90000);
  child.stdout && child.stdout.on('data', d => { out += d; if (out.length > 20000) out = out.slice(-20000); });
  child.stderr && child.stderr.on('data', d => { err += d; });
  child.once('error', e => { clearTimeout(killer); finish(500, { ok: false, error: 'python launch failed: ' + (e.message || e) }); });
  child.once('exit', code => store.runAs(uid, () => {
    clearTimeout(killer);
    if (code !== 0) return finish(500, { ok: false, error: (err.trim() || ('exit ' + code)).slice(0, 800), report: out });
    // Parse the machine-readable summary line and fire per-event notifications (rejection/interview/
    // offer) on the channels the user picked — only on a real --apply run, not a dry run.
    let summary = null;
    try { const m = out.match(/SUMMARY_JSON (\{.*\})\s*$/m); if (m) summary = JSON.parse(m[1]); } catch (e) {}
    if (apply && summary && Array.isArray(summary.events)) {
      const want = { rejection: cfg('MAIL_NOTIFY_REJECTION') === 'true', interview: cfg('MAIL_NOTIFY_INTERVIEW') === 'true', offer: cfg('MAIL_NOTIFY_OFFER') === 'true' };
      const channels = parseChannels(cfg('MAIL_NOTIFY_CHANNELS'), ['inapp']);
      const emoji = { rejection: '✖', interview: '📞', offer: '★' };
      for (const ev of summary.events) {
        if (!want[ev.kind]) continue;
        dispatchNotify({ title: `${emoji[ev.kind] || ''} ${ev.kind[0].toUpperCase() + ev.kind.slice(1)}: ${ev.company || ''}`,
          body: `${ev.role || ''} — detected in your inbox.`, channels, kind: ev.kind, eventKey: `mail-${ev.kind}-${ev.company}-${new Date().toISOString().slice(0, 10)}` }).catch(() => {});
      }
    }
    finish(200, { ok: true, applied: apply, report: out, summary });
  }));
});

// Start a scout in the CURRENT tenant context (used by /api/scout/run and the admin force-scout op).
// Returns a result object; the caller responds. Captures the uid so async handlers stay tenant-scoped.
function triggerScout(mode, sources) {
  if (scoutChild) return { ok: false, status: 409, running: true, error: 'A scout run is already in progress.' };
  const startedAt = new Date().toISOString();
  scoutMeta = { mode, startedAt, sources: sources || 'all' };
  writeScoutStatus({ state: 'running', phase: 'starting', mode, startedAt, sources: sources || 'all' });
  const job = jobs.create('scout', { label: 'Scout · ' + mode + (sources ? ' (' + sources + ')' : ''), meta: { mode, sources: sources || 'all' } });

  const argv = [SCOUT_RUNNER, '--mode', mode, '--quiet'];
  if (sources) argv.push('--sources', sources);
  // Multi-user: point the scout subprocess at THIS tenant's namespace (file-mode, since loopback is
  // no longer auto-trusted to the server API). Capture the uid so the async exit handler resolves
  // P.* + digest to the right user. Single-user -> plain process.env (legacy paths), unchanged.
  const uid = store.currentUser();
  const scoutEnv = MULTIUSER()
    ? { ...tenantEnv(), REQON_FILE_MODE: '1', REQON_DATA_FILE: P.data, REQON_BOARDS_FILE: P.boards,
        REQON_WATCHLIST_FILE: P.watchlist, REQON_STATUS_FILE: P.scoutStatus, REQON_SOURCE_HEALTH_FILE: P.sourceHealth }
    : process.env;
  let child;
  try {
    child = spawn(resolvePython(), argv, { cwd: ROOT, env: scoutEnv });
  } catch (e) {
    scoutChild = null; scoutMeta = null;
    writeScoutStatus({ state: 'error', mode, error: 'spawn failed: ' + (e.message || e) });
    jobs.fail(job.id, 'spawn failed: ' + (e.message || e));
    return { ok: false, status: 500, error: 'Could not start scout: ' + (e.message || e) };
  }
  scoutChild = child;
  jobs.onCancel(job.id, () => { try { child.kill('SIGKILL'); } catch (e) {} });
  jobs.phase(job.id, 'searching boards', 10);
  const killer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} }, SCOUT_TIMEOUT_MS);
  if (child.stderr) child.stderr.on('data', d => console.error('[scout]', String(d).trim()));
  child.once('error', (err) => store.runAs(uid, () => {   // e.g. python not found
    clearTimeout(killer); scoutChild = null; scoutMeta = null;
    writeScoutStatus({ state: 'error', mode, error: 'python launch failed: ' + (err.message || err) });
    jobs.fail(job.id, 'python launch failed: ' + (err.message || err));
    console.error('[scout] launch error:', err.message || err);
  }));
  child.once('exit', (code) => store.runAs(uid, () => {
    clearTimeout(killer); scoutChild = null; scoutMeta = null;
    let summary = null;
    try {
      const s = JSON.parse(fs.readFileSync(P.scoutStatus, 'utf8'));
      if (s.state === 'running') { s.state = code === 0 ? 'done' : 'error'; if (code !== 0) s.error = 'exited ' + code; writeScoutStatus(s); }
      summary = { added: (s.find && s.find.added) || 0, matches: (s.find && s.find.newMatches) || 0, refreshed: (s.validate && s.validate.refreshed) || 0 };
    } catch (e) {}
    // close the job — unless it was already cancelled (kill triggers a non-zero exit)
    const jb = jobs.get(job.id);
    if (jb && jb.status === 'running') { code === 0 ? jobs.finish(job.id, summary) : jobs.fail(job.id, 'scout exited ' + code); }
    console.log('[scout] run finished (mode=' + mode + ', code=' + code + ')');
    // WP-0 push hook: notify registered devices when a successful run lands results
    if (code === 0) {
      try {
        const s = JSON.parse(fs.readFileSync(P.scoutStatus, 'utf8'));
        const added = (s.find && s.find.added) || 0, matches = (s.find && s.find.newMatches) || 0;
        const refreshed = (s.validate && s.validate.refreshed) || 0;
        if (added > 0 || matches > 0 || refreshed > 0) {
          sendPush({ title: 'Scout finished',
            body: `${added} new added` + (matches ? ` · ${matches} matches` : '') + (refreshed ? ` · ${refreshed} refreshed` : ''),
            eventKey: 'scout-' + (s.run || Date.now()) }).catch(() => {});
        }
      } catch (e) {}
      // Fire the digest on the FIRST successful scout run of the day, if opted in — so the digest
      // reflects the freshest data. Guarded by digest-state so it runs at most once per day.
      try {
        if (cfg('DIGEST_AFTER_SCOUT') === 'true' && digestEnabled()) {
          const today = new Date().toISOString().slice(0, 10);
          const st = readJsonSafe(P.digestState, {});
          if ((st.lastSent || '').slice(0, 10) !== today) {
            console.log('[digest] firing post-scout (first run of the day)');
            composeDigestAndDeliver();
          }
        }
      } catch (e) {}
    }
  }));
  return { ok: true, status: 200, started: true, mode, sources: sources || 'all', llmEnabled: !!aiKey() };
}
app.post('/api/scout/run', (req, res) => {
  const body = req.body || {};
  const mode = ['find', 'validate', 'both', 'source-backfill'].includes(body.mode) ? body.mode : 'both';
  let sources = body.sources;
  if (Array.isArray(sources)) sources = sources.filter(s => typeof s === 'string' && /^[a-z0-9_-]+$/i.test(s)).join(',');
  else if (typeof sources === 'string') sources = sources.split(',').map(s => s.trim()).filter(s => /^[a-z0-9_-]+$/i.test(s)).join(',');
  else sources = '';
  const r = triggerScout(mode, sources);
  res.status(r.status || 200).json(r);
});

// ---------- settings (sources on/off, keywords, OpenAI key/model) ----------
// Settings saved from the app are upserted here. Under REQON_DATA_DIR this is the disk-backed .env
// (loaded at boot above), so owner/server-level changes survive a redeploy; locally it's the repo
// .env, exactly as before.
const ENV_FILE = path.join(DATA_DIR, '.env');
// Source catalog (kept in sync with agent/sources/__init__.py CATALOG).
const SOURCE_CATALOG = [
  { name: 'greenhouse', label: 'Greenhouse', kind: 'public' },
  { name: 'ashby', label: 'Ashby', kind: 'public' },
  { name: 'lever', label: 'Lever', kind: 'public' },
  { name: 'workable', label: 'Workable', kind: 'public' },
  { name: 'smartrecruiters', label: 'SmartRecruiters', kind: 'public' },
  { name: 'recruitee', label: 'Recruitee / Tellent', kind: 'public' },
  { name: 'personio', label: 'Personio', kind: 'public' },
  { name: 'teamtailor', label: 'Teamtailor', kind: 'public' },
  { name: 'workday', label: 'Workday', kind: 'public', note: 'per-tenant slug' },
  { name: 'bamboohr', label: 'BambooHR', kind: 'public', note: 'experimental' },
  { name: 'theirstack', label: 'TheirStack', kind: 'aggregator', needsKey: 'THEIRSTACK_API_KEY' },
  { name: 'fantastic', label: 'Fantastic.jobs (Apify)', kind: 'aggregator', needsKey: 'APIFY_TOKEN' }
];
// Default employment-type skip list — kept in sync with EMPLOYMENT_SKIP_DEFAULT in scout.py.
const DEFAULT_SKIP_TYPES = ['contract', 'contractor', 'c2c', 'temporary', 'temp', 'intern',
  'internship', 'co-op', 'coop', 'part-time', 'part time', 'seasonal', 'fixed-term',
  'fixed term', 'apprentice', 'associate'];
// Default lifecycle-tab -> status mapping (Phase 2; editable in Settings).
const DEFAULT_TAB_MAP = {
  open: ['Not Applied'],
  applied: ['Applied'],
  interviewing: ['Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer'],
  closed: ['Rejected', 'Archived']
};
const VALID_STATUSES = new Set(['Not Applied', 'Applied', 'Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer', 'Rejected', 'Archived']);
// Hygiene-lane defaults (Phase 3; editable in Settings).
const DEFAULT_HYGIENE = {
  followupDays: 7,
  followupStatuses: ['Applied', 'Recruiter Screen', 'Hiring Manager', 'Panel'],
  needsVerifyIncludeBoardonly: false,
  closedHandling: 'suggest'   // 'suggest' (passive) | 'auto' (prompt to archive) — never silent-deletes
};
// Apply-mode: how a req gets applied to. fillable = Claude-in-Chrome can fill it;
// gated = login-walled ATS (open + Simplify/manual); simplify = use Simplify Copilot;
// manual = do it by hand. Default source->mode map (Phase 4; editable in Settings).
const APPLY_MODES = ['fillable', 'gated', 'manual', 'simplify'];
const DEFAULT_APPLY_MODE_MAP = {
  greenhouse: 'fillable', ashby: 'fillable', lever: 'fillable',
  workable: 'fillable', smartrecruiters: 'fillable', recruitee: 'fillable',
  personio: 'fillable', teamtailor: 'fillable',
  workday: 'gated', bamboohr: 'gated', icims: 'gated', taleo: 'gated',
  successfactors: 'gated', phenom: 'gated', jobvite: 'gated',
  linkedin: 'manual', other: 'manual', manual: 'manual', 'quick-add': 'manual', '': 'manual'
};
// Server-side source inference from a posting link (mirrors the board's inferSource).
function inferSourceFromLink(link) {
  const u = String(link || '').toLowerCase(); if (!u) return '';
  if (u.includes('greenhouse.io')) return 'greenhouse';
  if (u.includes('ashbyhq.com')) return 'ashby';
  if (u.includes('lever.co')) return 'lever';
  if (u.includes('workable.com')) return 'workable';
  if (u.includes('smartrecruiters.com')) return 'smartrecruiters';
  if (u.includes('recruitee.com')) return 'recruitee';
  if (u.includes('personio.')) return 'personio';
  if (u.includes('teamtailor.com')) return 'teamtailor';
  if (u.includes('myworkdayjobs.com') || u.includes('myworkdaysite.com')) return 'workday';
  if (u.includes('bamboohr.com')) return 'bamboohr';
  if (u.includes('icims.com')) return 'icims';
  if (u.includes('taleo.net')) return 'taleo';
  if (u.includes('successfactors')) return 'successfactors';
  if (u.includes('linkedin.com')) return 'linkedin';
  return 'other';
}
const rowSourceServer = r => (r.source && String(r.source).trim()) || inferSourceFromLink(r.link) || 'other';
function applyModeMapMerged(boards) {
  return Object.assign({}, DEFAULT_APPLY_MODE_MAP, (boards.applyModeMap && typeof boards.applyModeMap === 'object') ? boards.applyModeMap : {});
}
function hostOf(link) { try { return new URL(String(link || '')).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } }
function inferApplyMode(row, boards) {
  // Learned host→mode mappings (from the fillability probe) take precedence — they're specific to a
  // real page we actually inspected, and let novel/custom portals get classified once and reused.
  const learned = (boards.applyModeHosts && typeof boards.applyModeHosts === 'object') ? boards.applyModeHosts : {};
  const h = hostOf(row.link);
  if (h && learned[h] && APPLY_MODES.includes(learned[h].mode)) return learned[h].mode;
  const m = applyModeMapMerged(boards);
  const s = rowSourceServer(row);
  return m[s] || m.other || 'manual';
}
// Deterministic ATS fingerprint from page HTML — catches white-labeled boards on a custom domain
// (e.g. jobs.acme.com that's really Greenhouse). Returns {source, mode} or null.
function fingerprintHtml(html) {
  const h = String(html || '').toLowerCase();
  const hit = (src) => ({ source: src, mode: DEFAULT_APPLY_MODE_MAP[src] || 'manual' });
  if (/boards\.greenhouse\.io|grnhse|greenhouse\.io\/embed|data-mapped-source-name|gh_jid/.test(h)) return hit('greenhouse');
  if (/jobs\.ashbyhq\.com|ashby_embed|ashbyhq/.test(h)) return hit('ashby');
  if (/jobs\.lever\.co|lever-co|postings\.lever/.test(h)) return hit('lever');
  if (/apply\.workable\.com|workable\.com\/embed|workable/.test(h)) return hit('workable');
  if (/smartrecruiters\.com|smartrecruiters/.test(h)) return hit('smartrecruiters');
  if (/myworkdayjobs\.com|workday|wd\d+\.myworkday/.test(h)) return hit('workday');
  if (/icims\.com|icims/.test(h)) return hit('icims');
  if (/taleo\.net|taleo/.test(h)) return hit('taleo');
  if (/successfactors|sapsf/.test(h)) return hit('successfactors');
  if (/recruitee\.com|recruitee/.test(h)) return hit('recruitee');
  if (/teamtailor\.com|teamtailor/.test(h)) return hit('teamtailor');
  if (/jobvite\.com|jobvite/.test(h)) return hit('jobvite');
  // A bare HTML form with a file/résumé upload is usually self-host fillable; a "sign in to apply"
  // wall is gated. These are weak signals — only used when no ATS fingerprint matched.
  if (/type=["']?file["']?|upload your (resume|résumé|cv)|name=["']?resume/.test(h)) return { source: 'other', mode: 'fillable', weak: true };
  if (/sign in to apply|log in to apply|create an account to apply/.test(h)) return { source: 'other', mode: 'gated', weak: true };
  return null;
}
async function fetchPage(url, maxBytes = 400000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'reqon-applymode-probe/1.0' } });
    const buf = await r.arrayBuffer();
    return { ok: r.ok, status: r.status, finalUrl: r.url, html: Buffer.from(buf).toString('utf8').slice(0, maxBytes) };
  } finally { clearTimeout(t); }
}
function persistLearnedHost(host, source, mode, by) {
  if (!host) return;
  const boards = readJsonSafe(P.boards, {});
  boards.applyModeHosts = boards.applyModeHosts || {};
  boards.applyModeHosts[host] = { mode, source, by, at: new Date().toISOString() };
  writeJsonPretty(P.boards, boards);
}

// Probe a posting URL for its apply mode: deterministic first (URL + page fingerprint). If that's
// inconclusive, returns needsAI:true so the UI can ASK before spending a token. A confident verdict
// is persisted by host so it's reused next time (no re-probe). See user guide → apply modes.
app.post('/api/applymode/probe', async (req, res) => {
  const url = String((req.body || {}).url || '').trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ ok: false, error: 'A job URL is required.' });
  const host = hostOf(url);
  // 1) URL-based detection (known ATS domains)
  const src = inferSourceFromLink(url);
  if (src && src !== 'other') {
    const mode = DEFAULT_APPLY_MODE_MAP[src] || 'manual';
    persistLearnedHost(host, src, mode, 'url');
    return res.json({ ok: true, mode, source: src, method: 'url', confident: true });
  }
  // 2) Fetch the page and fingerprint its HTML (catches white-labeled boards on custom domains)
  let page;
  try { page = await fetchPage(url); } catch (e) { return res.json({ ok: true, confident: false, needsAI: true, reason: 'Could not fetch the page (' + e.message + ').' }); }
  const fp = fingerprintHtml(page.html);
  if (fp && !fp.weak) {
    persistLearnedHost(host, fp.source, fp.mode, 'fingerprint');
    return res.json({ ok: true, mode: fp.mode, source: fp.source, method: 'fingerprint', confident: true });
  }
  if (fp && fp.weak) {
    return res.json({ ok: true, mode: fp.mode, source: fp.source, method: 'fingerprint-weak', confident: false, needsAI: true, reason: 'Only a weak signal found — AI can confirm.' });
  }
  return res.json({ ok: true, confident: false, needsAI: true, reason: 'No known ATS fingerprint on the page.' });
});

// AI fallback for the probe — only called after the user opts in. Classifies fillable/gated/manual
// from the page text, then persists the learned host→mode mapping for reuse.
app.post('/api/applymode/probe-ai', async (req, res) => {
  if (!aiKey()) return res.status(400).json({ ok: false, error: 'No OpenAI key set — add one in Settings → Advanced.' });
  if (!assistEnabled()) return res.status(403).json({ ok: false, error: 'AI assistant is disabled.' });
  const url = String((req.body || {}).url || '').trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ ok: false, error: 'A job URL is required.' });
  const host = hostOf(url);
  let page;
  try { page = await fetchPage(url, 60000); } catch (e) { return res.status(502).json({ ok: false, error: 'Fetch failed: ' + e.message }); }
  const text = page.html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 6000);
  const tool = {
    type: 'function', name: 'classify_apply_mode',
    description: 'Classify how a candidate applies on this job page.',
    parameters: { type: 'object', additionalProperties: false, required: ['mode', 'confidence', 'reason'], properties: {
      mode: { type: 'string', enum: ['fillable', 'gated', 'manual'], description: 'fillable = an on-page application form (incl. résumé upload) with no login; gated = must sign in / create an account to apply; manual = apply elsewhere / email / no clear form' },
      confidence: { type: 'number', description: '0-1' },
      reason: { type: 'string', description: 'one short sentence' } } }
  };
  try {
    const { args, tokens } = await callTool({ system: 'You classify job application pages. Be strict: only "fillable" when an application form is present on the page without a login wall.', user: 'Page URL: ' + url + '\n\nVisible page text:\n' + text, tool, maxTokens: 200 });
    const u = assistUsage(); u.calls += 1; u.tokens += tokens || 0; writeJsonPretty(P.assistUsage, u);
    const mode = APPLY_MODES.includes(args.mode) ? args.mode : 'manual';
    persistLearnedHost(host, 'ai', mode, 'ai');
    logAssist({ ts: new Date().toISOString(), key: host, kind: 'applymode', model: assistModel(), tokens });
    res.json({ ok: true, mode, method: 'ai', confident: (args.confidence || 0) >= 0.6, confidence: args.confidence, reason: args.reason, tokens });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

function hygieneSettings(boards) {
  const h = (boards.hygiene && typeof boards.hygiene === 'object') ? boards.hygiene : {};
  return {
    followupDays: (h.followupDays != null && !isNaN(+h.followupDays)) ? +h.followupDays : DEFAULT_HYGIENE.followupDays,
    followupStatuses: Array.isArray(h.followupStatuses) ? h.followupStatuses.filter(s => VALID_STATUSES.has(s)) : DEFAULT_HYGIENE.followupStatuses,
    needsVerifyIncludeBoardonly: h.needsVerifyIncludeBoardonly === true,
    closedHandling: ['suggest', 'auto'].includes(h.closedHandling) ? h.closedHandling : DEFAULT_HYGIENE.closedHandling
  };
}
function readJsonSafe(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJsonPretty(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
// Upsert KEY=value lines in .env (preserves comments/other lines); also updates process.env live.
function setEnvVars(updates) {
  let lines = [];
  try { lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/); } catch (e) {}
  const keys = Object.keys(updates);
  const seen = {};
  lines = lines.map(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && keys.includes(m[1])) { seen[m[1]] = true; return `${m[1]}=${updates[m[1]]}`; }
    return line;
  });
  for (const k of keys) if (!seen[k]) lines.push(`${k}=${updates[k]}`);
  fs.mkdirSync(path.dirname(ENV_FILE), { recursive: true });   // disk mount may start empty
  const tmp = ENV_FILE + '.tmp';
  fs.writeFileSync(tmp, lines.join('\n'));
  fs.renameSync(tmp, ENV_FILE);
  for (const k of keys) process.env[k] = updates[k];   // take effect without restart
}
const last4 = s => (s && s.length >= 4) ? s.slice(-4) : '';

function settingsPayload() {
  const boards = readJsonSafe(P.boards, {});
  const watch = readJsonSafe(P.watchlist, {});
  const disabled = new Set(boards.disabledSources || []);
  const st = (watch.searchTerms || {});
  return {
    ok: true,
    sources: SOURCE_CATALOG.map(s => ({
      ...s,
      enabled: !disabled.has(s.name),
      configured: s.needsKey ? !!process.env[s.needsKey] : true
    })),
    keywords: st.keywords || [],
    titles: st.titles || [],
    minFit: st.minFitToAdd != null ? st.minFitToAdd : 6.0,
    salaryFloor: st.minSalary != null && !isNaN(+st.minSalary) ? +st.minSalary : 0,
    salaryTarget: st.salaryTarget != null && !isNaN(+st.salaryTarget) ? +st.salaryTarget : 0,
    remoteOnly: boards.remoteOnly !== false,
    minDelaySeconds: boards.minDelaySeconds != null ? boards.minDelaySeconds : 0.4,
    analyticsWindowDays: boards.analyticsWindowDays != null ? boards.analyticsWindowDays : 0,
    minTierToMerge: ['A', 'B', 'C'].includes(String(boards.minTierToMerge || '').toUpperCase()) ? String(boards.minTierToMerge).toUpperCase() : 'B',
    tierThresholds: tierThresholds(boards),
    skipEmploymentTypes: Array.isArray(boards.skipEmploymentTypes) ? boards.skipEmploymentTypes : DEFAULT_SKIP_TYPES,
    negativeKeywords: st.negativeKeywords || [],
    tabStatusMap: (boards.tabStatusMap && typeof boards.tabStatusMap === 'object') ? boards.tabStatusMap : DEFAULT_TAB_MAP,
    hygiene: hygieneSettings(boards),
    applyModes: APPLY_MODES,
    applyModeMap: applyModeMapMerged(boards),
    auth: {
      appTokenSet: !!APP_TOKEN,
      apnsSet: apnsConfigured(),
      pushDevices: pushDevices().length,
      ingestTokenSet: !!process.env.INGEST_TOKEN,
      ingestTokenLast4: last4(process.env.INGEST_TOKEN || '')
    },
    mail: { configured: !!(cfg('GMAIL_USER') && cfg('GMAIL_APP_PASSWORD')), user: cfg('GMAIL_USER') || '' },
    llm: {
      keySet: !!aiKey(),
      keyLast4: last4(aiKey() || ''),
      model: cfg('OPENAI_MODEL') || 'gpt-5.4-mini'
    },
    budget: {
      maxPerRun: +(cfg('AI_ENRICH_MAX_PER_RUN') || 40),
      ttlDays: +(cfg('AI_ENRICH_TTL_DAYS') || 14),
      jdChars: +(cfg('OPENAI_JD_CHARS') || 3500),
      maxTokens: +(cfg('OPENAI_MAX_TOKENS') || 400)
    },
    digest: (() => { const st = readJsonSafe(P.digestState, {}); return {
      enabled: digestEnabled(), time: digestTime(), channel: digestChannel(), days: digestDays(),
      channels: digestChannels(), afterScout: cfg('DIGEST_AFTER_SCOUT') === 'true',
      channelStatus: Object.fromEntries(ALL_CHANNELS.map(c => [c, channelReady(c)])),
      to: cfg('DIGEST_TO') || '', from: process.env.DIGEST_FROM || '',
      webhookSet: !!cfg('DIGEST_SLACK_WEBHOOK'), smtpSet: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
      smtpHost: process.env.SMTP_HOST || '', smtpPort: process.env.SMTP_PORT || '', smtpUser: process.env.SMTP_USER || '',
      sms: { configured: smsConfigured(), method: smsMethod(),
        from: cfg('TWILIO_FROM') || '', to: cfg('SMS_TO') || '', sidSet: !!cfg('TWILIO_ACCOUNT_SID'), tokenSet: !!cfg('TWILIO_AUTH_TOKEN'),
        carrier: cfg('SMS_CARRIER') || '', gatewayNumber: cfg('SMS_GATEWAY_NUMBER') || '', carriers: Object.keys(CARRIER_GATEWAYS) },
      lastSent: st.lastSent || null, lastChannel: st.lastChannel || null, lastCounts: st.lastCounts || null
    }; })(),
    mailNotify: {
      rejection: cfg('MAIL_NOTIFY_REJECTION') === 'true',
      interview: cfg('MAIL_NOTIFY_INTERVIEW') === 'true',
      offer: cfg('MAIL_NOTIFY_OFFER') === 'true',
      channels: parseChannels(cfg('MAIL_NOTIFY_CHANNELS'), ['inapp'])
    },
    assist: (() => { const u = assistUsage(); const w30 = assistWindowStats(30); const rate = assistRatePer1M(); const budget = assistMonthlyBudget(); const cost30 = estCost(w30.tokens, rate); return {
      enabled: assistEnabled(), model: assistModel(),
      dailyCalls: assistDailyCalls(), maxTokens: assistMaxTokens(),
      callsToday: u.calls, tokensToday: u.tokens,
      pricePer1M: rate, monthlyBudget: budget,
      tokens30d: w30.tokens, estCost30d: cost30,
      budgetUsedPct: (budget && cost30 != null) ? Math.min(100, Math.round((cost30 / budget) * 100)) : null
    }; })(),
    backup: {
      retention: backupRetention(),
      guardPct: putGuardPct()
    },
    remote: {
      publicUrl: (process.env.PUBLIC_URL || '').trim(),
      lanUrl: lanBase()
    },
    profile: (() => { const p = readProfile(); const a = p.applicant || {}; return {
      applicantName: a.name || '', hasResume: !!(p.resumeText || p.resumeFile || (p.keywords || []).length || (p.narratives || []).length)
    }; })()
  };
}

app.get('/api/settings', (req, res) => res.json(settingsPayload()));

// Does the server actually have HTTPS in front of it (Tailscale Funnel / Caddy)? We can't run those
// for the user, but we CAN report what we observe on the live request + whether PUBLIC_URL is set.
app.get('/api/https-status', (req, res) => {
  const https = secureReq(req);
  const proxied = tunneled(req);
  const publicUrl = (process.env.PUBLIC_URL || '').trim();
  let state, detail;
  if (https && publicUrl) { state = 'https'; detail = `Serving over HTTPS via a reverse proxy; pairing QR uses ${publicUrl}.`; }
  else if (https) { state = 'https'; detail = 'Request arrived over HTTPS (reverse proxy detected). Set a Remote access URL so the pairing QR uses it.'; }
  else if (publicUrl) { state = 'configured'; detail = `Remote access URL set (${publicUrl}) but this request came in over plain HTTP — start the tunnel (agent/run-tunnel.sh) so external/iOS access works.`; }
  else { state = 'lan'; detail = 'LAN / localhost over HTTP only. iOS blocks plaintext, so for remote/app access run Tailscale Funnel or Caddy and set the Remote access URL below.'; }
  res.json({ ok: true, state, https, proxied, publicUrl, detail, hint: 'See agent/run-tunnel.sh and MOBILE-SETUP.md.' });
});

// Read-only inventory of every environment variable the app uses, grouped, with secrets masked.
// "Expose all env vars appropriately": non-secret values are shown; secrets show set/last4 only.
const ENV_INVENTORY = [
  ['AI / OpenAI', [
    ['OPENAI_API_KEY', 1, 'Powers scout rescoring + the draft assistant'],
    ['OPENAI_MODEL', 0, 'Scoring/enrichment model (Settings → AI assistant)'],
    ['OPENAI_BASE_URL', 0, 'Custom API endpoint (Azure/proxy)'],
    ['OPENAI_USE_CHAT', 0, 'Force legacy /chat/completions'],
    ['ASSIST_WEB_SEARCH', 0, 'Enable web_search tool in drafts'],
    ['OPENAI_VECTOR_STORE_ID', 0, 'file_search store for résumé grounding'],
    ['OPENAI_PRICE_PER_1M', 0, 'USD per 1M tokens for cost estimate (Settings → AI assistant)'],
    ['ASSIST_MONTHLY_BUDGET', 0, 'USD monthly budget for the cost bar'],
  ]],
  ['Digest & mail', [
    ['DIGEST_ENABLED', 0, 'Run the in-server digest scheduler'],
    ['DIGEST_TIME', 0, 'HH:MM to send (server local time)'],
    ['DIGEST_CHANNEL', 0, 'file / slack / email'],
    ['DIGEST_SLACK_WEBHOOK', 1, 'Slack incoming webhook'],
    ['SMTP_HOST', 0, 'SMTP server'], ['SMTP_USER', 0, 'SMTP username'], ['SMTP_PASS', 1, 'SMTP app password'],
    ['GMAIL_USER', 0, 'Gmail address for response ingest'], ['GMAIL_APP_PASSWORD', 1, '16-char app password'],
  ]],
  ['Aggregators & push', [
    ['THEIRSTACK_API_KEY', 1, 'TheirStack aggregator key'],
    ['APIFY_TOKEN', 1, 'Apify / Fantastic.jobs token'],
    ['APNS_KEY_ID', 0, 'APNs Key ID'], ['APNS_TEAM_ID', 0, 'Apple Team ID'],
    ['APNS_BUNDLE_ID', 0, 'iOS bundle ID'], ['APNS_ENV', 0, 'sandbox / production'],
    ['SMS_METHOD', 0, 'SMS backend: twilio | email (free carrier gateway)'],
    ['SMS_CARRIER', 0, 'Carrier for email-to-SMS (verizon/att/tmobile/…)'],
    ['SMS_GATEWAY_NUMBER', 0, 'Your mobile number for email-to-SMS'],
    ['TWILIO_ACCOUNT_SID', 0, 'Twilio SID (SMS)'], ['TWILIO_AUTH_TOKEN', 1, 'Twilio auth token'],
    ['TWILIO_FROM', 0, 'Twilio from number'], ['SMS_TO', 0, 'SMS recipient'],
  ]],
  ['Access & server', [
    ['APP_TOKEN', 1, 'Passphrase for remote/app access'],
    ['INGEST_TOKEN', 1, 'Scoped token for /merge + /quickadd'],
    ['PUBLIC_URL', 0, 'HTTPS origin for pairing QR (Tailscale/Caddy)'],
    ['PORT', 0, 'Server port (restart to change)'],
    ['SCOUT_PYTHON', 0, 'Pinned Python binary for the scout'],
    ['BACKUP_RETENTION', 0, 'Auto-snapshots to keep'],
    ['PUT_GUARD_PCT', 0, 'Refuse a save dropping > this % of rows'],
  ]],
];
app.get('/api/env-inventory', (req, res) => {
  const groups = ENV_INVENTORY.map(([group, items]) => ({
    group,
    vars: items.map(([key, secret, purpose]) => {
      const raw = process.env[key];
      const set = raw != null && String(raw) !== '';
      return secret
        ? { key, secret: true, purpose, set, last4: set ? last4(String(raw)) : '' }
        : { key, secret: false, purpose, set, value: set ? String(raw) : '' };
    }),
  }));
  res.json({ ok: true, groups });
});

app.put('/api/settings', (req, res) => {
  const b = req.body || {};
  try {
    const boards = readJsonSafe(P.boards, {});
    const watch = readJsonSafe(P.watchlist, {});
    watch.searchTerms = watch.searchTerms || {};
    let touchedBoards = false, touchedWatch = false;

    if (Array.isArray(b.disabledSources)) {
      const valid = new Set(SOURCE_CATALOG.map(s => s.name));
      boards.disabledSources = b.disabledSources.filter(x => valid.has(x));
      touchedBoards = true;
    }
    if (typeof b.remoteOnly === 'boolean') { boards.remoteOnly = b.remoteOnly; touchedBoards = true; }
    if (typeof b.minTierToMerge === 'string' && ['A', 'B', 'C'].includes(b.minTierToMerge.toUpperCase())) { boards.minTierToMerge = b.minTierToMerge.toUpperCase(); touchedBoards = true; }
    if (b.tierThresholds && typeof b.tierThresholds === 'object') {
      const cur = tierThresholds(boards);
      const t = b.tierThresholds;
      const clampScore = (v, d) => (v != null && !isNaN(+v)) ? Math.max(0, Math.min(10, +v)) : d;
      boards.tierThresholds = {
        aEv: clampScore(t.aEv, cur.aEv),
        aFit: clampScore(t.aFit, cur.aFit),
        aProb: clampScore(t.aProb, cur.aProb),
        bEv: clampScore(t.bEv, cur.bEv),
      };
      touchedBoards = true;
    }
    if (Array.isArray(b.skipEmploymentTypes)) { boards.skipEmploymentTypes = b.skipEmploymentTypes.map(s => String(s).toLowerCase().trim()).filter(Boolean); touchedBoards = true; }
    if (Array.isArray(b.negativeKeywords)) { watch.searchTerms.negativeKeywords = b.negativeKeywords.map(String).map(s => s.trim()).filter(Boolean); touchedWatch = true; }
    if (b.tabStatusMap && typeof b.tabStatusMap === 'object') {
      const m = {};
      for (const k of ['open', 'applied', 'interviewing', 'closed']) {
        m[k] = Array.isArray(b.tabStatusMap[k]) ? b.tabStatusMap[k].map(String).filter(s => VALID_STATUSES.has(s)) : DEFAULT_TAB_MAP[k];
      }
      boards.tabStatusMap = m; touchedBoards = true;
    }
    if (b.hygiene && typeof b.hygiene === 'object') {
      const cur = hygieneSettings(boards);
      const hg = b.hygiene;
      const next = {
        followupDays: (hg.followupDays != null && !isNaN(+hg.followupDays)) ? Math.max(0, Math.min(365, Math.round(+hg.followupDays))) : cur.followupDays,
        followupStatuses: Array.isArray(hg.followupStatuses) ? hg.followupStatuses.map(String).filter(s => VALID_STATUSES.has(s)) : cur.followupStatuses,
        needsVerifyIncludeBoardonly: typeof hg.needsVerifyIncludeBoardonly === 'boolean' ? hg.needsVerifyIncludeBoardonly : cur.needsVerifyIncludeBoardonly,
        closedHandling: ['suggest', 'auto'].includes(hg.closedHandling) ? hg.closedHandling : cur.closedHandling
      };
      boards.hygiene = next; touchedBoards = true;
    }
    if (b.applyModeMap && typeof b.applyModeMap === 'object') {
      const m = {};
      for (const [k, v] of Object.entries(b.applyModeMap)) {
        if (typeof k === 'string' && APPLY_MODES.includes(v)) m[String(k).toLowerCase()] = v;
      }
      // store only overrides that differ from the built-in defaults to keep boards.json lean
      const diff = {};
      for (const [k, v] of Object.entries(m)) if (DEFAULT_APPLY_MODE_MAP[k] !== v) diff[k] = v;
      boards.applyModeMap = diff; touchedBoards = true;
    }
    if (Array.isArray(b.keywords)) { watch.searchTerms.keywords = b.keywords.map(String).filter(Boolean); touchedWatch = true; }
    if (Array.isArray(b.titles)) { watch.searchTerms.titles = b.titles.map(String).filter(Boolean); touchedWatch = true; }
    if (b.minFit != null && !isNaN(+b.minFit)) { watch.searchTerms.minFitToAdd = Math.max(0, Math.min(10, +b.minFit)); touchedWatch = true; }
    if (b.salaryFloor != null && !isNaN(+b.salaryFloor)) { watch.searchTerms.minSalary = Math.max(0, Math.min(2000000, Math.round(+b.salaryFloor))); touchedWatch = true; }
    if (b.salaryTarget != null && !isNaN(+b.salaryTarget)) { watch.searchTerms.salaryTarget = Math.max(0, Math.min(2000000, Math.round(+b.salaryTarget))); touchedWatch = true; }

    if (touchedWatch) writeJsonPretty(P.watchlist, watch);

    // OpenAI + optional aggregator keys -> .env (+ live process.env). Empty string clears.
    const envUpd = {};
    if (typeof b.openaiModel === 'string' && b.openaiModel.trim()) envUpd.OPENAI_MODEL = b.openaiModel.trim();
    // OpenAI key: in multi-user a non-owner user's key is THEIR secret (per-user namespace, 0600),
    // so AI cost is billed to them (decision #2). Single-user / owner -> shared .env as before.
    if (typeof b.openaiKey === 'string') {
      if (MULTIUSER() && store.currentUser() !== store.OWNER) {
        const sec = store.readJson(P.secrets, {}); const v = b.openaiKey.trim();
        if (v) sec.OPENAI_API_KEY = v; else delete sec.OPENAI_API_KEY;
        store.writeJsonAtomic(P.secrets, sec); try { fs.chmodSync(P.secrets, 0o600); } catch (e) {}
      } else { envUpd.OPENAI_API_KEY = b.openaiKey.trim(); }   // '' clears
    }
    if (b.envKeys && typeof b.envKeys === 'object') {
      for (const k of ['THEIRSTACK_API_KEY', 'APIFY_TOKEN', 'OPENAI_BASE_URL', 'OPENAI_USE_CHAT', 'ASSIST_WEB_SEARCH', 'OPENAI_VECTOR_STORE_ID']) {
        if (typeof b.envKeys[k] === 'string') envUpd[k] = b.envKeys[k].trim();
      }
    }
    // AI cost controls (numeric, clamped)
    if (b.aiMaxPerRun != null && !isNaN(+b.aiMaxPerRun)) envUpd.AI_ENRICH_MAX_PER_RUN = String(Math.max(0, Math.min(500, Math.round(+b.aiMaxPerRun))));
    if (b.aiTtlDays != null && !isNaN(+b.aiTtlDays)) envUpd.AI_ENRICH_TTL_DAYS = String(Math.max(0, Math.min(365, Math.round(+b.aiTtlDays))));
    // previously file-only AI knobs, now UI-editable
    if (b.openaiJdChars != null && !isNaN(+b.openaiJdChars)) envUpd.OPENAI_JD_CHARS = String(Math.max(500, Math.min(20000, Math.round(+b.openaiJdChars))));
    if (b.openaiMaxTokens != null && !isNaN(+b.openaiMaxTokens)) envUpd.OPENAI_MAX_TOKENS = String(Math.max(64, Math.min(4000, Math.round(+b.openaiMaxTokens))));
    // AI assistant (Phase 6)
    if (typeof b.assistEnabled === 'boolean') envUpd.ASSIST_ENABLED = b.assistEnabled ? 'true' : 'false';
    if (typeof b.assistModel === 'string' && b.assistModel.trim()) envUpd.ASSIST_MODEL = b.assistModel.trim();
    if (b.assistDailyCalls != null && !isNaN(+b.assistDailyCalls)) envUpd.ASSIST_DAILY_CALLS = String(Math.max(0, Math.min(1000, Math.round(+b.assistDailyCalls))));
    if (b.assistMaxTokens != null && !isNaN(+b.assistMaxTokens)) envUpd.ASSIST_MAX_TOKENS = String(Math.max(64, Math.min(4000, Math.round(+b.assistMaxTokens))));
    // Cost estimation knobs (were .env-only) — $/1M tokens + monthly budget. Empty string clears.
    if (typeof b.pricePer1M === 'string' || typeof b.pricePer1M === 'number') { const v = String(b.pricePer1M).trim(); envUpd.OPENAI_PRICE_PER_1M = (v === '' || isNaN(+v)) ? '' : String(Math.max(0, +v)); }
    if (typeof b.monthlyBudget === 'string' || typeof b.monthlyBudget === 'number') { const v = String(b.monthlyBudget).trim(); envUpd.ASSIST_MONTHLY_BUDGET = (v === '' || isNaN(+v)) ? '' : String(Math.max(0, +v)); }
    // scout politeness delay (boards.json; was file-only)
    if (b.minDelaySeconds != null && !isNaN(+b.minDelaySeconds)) { boards.minDelaySeconds = Math.max(0, Math.min(10, +b.minDelaySeconds)); touchedBoards = true; }
    if (b.analyticsWindowDays != null && !isNaN(+b.analyticsWindowDays)) { boards.analyticsWindowDays = Math.max(0, Math.min(3650, Math.round(+b.analyticsWindowDays))); touchedBoards = true; }
    // write boards.json AFTER all boards mutations above (incl. minDelay/analytics in this block)
    if (touchedBoards) writeJsonPretty(P.boards, boards);
    // morning digest (Phase 7)
    if (typeof b.digestEnabled === 'boolean') envUpd.DIGEST_ENABLED = b.digestEnabled ? 'true' : 'false';
    if (typeof b.digestTime === 'string' && /^\d{1,2}:\d{2}$/.test(b.digestTime)) envUpd.DIGEST_TIME = b.digestTime;
    if (['file', 'slack', 'email'].includes(b.digestChannel)) envUpd.DIGEST_CHANNEL = b.digestChannel;
    // multi-channel digest + post-scout trigger
    if (Array.isArray(b.digestChannels)) envUpd.DIGEST_CHANNELS = parseChannels(b.digestChannels.join(','), ['file']).join(',');
    if (typeof b.digestAfterScout === 'boolean') envUpd.DIGEST_AFTER_SCOUT = b.digestAfterScout ? 'true' : 'false';
    // SMS method + free email-to-SMS gateway config
    if (b.smsMethod === 'email' || b.smsMethod === 'twilio') envUpd.SMS_METHOD = b.smsMethod;
    if (typeof b.smsCarrier === 'string') envUpd.SMS_CARRIER = b.smsCarrier.trim().toLowerCase();
    if (typeof b.smsGatewayNumber === 'string') envUpd.SMS_GATEWAY_NUMBER = b.smsGatewayNumber.replace(/\D/g, '');
    // Twilio SMS (scaffolded; inert until all four are set)
    if (typeof b.twilioSid === 'string') envUpd.TWILIO_ACCOUNT_SID = b.twilioSid.trim();
    if (typeof b.twilioToken === 'string' && b.twilioToken) envUpd.TWILIO_AUTH_TOKEN = b.twilioToken;   // secret: only when provided
    if (typeof b.twilioFrom === 'string') envUpd.TWILIO_FROM = b.twilioFrom.trim();
    if (typeof b.smsTo === 'string') envUpd.SMS_TO = b.smsTo.trim();
    // Gmail per-event notifications
    if (typeof b.mailNotifyRejection === 'boolean') envUpd.MAIL_NOTIFY_REJECTION = b.mailNotifyRejection ? 'true' : 'false';
    if (typeof b.mailNotifyInterview === 'boolean') envUpd.MAIL_NOTIFY_INTERVIEW = b.mailNotifyInterview ? 'true' : 'false';
    if (typeof b.mailNotifyOffer === 'boolean') envUpd.MAIL_NOTIFY_OFFER = b.mailNotifyOffer ? 'true' : 'false';
    if (Array.isArray(b.mailNotifyChannels)) envUpd.MAIL_NOTIFY_CHANNELS = parseChannels(b.mailNotifyChannels.join(','), ['inapp']).join(',');
    if (b.digestDays != null && !isNaN(+b.digestDays)) envUpd.DIGEST_DAYS = String(Math.max(1, Math.min(60, Math.round(+b.digestDays))));
    if (typeof b.digestTo === 'string') envUpd.DIGEST_TO = b.digestTo.trim();
    if (typeof b.digestFrom === 'string') envUpd.DIGEST_FROM = b.digestFrom.trim();
    if (typeof b.digestSlackWebhook === 'string') envUpd.DIGEST_SLACK_WEBHOOK = b.digestSlackWebhook.trim();
    if (typeof b.smtpHost === 'string') envUpd.SMTP_HOST = b.smtpHost.trim();
    if (typeof b.smtpPort === 'string' || typeof b.smtpPort === 'number') envUpd.SMTP_PORT = String(b.smtpPort).trim();
    if (typeof b.smtpUser === 'string') envUpd.SMTP_USER = b.smtpUser.trim();
    if (typeof b.smtpPass === 'string' && b.smtpPass) envUpd.SMTP_PASS = b.smtpPass;   // only set when provided
    // Remote access: the HTTPS origin baked into the pairing QR (Tailscale Funnel / Caddy).
    // Blank clears it (falls back to forwarded-host, then LAN http).
    if (typeof b.publicUrl === 'string') envUpd.PUBLIC_URL = b.publicUrl.trim().replace(/\/+$/, '');
    // Data-safety knobs
    if (b.backupRetention != null && !isNaN(+b.backupRetention)) envUpd.BACKUP_RETENTION = String(Math.max(1, Math.min(1000, Math.round(+b.backupRetention))));
    if (b.putGuardPct != null && !isNaN(+b.putGuardPct)) envUpd.PUT_GUARD_PCT = String(Math.max(0, Math.min(100, Math.round(+b.putGuardPct))));
    // explicit secret clearing (blank-input fields default to "keep"; a Clear action sends this)
    if (Array.isArray(b.clearSecrets)) {
      const clearable = new Set(['OPENAI_API_KEY', 'DIGEST_SLACK_WEBHOOK', 'SMTP_PASS', 'THEIRSTACK_API_KEY', 'APIFY_TOKEN']);
      for (const k of b.clearSecrets) if (clearable.has(k)) envUpd[k] = '';
    }
    if (Object.keys(envUpd).length) {
      if (perUserScope()) {
        // Per-user keys -> this user's settings.json. Server-level keys (SMTP, PUBLIC_URL, tokens,
        // aggregator/APNs) only an admin may change, and they stay in shared .env.
        const perUser = {}, serverLvl = {};
        for (const [k, v] of Object.entries(envUpd)) (PER_USER_CFG.has(k) ? perUser : serverLvl)[k] = v;
        if (Object.keys(perUser).length) setUserCfg(perUser);
        const isAdmin = (sessionUser(req) || {}).role === 'admin';
        if (isAdmin && Object.keys(serverLvl).length) setEnvVars(serverLvl);
      } else {
        setEnvVars(envUpd);   // single-user / owner -> .env, unchanged
      }
    }

    res.json(settingsPayload());
  } catch (e) {
    console.error('[PUT /api/settings]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- source health + discovery (Phase 9) ----------
app.get('/api/source-health', (req, res) => {
  res.json({ ok: true, health: readJsonSafe(P.sourceHealth, { sources: {} }) });
});

// Detect ATS + slug from a pasted careers/job URL (only public, pollable ATSs).
function discoverAts(url) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch (e) { return { detected: false, error: 'Not a valid URL.' }; }
  const h = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);
  const sub = h.split('.')[0];
  const ok = (ats, slug) => ({ detected: !!slug, ats, slug: slug || '' });
  if (h.includes('greenhouse.io')) return ok('greenhouse', seg[0] === 'embed' ? seg[1] : seg[0]);
  if (h.includes('lever.co')) return ok('lever', seg[0]);
  if (h.includes('ashbyhq.com')) return ok('ashby', seg[0]);
  if (h.includes('workable.com')) return ok('workable', seg[0] || (sub !== 'apply' ? sub : ''));
  if (h.includes('smartrecruiters.com')) return ok('smartrecruiters', seg[0]);
  if (h.includes('recruitee.com')) return ok('recruitee', sub);
  if (h.includes('teamtailor.com')) return ok('teamtailor', sub);
  if (h.includes('personio')) return ok('personio', h);
  const gated = ['myworkdayjobs.com', 'myworkdaysite.com', 'icims.com', 'taleo.net', 'successfactors', 'phenom', 'jobvite'];
  if (gated.some(g => h.includes(g))) return { detected: false, note: 'Gated ATS — not pollable by the scout (open manually / use Simplify).' };
  return { detected: false, note: 'Unrecognized ATS. Only public boards (greenhouse/ashby/lever/workable/smartrecruiters/recruitee/personio/teamtailor) are pollable.' };
}
app.post('/api/sources/discover', (req, res) => res.json(Object.assign({ ok: true }, discoverAts((req.body || {}).url))));

app.post('/api/sources/add', (req, res) => {
  const b = req.body || {};
  const ats = String(b.ats || '').toLowerCase().trim();
  const slug = String(b.slug || '').trim();
  const name = (String(b.name || '').trim()) || slug;
  const valid = new Set(SOURCE_CATALOG.map(s => s.name));
  if (!valid.has(ats)) return res.status(400).json({ ok: false, error: 'Unknown/unsupported ATS: ' + ats });
  if (!slug) return res.status(400).json({ ok: false, error: 'Missing slug.' });
  const boards = readJsonSafe(P.boards, {});
  boards.companies = boards.companies || [];
  const dup = boards.companies.find(c => String(c.ats).toLowerCase() === ats && String(c.slug).toLowerCase() === slug.toLowerCase());
  if (dup) return res.json({ ok: true, added: 0, duplicate: true, name: dup.name, total: boards.companies.length });
  boards.companies.push({ name, ats, slug });
  writeJsonPretty(P.boards, boards);
  res.json({ ok: true, added: 1, name, ats, slug, total: boards.companies.length });
});

// Regenerate the scoped ingest token. Full-auth only (the /api gate already blocks the ingest
// token from reaching anything but merge/quickadd). Writes .env + live process.env, returns the
// new value ONCE so it can be copied into the ChatGPT Action.
app.post('/api/ingest-token/regenerate', (req, res) => {
  const token = crypto.randomBytes(24).toString('base64url');
  setEnvVars({ INGEST_TOKEN: token });
  res.json({ ok: true, token });
});

// Set/change the full-access app passphrase (APP_TOKEN) live — no restart needed. Auth checks,
// the login cookie, and the pairing QR all read the in-memory APP_TOKEN/TOKEN_HASH, which this
// updates. Guard: when a passphrase is already set AND the caller isn't trusted-local (loopback,
// no proxy), they must supply the correct current one. Re-issues the session cookie so the caller
// isn't logged out. NOTE: changing it invalidates already-paired devices until they re-pair.
app.post('/api/auth/passphrase', (req, res) => {
  const b = req.body || {};
  if (typeof b.passphrase !== 'string') return res.status(400).json({ ok: false, error: 'passphrase required' });
  if (APP_TOKEN && !trustedLocal(req) && !safeEq(sha(b.current || ''), TOKEN_HASH)) {
    return res.status(403).json({ ok: false, error: 'current passphrase required or incorrect' });
  }
  const next = b.passphrase.trim();
  if (next && next.length < 6) return res.status(400).json({ ok: false, error: 'use at least 6 characters' });
  APP_TOKEN = next;
  TOKEN_HASH = next ? sha(next) : '';
  try { setEnvVars({ APP_TOKEN: next }); }
  catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  if (TOKEN_HASH) {
    const flags = ['HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=2592000'];
    if (secureReq(req)) flags.push('Secure');
    res.setHeader('Set-Cookie', `${COOKIE}=${TOKEN_HASH}; ${flags.join('; ')}`);
  } else {
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
  }
  res.json({ ok: true, appTokenSet: !!APP_TOKEN });
});

// Timestamped, keep-forever snapshot of the current store ("Snapshot now").
app.post('/api/backup', (req, res) => {
  const job = jobs.create('backup', { label: 'Manual backup' });
  const file = snapshotData('manual');
  if (!file) { jobs.fail(job.id, 'snapshot failed (no data file?)'); return res.status(500).json({ ok: false, error: 'snapshot failed (no data file?)' }); }
  jobs.finish(job.id, { file });
  res.json({ ok: true, file });
});

// List snapshots, newest first.
app.get('/api/backups', (req, res) => {
  try {
    ensureBackupDir();
    const list = fs.readdirSync(P.backups).filter(f => f.endsWith('.json')).map(f => {
      const fp = path.join(P.backups, f);
      let st; try { st = fs.statSync(fp); } catch (e) { return null; }
      let rows = null;
      try { const j = JSON.parse(fs.readFileSync(fp, 'utf8')); if (Array.isArray(j)) rows = j.length; } catch (e) {}
      return { name: f, kind: backupKind(f), size: st.size, mtime: st.mtimeMs, rows };
    }).filter(Boolean).sort((a, b) => b.mtime - a.mtime);
    res.json({ ok: true, count: list.length, retention: backupRetention(), backups: list });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Restore a snapshot in the CURRENT tenant — snapshots first, validates, then replaces. Returns a
// result object so both /api/restore and the admin restore-a-user op can use it.
function restoreData(file) {
  const fp = resolveBackup(file);
  if (!fp) return { ok: false, status: 400, error: 'Unknown or invalid backup file.' };
  let restored;
  try { restored = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { return { ok: false, status: 400, error: 'Backup is not valid JSON.' }; }
  if (!Array.isArray(restored)) return { ok: false, status: 400, error: 'Backup is not a requisition array.' };
  try {
    const before = readStore().length;
    const pre = snapshotData('auto');           // safety snapshot of the about-to-be-replaced state
    writeStore(restored);
    pruneAutoBackups();
    const guidesRestored = restoreGuides(path.basename(fp));   // bring back attached guides, if bundled
    logChange({ ts: new Date().toISOString(), action: 'restore', file: path.basename(fp), before, after: restored.length, guidesRestored, preSnapshot: pre });
    return { ok: true, status: 200, restored: restored.length, from: path.basename(fp), guidesRestored, preSnapshot: pre };
  } catch (e) { return { ok: false, status: 500, error: e.message }; }
}
app.post('/api/restore', (req, res) => { const r = restoreData((req.body || {}).file); res.status(r.status || 200).json(r); });

// Download a snapshot file (attachment).
app.get('/api/backups/:file', (req, res) => {
  const fp = resolveBackup(req.params.file);
  if (!fp) return res.status(404).json({ ok: false, error: 'Not found.' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(fp)}"`);
  fs.createReadStream(fp).pipe(res);
});

// ---------- Excel export (mirrors the seed workbook formatting) ----------
const HEADERS = [
  'Company', 'Role', 'Sector', 'Tier', 'Fit', 'Interview', 'Exp. Value', 'Status', 'Salary',
  'Location', 'Remote', 'Link Conf.', 'Applied', 'Interview Date', 'Recruiter', 'Referral',
  'Resume Ver.', 'Cover Ltr', 'Follow-up', 'Last Contact', 'Next Action', 'Link', 'Why it fits / Notes'
];
const COL_WIDTHS = [17, 34, 17, 6, 8, 9, 9, 15, 18, 24, 11, 12, 12, 13, 15, 9, 11, 9, 12, 12, 26, 9, 60];
const REMOTE_DISPLAY = { remote: 'Remote', flex: 'Flex/Hybrid', onsite: 'On-site' };
const CONF_DISPLAY = { verified: 'Verified', boardonly: 'Board-only', unverified: 'Unverified' };

function fitFill(v) { // red -> amber -> green bands
  if (v >= 8.5) return 'FF1E5E4E'; if (v >= 7) return 'FF3A5A2A'; if (v >= 5) return 'FF6B5A1E'; return 'FF6B2E22';
}
function probFill(v) {
  if (v >= 7) return 'FF1E5E4E'; if (v >= 6) return 'FF3A5A2A'; if (v >= 4.5) return 'FF6B5A1E'; return 'FF6B2E22';
}
function tierFill(t) {
  if (t === 'A') return 'FFEDC05A'; if (t === 'B') return 'FF86A6DD'; return 'FF2A3540';
}
function solid(rgb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: rgb } }; }

async function buildWorkbook(rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Job Pipeline CRM';
  wb.created = new Date();

  // ---- Pipeline sheet ----
  const ws = wb.addWorksheet('Pipeline', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  ws.columns = COL_WIDTHS.map(w => ({ width: w }));
  const header = ws.addRow(HEADERS);
  header.eachCell(c => {
    c.fill = solid('FF1F2A37');
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { vertical: 'middle' };
  });
  header.height = 18;

  rows.forEach((x, idx) => {
    const r = idx + 2;
    const row = ws.addRow([
      x.company || '', x.role || '', x.sector || '', x.tier || '',
      +x.fit || 0, +x.prob || 0, { formula: `ROUND(E${r}*F${r}/10,1)` },
      x.status || 'Not Applied', x.salary || '', x.location || '',
      REMOTE_DISPLAY[x.remote] || x.remote || '', CONF_DISPLAY[x.conf] || x.conf || '',
      x.applied || '', x.interview || '', x.recruiter || '', x.referral || 'No',
      x.resume || '—', x.cover || 'No', x.followup || '', x.lastcontact || '',
      x.next || '',
      x.link ? { text: 'Open ↗', hyperlink: x.link } : '',
      x.notes || ''
    ]);
    // color bands
    row.getCell(5).fill = solid(fitFill(+x.fit || 0));
    row.getCell(6).fill = solid(probFill(+x.prob || 0));
    row.getCell(7).fill = solid('FF6B5A1E');
    const tc = row.getCell(4);
    tc.fill = solid(tierFill(x.tier));
    tc.font = { bold: true, color: { argb: x.tier === 'C' ? 'FFE9EEF4' : 'FF15110A' } };
    [5, 6, 7].forEach(c => { row.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } }; row.getCell(c).alignment = { horizontal: 'center' }; });
    row.getCell(4).alignment = { horizontal: 'center' };
    if (x.link) row.getCell(22).font = { color: { argb: 'FF2563EB' }, underline: true };
    row.getCell(23).alignment = { wrapText: false };
  });

  // dropdowns (data validation) for the editable columns, rows 2..N+1
  const last = rows.length + 1;
  const dv = (colLetter, list) => {
    for (let r = 2; r <= last; r++) {
      ws.getCell(`${colLetter}${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [`"${list}"`]
      };
    }
  };
  dv('D', 'A,B,C');
  dv('H', 'Not Applied,Applied,Recruiter Screen,Hiring Manager,Panel,Offer,Rejected,Archived');
  dv('K', 'Remote,Flex/Hybrid,On-site');
  dv('L', 'Verified,Board-only,Unverified');
  dv('P', 'Yes,No');
  dv('Q', '—,PM,Director,Principal,Platform,AI');
  dv('R', 'Yes,No');

  ws.autoFilter = { from: 'A1', to: `W${last}` };

  // ---- Guide & Dashboard sheet ----
  const g = wb.addWorksheet('Guide & Dashboard');
  g.columns = [{ width: 26 }, { width: 90 }];
  const title = g.addRow(['Job Pipeline CRM — Guide']);
  title.getCell(1).font = { bold: true, size: 14 };
  const guide = [
    ['How to use', 'Edit any field in the web board — it auto-saves to the Mac mini. This Excel file is an export/report, not the live DB.'],
    ['Sorting', 'Default order is Tier then Expected Value. In Excel use Data > Sort, or the filter arrows.'],
    ['Exp. Value', 'Auto-calculated: Fit x Interview / 10. Your best apply-effort allocator. (Formula — leave it.)'],
    ['Fit', 'Domain/resume match (0-10).'],
    ['Interview', 'Estimated odds of landing a screen (0-10) — separate from Fit on purpose.'],
    ['Tier', 'A = apply now, B = strong, C = monitor. Dropdown.'],
    ['Link Conf.', 'Verified = confirmed live; Board-only = careers board, filter for the title; Unverified = from a source, confirm.'],
    ['Status', 'Pipeline stage: Not Applied -> Applied -> Recruiter Screen -> Hiring Manager -> Panel -> Offer / Rejected.'],
    ['Editable dropdowns', 'Tier, Status, Remote, Link Conf., Referral, Resume Ver., Cover Ltr.'],
    ['Note', "Scores & salaries are estimates ('est.' = market estimate, not from the listing). Verify on each board."]
  ];
  guide.forEach(([k, v]) => {
    const row = g.addRow([k, v]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true };
  });
  g.addRow([]);
  const dash = g.addRow(['DASHBOARD']);
  dash.getCell(1).font = { bold: true, size: 12 };
  const N = rows.length + 1;
  const stats = [
    ['Total requisitions', `COUNTA(Pipeline!A2:A${N})`],
    ['Tier A', `COUNTIF(Pipeline!D2:D${N},"A")`],
    ['Tier B', `COUNTIF(Pipeline!D2:D${N},"B")`],
    ['Tier C', `COUNTIF(Pipeline!D2:D${N},"C")`],
    ["Applied (not 'Not Applied')", `COUNTIFS(Pipeline!H2:H${N},"<>Not Applied",Pipeline!H2:H${N},"<>Archived")`],
    ['In interviews', `COUNTIF(Pipeline!H2:H${N},"Recruiter Screen")+COUNTIF(Pipeline!H2:H${N},"Hiring Manager")+COUNTIF(Pipeline!H2:H${N},"Panel")+COUNTIF(Pipeline!H2:H${N},"Offer")`],
    ['Remote-friendly', `COUNTIF(Pipeline!K2:K${N},"Remote")+COUNTIF(Pipeline!K2:K${N},"Flex/Hybrid")`],
    ['Avg Fit', `ROUND(AVERAGE(Pipeline!E2:E${N}),1)`],
    ['Avg Interview prob', `ROUND(AVERAGE(Pipeline!F2:F${N}),1)`]
  ];
  stats.forEach(([k, f]) => {
    const row = g.addRow([k, { formula: f }]);
    row.getCell(1).font = { bold: true };
  });

  return wb;
}

app.get('/api/export.xlsx', async (req, res) => {
  try {
    const wb = await buildWorkbook(liveRows(readStore()));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="job-search-CRM.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('[export.xlsx]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- boot ----------
// Marketing role is stateless — skip data/config seeding entirely.
if (!SERVE_MARKETING) {
  ensureConfig();
  ensureStore();
}
// Pure logic exported for the shared test-vector suite (tests/run-vectors.js) and future
// clients. Requiring this module does NOT start the server, schedulers, or the migration.
module.exports = { postingId, sameReq, reqKey, computeTier, reconcileSync, ensureRowIdentity, extractJobMeta, companyFromUrl, liveRows };

if (require.main !== module) return;   // imported for tests — stop before side effects

// ROADMAP-V3 PR0: in multi-user mode, ensure an initial admin exists (first-run bootstrap), and
// migrate the existing single-user board into that admin's namespace (Q1: "your current board
// becomes your user"). Migration is once-only + reversible (legacy root files are left intact).
// Backend-only boot work (data bootstrap, migrations, schedulers). The cloud role is a thin UI +
// proxy and owns no data, so it skips all of this — it just serves the UI and listens.
if (SERVE_API) {
  // ROADMAP-V3 PR0: in multi-user mode, ensure an initial admin exists (first-run bootstrap), and
  // migrate the existing single-user board into that admin's namespace (Q1: "your current board
  // becomes your user"). Migration is once-only + reversible (legacy root files are left intact).
  if (MULTIUSER()) {
    try {
      const admin = users.ensureBootstrapAdmin();
      if (admin) { const m = store.migrateLegacyToUser(admin.id); if (m.migrated) console.log(`[migrate] adopted legacy board into "${admin.id}" (${m.files} file(s))`); }
    } catch (e) { console.error('[users] bootstrap/migrate failed:', e.message); }
  }

  // WP-0 one-time identity migration: backfill id/updatedAt on legacy rows (snapshot first).
  try {
    const rows = readStore();
    const n = ensureRowIdentity(rows);
    if (n > 0) { snapshotData('phase'); writeStore(rows); console.log(`[migrate] backfilled id/updatedAt (${n} field(s) across ${rows.length} rows)`); }
  } catch (e) { console.error('[migrate] identity backfill failed:', e.message); }

  setInterval(digestScheduler, 60 * 1000);   // morning-digest scheduler (Phase 7)
}
app.listen(PORT, HOST, () => {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets).flat().find(n => n && n.family === 'IPv4' && !n.internal);
  if (SERVE_MARKETING) {
    console.log(`\n  Reqon marketing placeholder running:`);
    console.log(`    Local:   http://localhost:${PORT}`);
    if (lan) console.log(`    LAN:     http://${lan.address}:${PORT}`);
    console.log(`    Role:    marketing (no data, no auth, no API)`);
    console.log('');
    return;
  }
  console.log(`\n  Job Pipeline CRM running:`);
  console.log(`    Local:   http://localhost:${PORT}`);
  if (lan) console.log(`    LAN:     http://${lan.address}:${PORT}`);
  console.log(`    Mobile:  http://localhost:${PORT}/m`);
  console.log(`    Data:    ${P.data}`);
  if (APP_TOKEN) {
    console.log(`    Auth:    ON — passphrase required for /m, the board, and the API from any non-localhost client.`);
  } else {
    console.log(`    Auth:    OFF — set APP_TOKEN=<passphrase> before exposing this server to the internet.`);
  }
  console.log('');
});
