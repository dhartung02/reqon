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
const reqKey = x => (String(x.company || '') + '|' + String(x.role || '')).toLowerCase().trim();
const expectedValue = x => +(((+x.fit || 0) * (+x.prob || 0)) / 10).toFixed(1);

// Tier from fit/prob per agent/scoring-criteria.md (EV = fit*prob/10).
// A = apply-now (EV>=5.2 AND fit>=8 AND prob>=6.5); B = strong (EV>=4.0); C = monitor.
function computeTier(fit, prob) {
  const f = +fit || 0, p = +prob || 0, ev = +((f * p) / 10).toFixed(1);
  if (ev >= 5.2 && f >= 8 && p >= 6.5) return 'A';
  if (ev >= 4.0) return 'B';
  return 'C';
}

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
  const tier = row.tier || computeTier(row.fit, row.prob);
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
app.use('/api', (req, res, next) => {
  if (authed(req)) return next();
  res.status(401).json({ ok: false, error: 'auth required' });
});

app.use(express.static(path.join(ROOT, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, count: readStore().length, port: PORT, dataFile: DATA_FILE });
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
app.post('/api/reqs/merge', (req, res) => {
  const incoming = req.body;
  if (!Array.isArray(incoming)) return res.status(400).json({ ok: false, error: 'Expected a JSON array of requisitions.' });
  const rows = readStore();
  const boards = readJsonSafe(BOARDS_FILE, {});
  const existing = new Set(rows.map(reqKey));
  let added = 0, skippedPolicy = 0;
  const addedKeys = [], policyDrops = [];
  for (const x of incoming) {
    const k = reqKey(x);
    if (!k || k === '|') continue;
    if (!existing.has(k)) {
      // default any missing tracking fields so merged rows render cleanly
      const row = Object.assign({
        status: 'Not Applied', applied: '', interview: '', recruiter: '', referral: 'No',
        resume: '—', cover: 'No', followup: '', lastcontact: '', next: '', source: '',
        added: new Date().toISOString().slice(0, 10)
      }, x);
      // enforce the A/B-only + employment policy at the merge boundary (config-driven)
      const block = mergePolicyBlock(row, boards);
      if (block) { skippedPolicy++; policyDrops.push({ key: k, reason: block }); continue; }
      if (!row.applyMode) row.applyMode = inferApplyMode(row, boards);   // Phase 4: stamp how to apply
      rows.push(row);
      existing.add(k);
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
    needsEnrichment: true   // Tier 1: every fresh capture is queued for deep enrichment
  };
  row.applyMode = inferApplyMode(row, readJsonSafe(BOARDS_FILE, {}));   // Phase 4
  const rows = readStore();
  const k = reqKey(row);
  if (rows.some(r => reqKey(r) === k)) {
    return res.json({ ok: true, added: 0, skipped: 1, duplicate: true, company, role, total: rows.length });
  }
  rows.push(row);
  try {
    writeStore(rows);
    res.json({ ok: true, added: 1, company, role, tier: row.tier, total: rows.length });
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
    for (const k of ['roleTerms', 'industries', 'sectors', 'priorityKeywords', 'secondaryKeywords', 'narratives']) {
      if (Array.isArray(preserved[k]) && preserved[k].length) regen[k] = preserved[k];   // keep manual edits
    }
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
  const rows = readStore();
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
  } catch (e) { console.error('[digest] delivery failed:', e.message); }
}

// ---------- enrichment queue (Tier 2 infra) ----------
// The scout's STEP 0 reads this queue, then PATCHes each row back with enriched fields.
app.get('/api/reqs/needing-enrichment', (req, res) => {
  const rows = readStore();
  const queue = rows.filter(r => r.needsEnrichment === true);
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
    apply.tier = computeTier(apply.fit != null ? apply.fit : before.fit, apply.prob != null ? apply.prob : before.prob);
  }
  const changes = {};
  for (const k of Object.keys(apply)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(apply[k])) changes[k] = { old: before[k] === undefined ? null : before[k], new: apply[k] };
  }
  Object.assign(rows[idx], apply);
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
    remoteOnly: boards.remoteOnly !== false,
    minDelaySeconds: boards.minDelaySeconds != null ? boards.minDelaySeconds : 0.4,
    analyticsWindowDays: boards.analyticsWindowDays != null ? boards.analyticsWindowDays : 0,
    minTierToMerge: ['A', 'B', 'C'].includes(String(boards.minTierToMerge || '').toUpperCase()) ? String(boards.minTierToMerge).toUpperCase() : 'B',
    skipEmploymentTypes: Array.isArray(boards.skipEmploymentTypes) ? boards.skipEmploymentTypes : DEFAULT_SKIP_TYPES,
    negativeKeywords: st.negativeKeywords || [],
    tabStatusMap: (boards.tabStatusMap && typeof boards.tabStatusMap === 'object') ? boards.tabStatusMap : DEFAULT_TAB_MAP,
    hygiene: hygieneSettings(boards),
    applyModes: APPLY_MODES,
    applyModeMap: applyModeMapMerged(boards),
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
    const wb = await buildWorkbook(readStore());
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
