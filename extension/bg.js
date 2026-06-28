/**
 * Service worker — the only place that talks to the CRM server (FR-EXT-1: configured
 * origin only). Holds the API client, a 60s row cache for overlay lookups, and the
 * offline action queue (FR-EXT-5: failed writes persist and flush on an alarm).
 */
importScripts('lib.js');

const DEFAULTS = { origin: 'https://cloud.reqon.app', token: '' };
const getCfg = () => new Promise(r => chrome.storage.sync.get(DEFAULTS, r));

// Optional desktop notification (toggle lives in the popup; default on).
async function notify(message) {
  try {
    const { notifyEnabled = true } = await chrome.storage.sync.get({ notifyEnabled: true });
    if (!notifyEnabled) return;
    chrome.notifications.create({ type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'), title: 'Reqon Clip', message });
  } catch (e) { /* notifications optional */ }
}
// Re-badge the active tab (after a clip/mark-applied changes its tracked state).
async function badgeActiveTab() {
  try { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); if (t) refreshBadge(t.id, t.url); } catch (e) {}
}

async function api(path, opts = {}) {
  const cfg = await getCfg();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (cfg.token) headers['X-CRM-Token'] = cfg.token;
  let res;
  try {
    res = await fetch(cfg.origin.replace(/\/$/, '') + path, Object.assign({}, opts, { headers }));
  } catch (e) {
    throw new Error('Network error reaching CRM (' + (e && e.message ? e.message : e) + ')');
  }
  if (!res.ok) {
    // Surface the server's freemium gate (402 upgrade_required) with the package name, instead of a
    // bare "HTTP 402" — so the side panel can show a meaningful upgrade message.
    if (res.status === 402) {
      let body = null; try { body = await res.json(); } catch (e) {}
      const pkg = body && body.requires ? body.requires[0].toUpperCase() + body.requires.slice(1) : 'paid';
      const err = new Error('Requires the ' + pkg + ' package');
      err.upgrade = body || { error: 'upgrade_required' };
      throw err;
    }
    throw new Error('HTTP ' + res.status);
  }
  try {
    return await res.json();
  } catch (e) {
    throw new Error('CRM returned a non-JSON response');
  }
}

// ---- entitlements cache (the freemium plan + feature gate map; 60s like rows/profile) ----
let entCache = { ent: null, at: 0 };
async function getEntitlements(force) {
  if (!force && entCache.ent && Date.now() - entCache.at < 60000) return entCache.ent;
  const j = await api('/api/entitlements');
  entCache = { ent: j, at: Date.now() };
  return j;
}

// ---- row cache (overlay lookups shouldn't hammer the server) ----
let rowCache = { rows: null, at: 0 };
async function getRows(force) {
  if (!force && rowCache.rows && Date.now() - rowCache.at < 60000) return rowCache.rows;
  const rows = await api('/api/reqs');
  rowCache = { rows, at: Date.now() };
  return rows;
}

// ---- profile cache (apply-assist fill: factual fields + saved answers) ----
let profileCache = { profile: null, at: 0 };
async function getProfile(force) {
  if (!force && profileCache.profile && Date.now() - profileCache.at < 60000) return profileCache.profile;
  const j = await api('/api/profile');
  profileCache = { profile: (j && j.profile) || {}, at: Date.now() };
  return profileCache.profile;
}

// ---- offline queue (FR-EXT-5) ----
async function enqueue(action) {
  const { queue = [] } = await chrome.storage.local.get('queue');
  queue.push(Object.assign({ ts: Date.now() }, action));
  await chrome.storage.local.set({ queue });
  chrome.alarms.create('flush-queue', { periodInMinutes: 1 });
}
async function flushQueue() {
  const { queue = [] } = await chrome.storage.local.get('queue');
  if (!queue.length) return;
  const remaining = [];
  let lastError = '';
  for (const a of queue) {
    try { await runAction(a); } catch (e) { remaining.push(a); lastError = e && e.message ? e.message : String(e); }
  }
  await chrome.storage.local.set({ queue: remaining, queueLastRetry: Date.now(), queueLastError: remaining.length ? lastError : '' });
  if (!remaining.length) chrome.alarms.clear('flush-queue');
}
// A short human label for a queued action (popup list).
function queueLabel(a) {
  if (a.kind === 'clip') return 'Clip: ' + (a.title ? String(a.title).slice(0, 60) : a.url);
  if (a.kind === 'markApplied') return 'Mark applied: ' + (a.key || '');
  return a.kind || 'action';
}
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'flush-queue') flushQueue(); });

