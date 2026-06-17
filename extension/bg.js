/**
 * Service worker — the only place that talks to the CRM server (FR-EXT-1: configured
 * origin only). Holds the API client, a 60s row cache for overlay lookups, and the
 * offline action queue (FR-EXT-5: failed writes persist and flush on an alarm).
 */
importScripts('lib.js');

const DEFAULTS = { origin: 'http://localhost:8787', token: '' };
const getCfg = () => new Promise(r => chrome.storage.sync.get(DEFAULTS, r));

async function api(path, opts = {}) {
  const cfg = await getCfg();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (cfg.token) headers['X-CRM-Token'] = cfg.token;
  const res = await fetch(cfg.origin.replace(/\/$/, '') + path, Object.assign({}, opts, { headers }));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
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
  try {
    const j = await runAction({ kind: 'clip', url, title });
    rowCache.at = 0;   // invalidate — the new row (and its auto-enrichment) should show up
    return j.duplicate ? { ok: true, msg: 'Already tracked: ' + j.company + ' — ' + j.role }
                       : { ok: true, msg: 'Added: ' + j.company + ' — ' + j.role + ' (enriching…)' };
  } catch (e) {
    await enqueue({ kind: 'clip', url, title });
    return { ok: false, msg: 'Server unreachable — clip queued, will retry. (' + e.message + ')' };
  }
}

async function markApplied(row) {
  const action = { kind: 'markApplied', key: reqKey(row), applied: row.applied || '', hasNext: !!row.next };
  try {
    await runAction(action);
    rowCache.at = 0;
    return { ok: true, msg: 'Marked Applied (today): ' + row.company + ' — ' + row.role };
  } catch (e) {
    await enqueue(action);
    return { ok: false, msg: 'Server unreachable — status update queued. (' + e.message + ')' };
  }
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

// ---- toolbar click = clip the current tab (works on ANY site via activeTab) ----
chrome.action.onClicked.addListener(async tab => {
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) return;
  const r = await clip(tab.url, tab.title || '');
  chrome.action.setBadgeText({ tabId: tab.id, text: r.ok ? '✓' : '…' });
  chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: r.ok ? '#69c57e' : '#e0a23c' });
  setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }), 4000);
});
