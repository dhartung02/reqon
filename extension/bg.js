/**
 * Service worker — the only place that talks to the CRM server (FR-EXT-1: configured
 * origin only). Holds the API client, a 60s row cache for overlay lookups, and the
 * offline action queue (FR-EXT-5: failed writes persist and flush on an alarm).
 */
importScripts('lib.js');

const DEFAULTS = { origin: 'http://localhost:8787', token: '' };
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
  if (!res.ok) throw new Error('HTTP ' + res.status);
  try {
    return await res.json();
  } catch (e) {
    throw new Error('CRM returned a non-JSON response');
  }
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
  for (const a of queue) {
    try { await runAction(a); } catch (e) { remaining.push(a); }
  }
  await chrome.storage.local.set({ queue: remaining });
  if (!remaining.length) chrome.alarms.clear('flush-queue');
}
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'flush-queue') flushQueue(); });

// ---- actions ----
async function runAction(a) {
  if (a.kind === 'clip') {
    return api('/api/reqs/quickadd', { method: 'POST', body: JSON.stringify({ url: a.url, link: a.url, title: a.title, source: 'chrome-ext' }) });
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

async function clip(url, title) {
  let out;
  try {
    const j = await runAction({ kind: 'clip', url, title });
    rowCache.at = 0;   // invalidate — the new row (and its auto-enrichment) should show up
    out = j.duplicate ? { ok: true, msg: 'Already tracked: ' + j.company + ' — ' + j.role }
                      : { ok: true, msg: 'Added: ' + j.company + ' — ' + j.role + ' (enriching…)' };
  } catch (e) {
    await enqueue({ kind: 'clip', url, title });
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
        sendResponse(await clip(msg.url, msg.title));
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
      } else if (msg.type === 'profile') {
        sendResponse({ ok: true, profile: await getProfile(!!msg.force) });
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