// ---- actions ----
async function runAction(a) {
  if (a.kind === 'clip') {
    const m = a.meta || {};
    // Fold the user's note/tag/priority + a JD excerpt into notes so they surface on the board
    // without needing new columns. Factual captures (salary/remote/source) map to real fields.
    const noteParts = [];
    if (a.note) noteParts.push('Note: ' + a.note);
    if (a.tag) noteParts.push('Tags: ' + a.tag);
    if (a.priority) noteParts.push('Priority: ' + a.priority);
    if (m.jdExcerpt) noteParts.push('JD: ' + m.jdExcerpt);
    const body = {
      url: a.url, link: a.url, title: a.title, source: 'chrome-ext',
      salary: m.salary || '', remote: m.remote || '', sourceType: m.source || '',
      notes: noteParts.join('\n') || undefined,
    };
    return api('/api/reqs/quickadd', { method: 'POST', body: JSON.stringify(body) });
  }
  if (a.kind === 'markApplied') {
    // same semantics as the board's bulk Mark Applied — never overwrites an existing date/next
    const today = new Date().toISOString().slice(0, 10);
    const fields = { status: 'Applied', applied: a.applied || today, lastcontact: today, reqCheck: 'open-applied' };
    if (!a.hasNext) fields.next = 'Await recruiter response';
    return api('/api/reqs/' + encodeURIComponent(a.key), { method: 'PATCH', body: JSON.stringify({ fields, note: 'marked applied via chrome-ext' }) });
  }
  throw new Error('unknown action ' + a.kind);
}

async function clip(url, title, extra) {
  const action = Object.assign({ kind: 'clip', url, title }, extra || {});
  let out;
  try {
    const j = await runAction(action);
    rowCache.at = 0;   // invalidate — the new row (and its auto-enrichment) should show up
    out = j.duplicate ? { ok: true, msg: 'Already tracked: ' + j.company + ' — ' + j.role }
                      : { ok: true, msg: 'Added: ' + j.company + ' — ' + j.role + ' (enriching…)' };
  } catch (e) {
    await enqueue(action);
    out = { ok: false, msg: 'Server unreachable — clip queued, will retry. (' + e.message + ')' };
  }
  notify(out.msg);
  badgeActiveTab();
  return out;
}

async function markApplied(row) {
  const action = { kind: 'markApplied', key: reqKey(row), applied: row.applied || '', hasNext: !!row.next };
  let out;
  try {
    await runAction(action);
    rowCache.at = 0;
    out = { ok: true, msg: 'Marked Applied (today): ' + row.company + ' — ' + row.role };
  } catch (e) {
    await enqueue(action);
    out = { ok: false, msg: 'Server unreachable — status update queued. (' + e.message + ')' };
  }
  notify(out.msg);
  badgeActiveTab();
  return out;
}

