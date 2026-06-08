#!/usr/bin/env node
/**
 * Safe append-only merge of scored candidate requisitions into the CRM store.
 * Same rule as the server's POST /api/reqs/merge: key by company+role,
 * append rows that don't exist, NEVER overwrite existing tracking edits.
 *
 * Usage:
 *   node agent/merge-into-crm.js candidates.json
 *   cat candidates.json | node agent/merge-into-crm.js
 *
 * Prefers the running server (so the live board updates instantly); if the
 * server isn't reachable, falls back to a direct, atomic write of ../data.json.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data.json');
const PORT = process.env.PORT || 8787;
const reqKey = x => (String(x.company || '') + '|' + String(x.role || '')).toLowerCase().trim();

function readInput() {
  const arg = process.argv[2];
  const raw = arg ? fs.readFileSync(arg, 'utf8') : fs.readFileSync(0, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Input must be a JSON array of requisitions.');
  return data;
}

function withDefaults(x) {
  return Object.assign({
    status: 'Not Applied', applied: '', interview: '', recruiter: '', referral: 'No',
    resume: '—', cover: 'No', followup: '', lastcontact: '', next: '',
    added: new Date().toISOString().slice(0, 10)
  }, x);
}

function httpMerge(rows) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(rows);
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: '/api/reqs/merge', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 2500 },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(body); req.end();
  });
}

function fileMerge(rows) {
  const store = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : [];
  const existing = new Set(store.map(reqKey));
  let added = 0;
  for (const x of rows) {
    const k = reqKey(x);
    if (!k || k === '|' || existing.has(k)) continue;
    store.push(withDefaults(x));
    existing.add(k);
    added++;
  }
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DATA_FILE);
  return { ok: true, added, skipped: rows.length - added, total: store.length, via: 'file' };
}

(async () => {
  const rows = readInput();
  let result;
  try {
    result = await httpMerge(rows);
    result.via = 'http';
  } catch (e) {
    result = fileMerge(rows);
  }
  console.log(JSON.stringify(result, null, 2));
})().catch(e => { console.error('merge failed:', e.message); process.exit(1); });
