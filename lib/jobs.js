// ---------------------------------------------------------------------------
// Unified background-job registry (ROADMAP · P2.9)
//
// One job/status model shared by scout, enrichment, gmail ingest, interview-guide, digest, backup,
// etc. — so any long-running operation is observable (queued|running|succeeded|failed|cancelled +
// phase + progress) without reading logs. The tenant's jobs.json IS the store (a capped ring of the
// most recent jobs); reads/writes go through the tenant-scoped store, so jobs isolate per user.
//
// Pure-ish: all persistence is via the injected `store`, no other I/O. The server instruments its
// operations with create()/phase()/progress()/finish()/fail(), exposes /api/jobs, and registers a
// canceller for the few job types that own a killable child (scout).
// ---------------------------------------------------------------------------
'use strict';
const crypto = require('crypto');
const store = require('./store');

const CAP = 50;                              // keep the most recent N jobs per tenant
const TYPES = ['scout', 'enrichment', 'gmail_ingest', 'interview_guide', 'ai_assist', 'digest', 'backup', 'data_repair'];
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
const cancellers = new Map();                // jobId -> fn() that aborts the underlying work (e.g. kill child)

function readAll() { const a = store.readJson(store.paths().jobs, []); return Array.isArray(a) ? a : []; }
function writeAll(a) { store.writeJsonAtomic(store.paths().jobs, a.slice(0, CAP)); }
function patch(id, fields) {
  const a = readAll();
  const i = a.findIndex(j => j.id === id);
  if (i < 0) return null;
  a[i] = Object.assign({}, a[i], fields);
  writeAll(a);
  return a[i];
}

// Start a job. Returns the job (with its id). `meta` is free-form context (label, key, mode…).
function create(type, meta) {
  const job = {
    id: 'job_' + crypto.randomBytes(6).toString('hex'),
    type: TYPES.includes(type) ? type : String(type || 'task'),
    status: 'running', phase: (meta && meta.phase) || 'starting', progress: 0,
    label: (meta && meta.label) || '', meta: (meta && meta.meta) || meta || {},
    createdAt: new Date().toISOString(), startedAt: new Date().toISOString(),
    finishedAt: null, result: null, error: '',
  };
  const a = readAll(); a.unshift(job); writeAll(a);
  return job;
}
const phase = (id, phase, progress) => patch(id, Object.assign({ phase }, progress != null ? { progress } : {}));
const progress = (id, p) => patch(id, { progress: Math.max(0, Math.min(100, Math.round(p))) });
const finish = (id, result) => { cancellers.delete(id); return patch(id, { status: 'succeeded', progress: 100, finishedAt: new Date().toISOString(), result: result || null }); };
const fail = (id, error) => { cancellers.delete(id); return patch(id, { status: 'failed', finishedAt: new Date().toISOString(), error: String(error || '').slice(0, 500) }); };

// Register/cancel a killable job (only types that own a child register a canceller).
function onCancel(id, fn) { if (id && typeof fn === 'function') cancellers.set(id, fn); }
function cancel(id) {
  const a = readAll();
  const j = a.find(x => x.id === id);
  if (!j) return { ok: false, error: 'no such job' };
  if (TERMINAL.has(j.status)) return { ok: false, error: 'job already ' + j.status };
  const fn = cancellers.get(id);
  if (fn) { try { fn(); } catch (e) {} cancellers.delete(id); }
  return { ok: true, job: patch(id, { status: 'cancelled', finishedAt: new Date().toISOString() }) };
}

function list(opts) {
  let a = readAll();
  const o = opts || {};
  if (o.type) a = a.filter(j => j.type === o.type);
  if (o.active) a = a.filter(j => !TERMINAL.has(j.status));
  return a;
}
const get = id => readAll().find(j => j.id === id) || null;
const counts = () => { const a = readAll(); return { running: a.filter(j => j.status === 'running').length, total: a.length }; };

module.exports = { create, phase, progress, finish, fail, cancel, onCancel, list, get, counts, TYPES };