// AI draft (Phase 3) — POSTs to /api/assist. Captures the server's JSON error body (daily-cap,
// no-key, etc.) so the panel can show a real message instead of a bare HTTP code. The server holds
// the OpenAI key + grounds every draft in the candidate's narratives; never auto-submits.
// POST helper that surfaces the server's JSON error body (daily-cap, no-key, etc.) instead of a bare
// HTTP code. Shared by assist / score / map-fields. The server holds the key + grounds everything.
async function postJson(path, payload) {
  const cfg = await getCfg();
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.token) headers['X-CRM-Token'] = cfg.token;
  try {
    const r = await fetch(cfg.origin.replace(/\/$/, '') + path, { method: 'POST', headers, body: JSON.stringify(payload || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || ('HTTP ' + r.status) };
    return j;
  } catch (e) {
    return { ok: false, error: 'Network error reaching CRM (' + (e && e.message ? e.message : e) + ')' };
  }
}
const assist = (payload) => postJson('/api/assist', payload);

// Patch a row's status (side-panel status controls, T1.3). Goes through the audited PATCH path, so
// moving into an interview stage triggers the server-side interview-guide build.
async function setStatus(row, status) {
  const today = new Date().toISOString().slice(0, 10);
  const fields = { status, lastcontact: today };
  if (status === 'Applied' && !row.applied) fields.applied = today;
  try {
    await api('/api/reqs/' + encodeURIComponent(reqKey(row)), { method: 'PATCH', body: JSON.stringify({ fields, note: 'status set via chrome-ext' }) });
    rowCache.at = 0; badgeActiveTab();
    return { ok: true, status };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ---- messages from the content script / options page ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'lookup') {
        flushQueue();   // piggyback: any connectivity is a chance to drain the queue
        const rows = await getRows(!!msg.force);
        const row = matchRow(rows, msg.url);
        sendResponse({ ok: true, row });
      } else if (msg.type === 'clip') {
        sendResponse(await clip(msg.url, msg.title, { meta: msg.meta, note: msg.note, tag: msg.tag, priority: msg.priority }));
      } else if (msg.type === 'markApplied') {
        sendResponse(await markApplied(msg.row));
      } else if (msg.type === 'reqs') {
        // All rows for the side-panel analytics view (reuses the 60s cache).
        sendResponse({ ok: true, rows: await getRows(!!msg.force) });
      } else if (msg.type === 'assist') {
        sendResponse(await assist(msg.payload));
      } else if (msg.type === 'score') {
        sendResponse(await postJson('/api/assist/score', msg.payload));
      } else if (msg.type === 'mapFields') {
        sendResponse(await postJson('/api/assist/map-fields', msg.payload));
      } else if (msg.type === 'setStatus') {
        sendResponse(await setStatus(msg.row, msg.status));
      } else if (msg.type === 'genGuide') {
        sendResponse(await postJson('/api/reqs/' + encodeURIComponent(msg.key) + '/guide', {}));
      } else if (msg.type === 'patchFields') {
        try {
          await api('/api/reqs/' + encodeURIComponent(reqKey(msg.row)), { method: 'PATCH', body: JSON.stringify({ fields: msg.fields || {}, note: 'edited via chrome-ext' }) });
          rowCache.at = 0; sendResponse({ ok: true });
        } catch (e) { sendResponse({ ok: false, error: e.message }); }
      } else if (msg.type === 'assistUsage') {
        try { sendResponse(await api('/api/assist/usage')); } catch (e) { sendResponse({ ok: false, error: e.message }); }
      } else if (msg.type === 'entitlements') {
        try { sendResponse(await getEntitlements(!!msg.force)); } catch (e) { sendResponse({ ok: false, error: e.message }); }
      } else if (msg.type === 'profile') {
        sendResponse({ ok: true, profile: await getProfile(!!msg.force) });
      } else if (msg.type === 'queueStatus') {
        const { queue = [], queueLastRetry = 0, queueLastError = '' } = await chrome.storage.local.get(['queue', 'queueLastRetry', 'queueLastError']);
        sendResponse({ ok: true, count: queue.length, items: queue.map((a, i) => ({ i, label: queueLabel(a), kind: a.kind, ts: a.ts })), lastRetry: queueLastRetry, lastError: queueLastError });
      } else if (msg.type === 'queueRetry') {
        await flushQueue();
        const { queue = [], queueLastError = '' } = await chrome.storage.local.get(['queue', 'queueLastError']);
        sendResponse({ ok: true, remaining: queue.length, lastError: queueLastError });
      } else if (msg.type === 'queueDiscard') {
        const { queue = [] } = await chrome.storage.local.get('queue');
        if (Number.isInteger(msg.index) && msg.index >= 0 && msg.index < queue.length) queue.splice(msg.index, 1);
        await chrome.storage.local.set({ queue });
        if (!queue.length) chrome.alarms.clear('flush-queue');
        sendResponse({ ok: true, remaining: queue.length });
      } else if (msg.type === 'queueClear') {
        await chrome.storage.local.set({ queue: [], queueLastError: '' });
        chrome.alarms.clear('flush-queue');
        sendResponse({ ok: true, remaining: 0 });
      } else if (msg.type === 'testConnection') {
        const j = await api('/api/health');
        sendResponse({ ok: true, msg: 'Connected — ' + j.count + ' rows on the board.' });
      } else sendResponse({ ok: false, msg: 'unknown message' });
    } catch (e) {
      sendResponse({ ok: false, msg: e.message });
    }
  })();
  return true;   // async sendResponse
});

// ---- passive badge: flag whether the page you're on is already tracked ----
// ✓ green = tracked, not yet applied · ● periwinkle = applied/in-process · × grey = closed · blank = untracked.
// (Clicking the icon opens the popup — see manifest default_popup — which handles clip / mark-applied.)
async function refreshBadge(tabId, url) {
  if (!tabId || !url || !/^https?:/.test(url)) { try { chrome.action.setBadgeText({ tabId, text: '' }); } catch (e) {} return; }
  try {
    const rows = await getRows();
    const row = matchRow(rows, url);
    let text = '', color = '#00df8f';
    if (row) {
      const s = row.status || '';
      if (/^(Rejected|Archived)$/.test(s)) { text = '×'; color = '#5a6470'; }
      else if (/^(Applied|Recruiter Screen|Hiring Manager|Panel|Offer)$/.test(s)) { text = '●'; color = '#706cff'; }
      else { text = '✓'; color = '#00df8f'; }
    }
    chrome.action.setBadgeText({ tabId, text });
    if (text) chrome.action.setBadgeBackgroundColor({ tabId, color });
  } catch (e) {
    try { chrome.action.setBadgeText({ tabId, text: '' }); } catch (_) {}
  }
}
chrome.tabs.onUpdated.addListener((tabId, info, tab) => { if (info.status === 'complete' && tab && tab.url) refreshBadge(tabId, tab.url); });
chrome.tabs.onActivated.addListener(async ({ tabId }) => { try { const t = await chrome.tabs.get(tabId); refreshBadge(tabId, t.url); } catch (e) {} });
