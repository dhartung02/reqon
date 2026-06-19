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

// --- minimal .env loader (no dependency) ---------------------------------------
// Loads <project>/.env into process.env on boot so secrets (e.g. OPENAI_API_KEY)
// live in a gitignored file rather than the code or the launchd plist. Existing
// environment values always win (so plist/exported vars override the file).
(function loadDotenv() {
  try {
    const envPath = path.join(__dirname, '.env');
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
      if (!(k in process.env)) { process.env[k] = v; n++; }
    }
    if (n) console.log(`[env] loaded ${n} var(s) from .env`);
  } catch (e) { console.error('[env] .env load failed:', e.message); }
})();

const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 = reachable on the LAN
const ROOT = __dirname;
// DATA_FILE / BACKUP_DIR are overridable via env (no effect in normal use) so the data
// layer can be exercised in isolation by tests and stays portable for open-source.
const DATA_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(ROOT, 'data.json');
// Personal seed.json (gitignored) if present, else the shipped generic sample. Lets a fresh
// open-source clone boot with sample data and zero personal data committed.
const SEED_FILE = fs.existsSync(path.join(ROOT, 'seed.json')) ? path.join(ROOT, 'seed.json') : path.join(ROOT, 'seed.example.json');
const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(ROOT, 'backups');

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
  if (!fs.existsSync(DATA_FILE)) {
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    writeStore(seed);
    console.log(`[seed] No data.json found — seeded ${seed.length} requisitions from seed.json`);
  }
}
// Personal config (boards.json / watchlist.json) is gitignored; on a fresh clone, seed each from
// its shipped *.example.json so the app + scout boot with sample config and zero personal data.
function ensureConfig() {
  for (const base of ['boards', 'watchlist']) {
    const real = path.join(ROOT, 'agent', base + '.json');
    const example = path.join(ROOT, 'agent', base + '.example.json');
    try { if (!fs.existsSync(real) && fs.existsSync(example)) { fs.copyFileSync(example, real); console.log(`[config] seeded ${base}.json from ${base}.example.json`); } } catch (e) {}
  }
}
function readStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('[store] read failed:', e.message);
    return [];
  }
}
function writeStore(rows) {
  // atomic write: write tmp then rename, so a crash mid-write never corrupts data.json
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2));
  fs.renameSync(tmp, DATA_FILE);
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
const ENRICH_LOG = path.join(ROOT, 'agent', 'enrichment-log.jsonl');
function logEnrichment(entry) {
  try {
    fs.mkdirSync(path.dirname(ENRICH_LOG), { recursive: true });
    fs.appendFileSync(ENRICH_LOG, JSON.stringify(entry) + '\n');
  } catch (e) { console.error('[enrich-log]', e.message); }
}

// ---------- data-safety: snapshots, retention, change-log ----------
// Append-only board change-log — one JSON object per accepted PUT/restore. Keys + changed
// field names only (bounded; no full-row dumps), so any edit is reconstructable from the
// snapshots + this ledger.
const CHANGE_LOG = path.join(ROOT, 'agent', 'change-log.jsonl');
function logChange(entry) {
  try {
    fs.mkdirSync(path.dirname(CHANGE_LOG), { recursive: true });
    fs.appendFileSync(CHANGE_LOG, JSON.stringify(entry) + '\n');
  } catch (e) { console.error('[change-log]', e.message); }
}
function ensureBackupDir() { if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true }); }
const backupStamp = () => new Date().toISOString().replace(/[:.]/g, '-');
// Copy the CURRENT store to backups/data.<kind>-<stamp>.json. kind 'auto' is the pre-overwrite
// safety snapshot (subject to retention); 'manual' is a user-triggered keep-forever snapshot.
function snapshotData(kind) {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    ensureBackupDir();
    const name = `data.${kind}-${backupStamp()}.json`;
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, name));
    return name;
  } catch (e) { console.error('[snapshot]', e.message); return null; }
}
// Prune only auto snapshots down to the retention count (newest kept). Manual/phase/labeled
// backups are never touched.
function pruneAutoBackups() {
  try {
    ensureBackupDir();
    const keep = backupRetention();
    const autos = fs.readdirSync(BACKUP_DIR)
      .filter(f => /^data\.auto-.*\.json$/.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const x of autos.slice(keep)) { try { fs.unlinkSync(path.join(BACKUP_DIR, x.f)); } catch (e) {} }
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
// Resolve a user-supplied backup filename safely inside BACKUP_DIR (no path traversal).
function resolveBackup(name) {
  if (typeof name !== 'string' || !name) return null;
  if (path.basename(name) !== name) return null;            // had a separator -> reject
  if (!/^[\w.\-]+\.json$/.test(name)) return null;
  const fp = path.join(BACKUP_DIR, name);
  if (path.dirname(path.resolve(fp)) !== path.resolve(BACKUP_DIR)) return null;
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
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false }));

// ---------- auth (opt-in via APP_TOKEN; protects remote/tunnel exposure) ----------
// If APP_TOKEN is unset the server behaves exactly as before (open) — fine for a
// localhost-only box. Set APP_TOKEN before exposing it through a tunnel/port-forward.
const APP_TOKEN = process.env.APP_TOKEN || '';
const COOKIE = 'crm_auth';
const TOKEN_HASH = APP_TOKEN ? crypto.createHash('sha256').update(APP_TOKEN).digest('hex') : '';
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
function authed(req) {
  if (!APP_TOKEN) return true;          // auth disabled -> original behavior
  if (trustedLocal(req)) return true;   // desktop board on the Mac itself
  const c = parseCookies(req)[COOKIE];
  if (c && safeEq(c, TOKEN_HASH)) return true;
  const h = req.headers['x-crm-token'] || req.query.token;
  if (h && safeEq(sha(h), TOKEN_HASH)) return true;
  return false;
}
const secureReq = req => (req.headers['x-forwarded-proto'] || '').includes('https');

function loginPage(nextUrl, msg) {
  const nxt = String(nextUrl || '/m').replace(/"/g, '');
  return `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><meta name=theme-color content="#0e1217">
<title>Sign in</title><style>
body{background:#0e1217;color:#e9eef4;font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#161d26;border:1px solid #28333f;border-radius:16px;padding:26px;width:min(360px,90vw)}
h1{font-size:1.2rem;margin:0 0 4px}p{color:#7c8794;font-size:.84rem;margin:0 0 16px}
input{width:100%;box-sizing:border-box;background:#0e1217;border:1px solid #33414f;color:#e9eef4;border-radius:10px;padding:12px;font-size:16px;outline:none}
input:focus{border-color:#edc05a}button{width:100%;margin-top:12px;background:#edc05a;color:#15110a;border:0;border-radius:10px;padding:12px;font-weight:700;font-size:.95rem}
.err{color:#ef8268;font-size:.8rem;margin-top:10px}</style>
<form method="POST" action="/login">
<h1>Job Pipeline CRM</h1><p>Enter the access passphrase.</p>
<input type="password" name="passphrase" placeholder="Passphrase" autofocus autocomplete="current-password">
<input type="hidden" name="next" value="${nxt}">
<button type="submit">Sign in</button>
${msg ? `<div class="err">${msg}</div>` : ''}
</form>`;
}

app.get('/login', (req, res) => {
  if (!APP_TOKEN) return res.status(503).send('Remote access disabled. Set APP_TOKEN env var and restart.');
  res.type('html').send(loginPage(req.query.next, ''));
});
app.post('/login', (req, res) => {
  if (!APP_TOKEN) return res.status(503).send('Remote access disabled. Set APP_TOKEN env var and restart.');
  const ok = safeEq(sha(req.body.passphrase || ''), TOKEN_HASH);
  const next = (req.body.next || '/m').startsWith('/') ? req.body.next : '/m';
  if (!ok) return res.status(401).type('html').send(loginPage(next, 'Incorrect passphrase.'));
  const flags = ['HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=2592000'];
  if (secureReq(req)) flags.push('Secure');
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
  if (!APP_TOKEN) return res.status(503).send('Mobile/remote access is disabled. Set APP_TOKEN and restart to enable authenticated access.');
  return res.redirect('/login?next=' + encodeURIComponent(req.path));
}
app.get(['/m', '/mobile'], gateHtml, (req, res) => res.sendFile(path.join(ROOT, 'mobile.html')));

// Desktop board: open on localhost, gated when reached remotely.
app.get(['/', '/index.html'], (req, res, next) => {
  if (authed(req) || !APP_TOKEN) return next();
  return res.redirect('/login?next=/');
}, (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

// CORS for cross-origin capture tools (bookmarklet on linkedin.com etc.). Auth is via the
// X-CRM-Token header (not cookies), so echoing the origin without credentials is safe — a caller
// still needs the passphrase. Preflight (OPTIONS) must pass before the auth check below.
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS');
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

app.use(express.static(path.join(ROOT, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, count: readStore().length, port: PORT, dataFile: DATA_FILE });
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
app.get('/api/pair', (req, res) => {
  const url = lanBase();
  const code = core.encodePairing(url, APP_TOKEN);
  QRCode.toString(code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
    .then(qrSvg => res.json({ ok: true, url, hasToken: !!APP_TOKEN, code, qrSvg }))
    .catch(e => res.status(500).json({ ok: false, error: e.message }));
});

app.get('/api/reqs', (req, res) => {
  res.json(readStore());
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
  const boards = readJsonSafe(BOARDS_FILE, {});
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
    .replace(/\s*\|\s*LinkedIn.*$/i, '')                                  // strip "| LinkedIn …"
    .replace(/\s*\|\s*(Indeed|Glassdoor|Greenhouse|Lever|Workday|Ashby|SmartRecruiters|iCIMS|ZipRecruiter).*$/i, '')
    .trim();
  let company = '', role = '', location = '', m;
  if ((m = t.match(/^(.+?)\s+hiring\s+(.+)$/i))) {                        // "Company hiring <rest>"
    company = m[1].trim();
    const rest = m[2].trim();
    const im = rest.match(/^(.*\S)\s+in\s+(.+)$/i);                       // greedy -> split on the LAST " in "
    if (im) { role = im[1].trim(); location = im[2].trim(); }
    else { role = rest; }
  } else if (wasLinkedIn && /\s[–—-]\s/.test(t)) {                        // LinkedIn "Role - Company" page title
    const idx = Math.max(t.lastIndexOf(' - '), t.lastIndexOf(' – '), t.lastIndexOf(' — '));
    role = t.slice(0, idx).trim();
    company = t.slice(idx + 3).trim();
  } else {
    role = t;                                                            // low confidence: keep cleaned title as role
  }
  return { company, role, location };
}

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
  if (!company) company = hostName(link) || 'Unknown';
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
  row.applyMode = inferApplyMode(row, readJsonSafe(BOARDS_FILE, {}));   // Phase 4
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
  const boards = readJsonSafe(BOARDS_FILE, {});
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
const PROFILE_FILE = path.join(ROOT, 'agent', 'profile.json');
const PROFILE_PYTHON = path.join(ROOT, 'agent', 'profile-from-resume.py');
function readProfile() {
  // personal profile.json (gitignored) if present, else the shipped generic example
  let p = readJsonSafe(PROFILE_FILE, null);
  if (p == null) p = readJsonSafe(path.join(ROOT, 'agent', 'profile.example.json'), {});
  return Object.assign(
    { applicant: {}, seniority: [], roleTerms: [], industries: [], sectors: [], keywords: [], narratives: [], remoteOnly: true },
    p
  );
}
function snapshotProfile() {
  try { if (fs.existsSync(PROFILE_FILE)) { ensureBackupDir(); const n = `profile.${backupStamp()}.json`; fs.copyFileSync(PROFILE_FILE, path.join(BACKUP_DIR, n)); return n; } } catch (e) {}
  return null;
}
const PROFILE_ARRAY_FIELDS = ['seniority', 'roleTerms', 'industries', 'sectors', 'priorityKeywords', 'secondaryKeywords'];

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
  if (Array.isArray(b.narratives)) {
    next.narratives = b.narratives.filter(n => n && (n.title || n.body)).map(n => ({
      id: n.id || ('n' + crypto.randomBytes(4).toString('hex')),
      title: String(n.title || ''), body: String(n.body || ''),
      tags: Array.isArray(n.tags) ? n.tags.map(String).map(s => s.trim()).filter(Boolean) : []
    }));
  }
  if (typeof b.remoteOnly === 'boolean') next.remoteOnly = b.remoteOnly;
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
  try { snapshotProfile(); writeJsonPretty(PROFILE_FILE, next); res.json({ ok: true, profile: next }); }
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
  const tmpPath = path.join(BACKUP_DIR, 'resume-upload-' + backupStamp() + path.extname(fn).toLowerCase());
  try { fs.writeFileSync(tmpPath, buf); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  const preserved = readProfile();
  snapshotProfile();
  let child, done = false;
  const finish = (status, payload) => { if (done) return; done = true; try { fs.unlinkSync(tmpPath); } catch (e) {} res.status(status).json(payload); };
  try { child = spawn(resolvePython(), [PROFILE_PYTHON, tmpPath], { cwd: ROOT, env: process.env }); }
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
    try { writeJsonPretty(PROFILE_FILE, regen); } catch (e) { return finish(500, { ok: false, error: e.message }); }
    finish(200, { ok: true, profile: regen });
  });
});

// ---------- AI application assistant (Phase 6) ----------
// Per-req cover-note / screening-answer drafts, grounded in the candidate profile + narrative
// library + JD. Budget-gated (daily call cap + per-call token cap), logged, editable, NEVER
// auto-submitted. Optional: needs OPENAI_API_KEY and ASSIST_ENABLED != 'false'.
const ASSIST_USAGE = path.join(ROOT, 'agent', 'assist-usage.json');
const ASSIST_LOG = path.join(ROOT, 'agent', 'assist-log.jsonl');
const assistEnabled = () => process.env.ASSIST_ENABLED !== 'false';
const assistModel = () => process.env.ASSIST_MODEL || process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const assistDailyCalls = () => Math.max(0, parseInt(process.env.ASSIST_DAILY_CALLS || '25', 10) || 0);
const assistMaxTokens = () => Math.max(64, Math.min(4000, parseInt(process.env.ASSIST_MAX_TOKENS || '700', 10) || 700));
function assistUsage() {
  const today = new Date().toISOString().slice(0, 10);
  let u = readJsonSafe(ASSIST_USAGE, {});
  if (u.date !== today) u = { date: today, calls: 0, tokens: 0 };
  return u;
}
function logAssist(entry) {
  try { fs.mkdirSync(path.dirname(ASSIST_LOG), { recursive: true }); fs.appendFileSync(ASSIST_LOG, JSON.stringify(entry) + '\n'); } catch (e) {}
}
async function openaiChat({ model, system, user, maxTokens }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('no OPENAI_API_KEY');
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const payload = {
    model, temperature: 0.4, max_completion_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
  };
  const r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify(payload)
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('OpenAI HTTP ' + r.status + ' ' + t.slice(0, 200)); }
  const j = await r.json();
  const content = (((j.choices || [])[0] || {}).message || {}).content || '';
  return { content, tokens: (j.usage || {}).total_tokens || 0 };
}

app.post('/api/assist', async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(400).json({ ok: false, error: 'No OpenAI key set — add one in Settings.' });
  if (!assistEnabled()) return res.status(403).json({ ok: false, error: 'AI assistant is disabled in Settings.' });
  const b = req.body || {};
  const kind = ['cover', 'screening'].includes(b.kind) ? b.kind : 'cover';
  const rows = readStore();
  const row = rows.find(r => reqKey(r) === String(b.key || '').toLowerCase().trim());
  const company = (row && row.company) || b.company || '';
  const role = (row && row.role) || b.role || '';
  if (!company && !role) return res.status(404).json({ ok: false, error: 'Req not found and no company/role provided.' });
  const cap = assistDailyCalls();
  const u = assistUsage();
  if (cap && u.calls >= cap) return res.status(429).json({ ok: false, error: `Daily assistant cap reached (${u.calls}/${cap}). Raise it in Settings or wait.` });

  const p = readProfile();
  const a = p.applicant || {};
  const narr = (p.narratives || []).map(n => `- ${n.title}: ${n.body}`).join('\n');
  const jd = String(b.jd || (row && row.notes) || '').slice(0, parseInt(process.env.OPENAI_JD_CHARS || '3500', 10));
  const system = 'You help a job candidate draft application materials. Write in first person, plain and PM-level, honest — no overclaiming, no flowery "ChatGPT" phrasing. Ground every claim ONLY in the candidate\'s narrative library; never invent employers, metrics, or titles. Be concise.';
  let user;
  if (kind === 'screening') {
    user = `Candidate: ${a.name || ''}\nTarget: ${role} at ${company}\n\nCandidate narrative library (use ONLY these facts):\n${narr || '(none provided)'}\n\nJob context:\n${jd}\n\nScreening question:\n${b.question || ''}\n\nWrite a tight, honest answer (120-180 words) grounded in the narratives.`;
  } else {
    user = `Candidate: ${a.name || ''}\nTarget: ${role} at ${company}\n\nCandidate narrative library (use ONLY these facts):\n${narr || '(none provided)'}\n\nJob context:\n${jd}\n\nDraft a short cover note (150-220 words): why this role fits, 1-2 concrete proof points from the narratives, and a confident close. First person, plain.`;
  }
  try {
    const { content, tokens } = await openaiChat({ model: assistModel(), system, user, maxTokens: assistMaxTokens() });
    u.calls += 1; u.tokens += tokens || 0; writeJsonPretty(ASSIST_USAGE, u);
    logAssist({ ts: new Date().toISOString(), key: reqKey({ company, role }), kind, model: assistModel(), tokens, question: kind === 'screening' ? String(b.question || '').slice(0, 200) : undefined });
    res.json({ ok: true, draft: content, kind, tokens, usage: { calls: u.calls, tokens: u.tokens, cap } });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ---------- CV builder (Reqon) ----------
// Assembles a downloadable .docx CV from the candidate's profile. The summary is AI-written when a
// key is available (grounded in the same facts), else deterministic. Body sections are ALWAYS the
// real structured fields (work history / education / narratives / awards) — never invented.
const CV_CACHE = path.join(ROOT, 'agent', 'cv-latest.json');

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
  const jd = t && t.jd ? `\nTarget job description:\n${String(t.jd).slice(0, parseInt(process.env.OPENAI_JD_CHARS || '3500', 10))}` : '';
  if (facts && process.env.OPENAI_API_KEY && assistEnabled()) {
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
    try { writeJsonPretty(CV_CACHE, { sections: s, summary, source, tailoredFor, builtAt: new Date().toISOString() }); } catch (e) {}
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
    let cache = readJsonSafe(CV_CACHE, null);
    if (!cache || !cache.sections) { const p = readProfile(); cache = { sections: cvSections(p), summary: (await cvSummary(p)).text }; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(cvHtml(cache.sections, cache.summary || ''));
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Stream the CV as a .docx (uses the last POST /api/cv content, else builds fresh).
app.get('/api/cv.docx', async (req, res) => {
  try {
    let cache = readJsonSafe(CV_CACHE, null);
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
const DIGEST_STATE = path.join(ROOT, 'agent', 'digest-state.json');
const DIGEST_PYTHON = path.join(ROOT, 'agent', 'digest.py');
const digestEnabled = () => process.env.DIGEST_ENABLED === 'true';
const digestTime = () => /^\d{1,2}:\d{2}$/.test(process.env.DIGEST_TIME || '') ? process.env.DIGEST_TIME : '07:00';
const digestChannel = () => ['file', 'slack', 'email'].includes(process.env.DIGEST_CHANNEL) ? process.env.DIGEST_CHANNEL : 'file';
const digestDays = () => Math.max(1, Math.min(60, parseInt(process.env.DIGEST_DAYS || '1', 10) || 1));
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
  const hy = hygieneSettings(readJsonSafe(BOARDS_FILE, {}));
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

async function deliverDigest(channel, payload) {
  channel = channel || digestChannel();
  // always write the file fallback
  try {
    fs.mkdirSync(path.join(ROOT, 'agent'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'agent', 'digest-latest.html'), payload.html);
    fs.writeFileSync(path.join(ROOT, 'agent', 'digest-latest.txt'), payload.text);
  } catch (e) {}
  if (channel === 'slack') {
    const url = process.env.DIGEST_SLACK_WEBHOOK || '';
    if (!url) throw new Error('Slack channel selected but DIGEST_SLACK_WEBHOOK is not set.');
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: payload.text }) });
    if (!r.ok) throw new Error('Slack webhook HTTP ' + r.status);
    return { channel: 'slack' };
  }
  if (channel === 'email') {
    // SMTP via the stdlib Python deliverer (no Node SMTP dep)
    const tmp = path.join(BACKUP_DIR, 'digest-payload-' + backupStamp() + '.json');
    ensureBackupDir();
    fs.writeFileSync(tmp, JSON.stringify(payload));
    await new Promise((resolve, reject) => {
      let err = '';
      const child = spawn(resolvePython(), [DIGEST_PYTHON, '--send-file', tmp], { cwd: ROOT, env: process.env });
      child.stderr && child.stderr.on('data', d => { err += d; });
      child.once('error', e => reject(e));
      child.once('exit', code => { try { fs.unlinkSync(tmp); } catch (e) {} code === 0 ? resolve() : reject(new Error('email send failed: ' + (err.trim() || ('exit ' + code)))); });
    });
    return { channel: 'email' };
  }
  return { channel: 'file', file: 'agent/digest-latest.html' };
}

app.get('/api/digest', (req, res) => {
  const days = req.query.days ? parseInt(req.query.days, 10) : digestDays();
  res.json({ ok: true, digest: composeDigest(days) });
});

app.post('/api/digest/send', async (req, res) => {
  const b = req.body || {};
  const channel = ['file', 'slack', 'email'].includes(b.channel) ? b.channel : digestChannel();
  try {
    const payload = composeDigest(b.days);
    const r = await deliverDigest(channel, payload);
    let st = readJsonSafe(DIGEST_STATE, {});
    st.lastSent = new Date().toISOString(); st.lastChannel = r.channel; st.lastCounts = payload.counts;
    writeJsonPretty(DIGEST_STATE, st);
    res.json({ ok: true, delivered: r.channel, counts: payload.counts });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// In-server scheduler: once a minute, if enabled and the local HH:MM matches and we haven't
// sent today, compose + deliver. Runs only while the server is up (launchd keeps it up).
let digestLastTick = '';
function digestScheduler() {
  try {
    if (!digestEnabled()) return;
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const want = digestTime().padStart(5, '0');
    const today = now.toISOString().slice(0, 10);
    if (hhmm !== want) return;
    const st = readJsonSafe(DIGEST_STATE, {});
    if ((st.lastSent || '').slice(0, 10) === today) return;   // already sent today
    if (digestLastTick === today + hhmm) return;
    digestLastTick = today + hhmm;
    composeDigestAndDeliver();
  } catch (e) { console.error('[digest]', e.message); }
}
async function composeDigestAndDeliver() {
  try {
    const payload = composeDigest();
    const r = await deliverDigest(digestChannel(), payload);
    const st = readJsonSafe(DIGEST_STATE, {});
    st.lastSent = new Date().toISOString(); st.lastChannel = r.channel; st.lastCounts = payload.counts;
    writeJsonPretty(DIGEST_STATE, st);
    console.log('[digest] sent via ' + r.channel, payload.counts);
    // WP-0 push hook: digest summary incl. follow-ups due (FR-SRV-5)
    const c = payload.counts || {};
    sendPush({ title: 'Morning digest',
      body: `${c.newFinds || 0} new · ${c.followUps || 0} follow-ups due · ${c.closed || 0} closed`,
      eventKey: 'digest-' + new Date().toISOString().slice(0, 10) }).catch(() => {});
  } catch (e) { console.error('[digest] delivery failed:', e.message); }
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
  // auto-derive tier when scoring changed but tier wasn't explicitly provided (AUTO-promote/demote)
  if ((('fit' in apply) || ('prob' in apply)) && !('tier' in apply)) {
    apply.tier = computeTier(apply.fit != null ? apply.fit : before.fit, apply.prob != null ? apply.prob : before.prob, tierThresholds(readJsonSafe(BOARDS_FILE, {})));
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

  res.json({ ok: true, key, changes, tier: after.tier, conf: after.conf, needsEnrichment: after.needsEnrichment === true, logged: true });
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
    const back = since ? merged.filter(r => (r.syncedAt || r.updatedAt || '') > since) : merged;
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
const PROFILE_JSON = path.join(ROOT, 'agent', 'profile.json');
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
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const prof = readJsonSafe(PROFILE_JSON, {});
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
  if (('fit' in fields) || ('prob' in fields)) fields.tier = computeTier(fields.fit != null ? fields.fit : row.fit, fields.prob != null ? fields.prob : row.prob, tierThresholds(readJsonSafe(BOARDS_FILE, {})));
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
  try {
    let rows = readStore();
    let idx = rows.findIndex(r => reqKey(r) === key);
    if (idx < 0) return;
    const ce = await computeEnrichFields(rows[idx], { score: true });
    if (!ce) return;
    rows = readStore();                                   // re-read post-fetch
    idx = rows.findIndex(r => reqKey(r) === key);
    if (idx < 0) return;
    const res = applyEnrichedRow(rows, idx, ce.fields);
    writeStore(rows);
    logEnrichment({ ts: new Date().toISOString(), run: 'auto-enrich', key, action: 'enrich',
      result: res.action === 'merged' ? 'merged' : 'pass', changes: res.changes,
      note: res.action === 'merged' ? ('resolved to already-tracked ' + res.into + '; duplicate lead removed') : ('auto-enrich on capture' + (ce.scored ? ' + AI score' : '')) });
  } catch (e) { console.error('[auto-enrich]', e.message); }
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
const PUSH_TOKENS = path.join(ROOT, 'agent', 'push-tokens.json');
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
const pushDevices = () => readJsonSafe(PUSH_TOKENS, []);
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
    writeJsonPretty(PUSH_TOKENS, list);
  }
  res.json({ ok: true, devices: list.length, apnsConfigured: apnsConfigured() });
});
// Manual test push (full-auth) — verifies the APNs pipeline without waiting on a scout run.
app.post('/api/push/test', async (req, res) => {
  const r = await sendPush({ title: 'Job Pipeline CRM', body: (req.body || {}).message || 'Test push from the server.', eventKey: 'test-' + Date.now() });
  res.json(Object.assign({ ok: true }, r));
});

// ---------- scout trigger (deterministic core; optional OpenAI enrichment) ----------
// POST /api/scout/run {mode:'find'|'validate'|'both'}  -> spawns agent/scout_run.py detached,
//   returns immediately. GET /api/scout/status -> live progress from agent/scout-status.json.
// The child inherits the server env, so OPENAI_API_KEY / OPENAI_MODEL (if set) enable the
// LLM rescoring layer. One run at a time; killed after a hard timeout.
const SCOUT_STATUS = path.join(ROOT, 'agent', 'scout-status.json');
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
  try { fs.writeFileSync(SCOUT_STATUS, JSON.stringify(obj, null, 2)); } catch (e) {}
}

app.get('/api/scout/status', (req, res) => {
  let last = null;
  try { last = JSON.parse(fs.readFileSync(SCOUT_STATUS, 'utf8')); } catch (e) {}
  const llmEnabled = !!process.env.OPENAI_API_KEY;
  res.json({
    ok: true, running: !!scoutChild, current: scoutMeta, last,
    llmEnabled, llmModel: llmEnabled ? (process.env.OPENAI_MODEL || 'gpt-5.4-mini') : null
  });
});

app.post('/api/scout/run', (req, res) => {
  if (scoutChild) return res.status(409).json({ ok: false, running: true, error: 'A scout run is already in progress.' });
  const body = req.body || {};
  const mode = ['find', 'validate', 'both', 'source-backfill'].includes(body.mode) ? body.mode : 'both';
  // optional source scoping: array or comma string of source names
  let sources = body.sources;
  if (Array.isArray(sources)) sources = sources.filter(s => typeof s === 'string' && /^[a-z0-9_-]+$/i.test(s)).join(',');
  else if (typeof sources === 'string') sources = sources.split(',').map(s => s.trim()).filter(s => /^[a-z0-9_-]+$/i.test(s)).join(',');
  else sources = '';
  const startedAt = new Date().toISOString();
  scoutMeta = { mode, startedAt, sources: sources || 'all' };
  writeScoutStatus({ state: 'running', phase: 'starting', mode, startedAt, sources: sources || 'all' });

  const argv = [SCOUT_RUNNER, '--mode', mode, '--quiet'];
  if (sources) argv.push('--sources', sources);
  let child;
  try {
    child = spawn(resolvePython(), argv, { cwd: ROOT, env: process.env });
  } catch (e) {
    scoutChild = null; scoutMeta = null;
    writeScoutStatus({ state: 'error', mode, error: 'spawn failed: ' + (e.message || e) });
    return res.status(500).json({ ok: false, error: 'Could not start scout: ' + (e.message || e) });
  }
  scoutChild = child;
  const killer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} }, SCOUT_TIMEOUT_MS);
  if (child.stderr) child.stderr.on('data', d => console.error('[scout]', String(d).trim()));
  child.once('error', (err) => {            // e.g. python not found
    clearTimeout(killer); scoutChild = null; scoutMeta = null;
    writeScoutStatus({ state: 'error', mode, error: 'python launch failed: ' + (err.message || err) });
    console.error('[scout] launch error:', err.message || err);
  });
  child.once('exit', (code) => {
    clearTimeout(killer); scoutChild = null; scoutMeta = null;
    try {
      const s = JSON.parse(fs.readFileSync(SCOUT_STATUS, 'utf8'));
      if (s.state === 'running') { s.state = code === 0 ? 'done' : 'error'; if (code !== 0) s.error = 'exited ' + code; writeScoutStatus(s); }
    } catch (e) {}
    console.log('[scout] run finished (mode=' + mode + ', code=' + code + ')');
    // WP-0 push hook: notify registered devices when a successful run lands results
    if (code === 0) {
      try {
        const s = JSON.parse(fs.readFileSync(SCOUT_STATUS, 'utf8'));
        const added = (s.find && s.find.added) || 0, matches = (s.find && s.find.newMatches) || 0;
        const refreshed = (s.validate && s.validate.refreshed) || 0;
        if (added > 0 || matches > 0 || refreshed > 0) {
          sendPush({ title: 'Scout finished',
            body: `${added} new added` + (matches ? ` · ${matches} matches` : '') + (refreshed ? ` · ${refreshed} refreshed` : ''),
            eventKey: 'scout-' + (s.run || Date.now()) }).catch(() => {});
        }
      } catch (e) {}
    }
  });
  res.json({ ok: true, started: true, mode, sources: sources || 'all', llmEnabled: !!process.env.OPENAI_API_KEY });
});

// ---------- settings (sources on/off, keywords, OpenAI key/model) ----------
const BOARDS_FILE = path.join(ROOT, 'agent', 'boards.json');
const WATCHLIST_FILE = path.join(ROOT, 'agent', 'watchlist.json');
const ENV_FILE = path.join(ROOT, '.env');
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
function inferApplyMode(row, boards) {
  const m = applyModeMapMerged(boards);
  const s = rowSourceServer(row);
  return m[s] || m.other || 'manual';
}

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
  const tmp = ENV_FILE + '.tmp';
  fs.writeFileSync(tmp, lines.join('\n'));
  fs.renameSync(tmp, ENV_FILE);
  for (const k of keys) process.env[k] = updates[k];   // take effect without restart
}
const last4 = s => (s && s.length >= 4) ? s.slice(-4) : '';

function settingsPayload() {
  const boards = readJsonSafe(BOARDS_FILE, {});
  const watch = readJsonSafe(WATCHLIST_FILE, {});
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
      appTokenSet: !!process.env.APP_TOKEN,
      apnsSet: apnsConfigured(),
      pushDevices: pushDevices().length,
      ingestTokenSet: !!process.env.INGEST_TOKEN,
      ingestTokenLast4: last4(process.env.INGEST_TOKEN || '')
    },
    llm: {
      keySet: !!process.env.OPENAI_API_KEY,
      keyLast4: last4(process.env.OPENAI_API_KEY || ''),
      model: process.env.OPENAI_MODEL || 'gpt-5.4-mini'
    },
    budget: {
      maxPerRun: +(process.env.AI_ENRICH_MAX_PER_RUN || 40),
      ttlDays: +(process.env.AI_ENRICH_TTL_DAYS || 14),
      jdChars: +(process.env.OPENAI_JD_CHARS || 3500),
      maxTokens: +(process.env.OPENAI_MAX_TOKENS || 400)
    },
    digest: (() => { const st = readJsonSafe(DIGEST_STATE, {}); return {
      enabled: digestEnabled(), time: digestTime(), channel: digestChannel(), days: digestDays(),
      to: process.env.DIGEST_TO || '', from: process.env.DIGEST_FROM || '',
      webhookSet: !!process.env.DIGEST_SLACK_WEBHOOK, smtpSet: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
      smtpHost: process.env.SMTP_HOST || '', smtpPort: process.env.SMTP_PORT || '', smtpUser: process.env.SMTP_USER || '',
      lastSent: st.lastSent || null, lastChannel: st.lastChannel || null, lastCounts: st.lastCounts || null
    }; })(),
    assist: (() => { const u = assistUsage(); return {
      enabled: assistEnabled(), model: assistModel(),
      dailyCalls: assistDailyCalls(), maxTokens: assistMaxTokens(),
      callsToday: u.calls, tokensToday: u.tokens
    }; })(),
    backup: {
      retention: backupRetention(),
      guardPct: putGuardPct()
    }
  };
}

app.get('/api/settings', (req, res) => res.json(settingsPayload()));

app.put('/api/settings', (req, res) => {
  const b = req.body || {};
  try {
    const boards = readJsonSafe(BOARDS_FILE, {});
    const watch = readJsonSafe(WATCHLIST_FILE, {});
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

    if (touchedWatch) writeJsonPretty(WATCHLIST_FILE, watch);

    // OpenAI + optional aggregator keys -> .env (+ live process.env). Empty string clears.
    const envUpd = {};
    if (typeof b.openaiModel === 'string' && b.openaiModel.trim()) envUpd.OPENAI_MODEL = b.openaiModel.trim();
    if (typeof b.openaiKey === 'string') envUpd.OPENAI_API_KEY = b.openaiKey.trim();   // '' clears
    if (b.envKeys && typeof b.envKeys === 'object') {
      for (const k of ['THEIRSTACK_API_KEY', 'APIFY_TOKEN', 'OPENAI_BASE_URL']) {
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
    // scout politeness delay (boards.json; was file-only)
    if (b.minDelaySeconds != null && !isNaN(+b.minDelaySeconds)) { boards.minDelaySeconds = Math.max(0, Math.min(10, +b.minDelaySeconds)); touchedBoards = true; }
    if (b.analyticsWindowDays != null && !isNaN(+b.analyticsWindowDays)) { boards.analyticsWindowDays = Math.max(0, Math.min(3650, Math.round(+b.analyticsWindowDays))); touchedBoards = true; }
    // write boards.json AFTER all boards mutations above (incl. minDelay/analytics in this block)
    if (touchedBoards) writeJsonPretty(BOARDS_FILE, boards);
    // morning digest (Phase 7)
    if (typeof b.digestEnabled === 'boolean') envUpd.DIGEST_ENABLED = b.digestEnabled ? 'true' : 'false';
    if (typeof b.digestTime === 'string' && /^\d{1,2}:\d{2}$/.test(b.digestTime)) envUpd.DIGEST_TIME = b.digestTime;
    if (['file', 'slack', 'email'].includes(b.digestChannel)) envUpd.DIGEST_CHANNEL = b.digestChannel;
    if (b.digestDays != null && !isNaN(+b.digestDays)) envUpd.DIGEST_DAYS = String(Math.max(1, Math.min(60, Math.round(+b.digestDays))));
    if (typeof b.digestTo === 'string') envUpd.DIGEST_TO = b.digestTo.trim();
    if (typeof b.digestFrom === 'string') envUpd.DIGEST_FROM = b.digestFrom.trim();
    if (typeof b.digestSlackWebhook === 'string') envUpd.DIGEST_SLACK_WEBHOOK = b.digestSlackWebhook.trim();
    if (typeof b.smtpHost === 'string') envUpd.SMTP_HOST = b.smtpHost.trim();
    if (typeof b.smtpPort === 'string' || typeof b.smtpPort === 'number') envUpd.SMTP_PORT = String(b.smtpPort).trim();
    if (typeof b.smtpUser === 'string') envUpd.SMTP_USER = b.smtpUser.trim();
    if (typeof b.smtpPass === 'string' && b.smtpPass) envUpd.SMTP_PASS = b.smtpPass;   // only set when provided
    // Data-safety knobs
    if (b.backupRetention != null && !isNaN(+b.backupRetention)) envUpd.BACKUP_RETENTION = String(Math.max(1, Math.min(1000, Math.round(+b.backupRetention))));
    if (b.putGuardPct != null && !isNaN(+b.putGuardPct)) envUpd.PUT_GUARD_PCT = String(Math.max(0, Math.min(100, Math.round(+b.putGuardPct))));
    // explicit secret clearing (blank-input fields default to "keep"; a Clear action sends this)
    if (Array.isArray(b.clearSecrets)) {
      const clearable = new Set(['OPENAI_API_KEY', 'DIGEST_SLACK_WEBHOOK', 'SMTP_PASS', 'THEIRSTACK_API_KEY', 'APIFY_TOKEN']);
      for (const k of b.clearSecrets) if (clearable.has(k)) envUpd[k] = '';
    }
    if (Object.keys(envUpd).length) setEnvVars(envUpd);

    res.json(settingsPayload());
  } catch (e) {
    console.error('[PUT /api/settings]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- source health + discovery (Phase 9) ----------
const SOURCE_HEALTH_FILE = path.join(ROOT, 'agent', 'source-health.json');
app.get('/api/source-health', (req, res) => {
  res.json({ ok: true, health: readJsonSafe(SOURCE_HEALTH_FILE, { sources: {} }) });
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
  const boards = readJsonSafe(BOARDS_FILE, {});
  boards.companies = boards.companies || [];
  const dup = boards.companies.find(c => String(c.ats).toLowerCase() === ats && String(c.slug).toLowerCase() === slug.toLowerCase());
  if (dup) return res.json({ ok: true, added: 0, duplicate: true, name: dup.name, total: boards.companies.length });
  boards.companies.push({ name, ats, slug });
  writeJsonPretty(BOARDS_FILE, boards);
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

// Timestamped, keep-forever snapshot of the current store ("Snapshot now").
app.post('/api/backup', (req, res) => {
  const file = snapshotData('manual');
  if (!file) return res.status(500).json({ ok: false, error: 'snapshot failed (no data file?)' });
  res.json({ ok: true, file });
});

// List snapshots, newest first.
app.get('/api/backups', (req, res) => {
  try {
    ensureBackupDir();
    const list = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).map(f => {
      const fp = path.join(BACKUP_DIR, f);
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

// Restore a snapshot — snapshots the CURRENT store first, validates the backup, then replaces.
app.post('/api/restore', (req, res) => {
  const fp = resolveBackup((req.body || {}).file);
  if (!fp) return res.status(400).json({ ok: false, error: 'Unknown or invalid backup file.' });
  let restored;
  try { restored = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { return res.status(400).json({ ok: false, error: 'Backup is not valid JSON.' }); }
  if (!Array.isArray(restored)) return res.status(400).json({ ok: false, error: 'Backup is not a requisition array.' });
  try {
    const before = readStore().length;
    const pre = snapshotData('auto');           // safety snapshot of the about-to-be-replaced state
    writeStore(restored);
    pruneAutoBackups();
    logChange({ ts: new Date().toISOString(), action: 'restore', file: path.basename(fp), before, after: restored.length, preSnapshot: pre });
    res.json({ ok: true, restored: restored.length, from: path.basename(fp), preSnapshot: pre });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

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
ensureConfig();
ensureStore();
// Pure logic exported for the shared test-vector suite (tests/run-vectors.js) and future
// clients. Requiring this module does NOT start the server, schedulers, or the migration.
module.exports = { postingId, sameReq, reqKey, computeTier, reconcileSync, ensureRowIdentity, extractJobMeta, companyFromUrl, liveRows };

if (require.main !== module) return;   // imported for tests — stop before side effects

// WP-0 one-time identity migration: backfill id/updatedAt on legacy rows (snapshot first).
try {
  const rows = readStore();
  const n = ensureRowIdentity(rows);
  if (n > 0) { snapshotData('phase'); writeStore(rows); console.log(`[migrate] backfilled id/updatedAt (${n} field(s) across ${rows.length} rows)`); }
} catch (e) { console.error('[migrate] identity backfill failed:', e.message); }

setInterval(digestScheduler, 60 * 1000);   // morning-digest scheduler (Phase 7)
app.listen(PORT, HOST, () => {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets).flat().find(n => n && n.family === 'IPv4' && !n.internal);
  console.log(`\n  Job Pipeline CRM running:`);
  console.log(`    Local:   http://localhost:${PORT}`);
  if (lan) console.log(`    LAN:     http://${lan.address}:${PORT}`);
  console.log(`    Mobile:  http://localhost:${PORT}/m`);
  console.log(`    Data:    ${DATA_FILE}`);
  if (APP_TOKEN) {
    console.log(`    Auth:    ON — passphrase required for /m, the board, and the API from any non-localhost client.`);
  } else {
    console.log(`    Auth:    OFF — set APP_TOKEN=<passphrase> before exposing this server to the internet.`);
  }
  console.log('');
});
