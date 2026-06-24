// Popup: shows the current tab's tracked status, lets you clip it or mark it applied, and holds
// the server config (origin + passphrase) + notification toggle. All server I/O goes through the
// background service worker (bg.js) — the popup only sends messages.
const $ = (id) => document.getElementById(id);
const DEFAULTS = { origin: 'http://localhost:8787', token: '', notifyEnabled: true, overlayEnabled: true };
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, res));

let activeTab = null;
let currentRow = null;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ev = (r) => Math.round(((+r.fit || 0) * (+r.prob || 0) / 10) * 10) / 10;
const isApplied = (s) => /^(Applied|Recruiter Screen|Hiring Manager|Panel|Offer)$/.test(s || '');
const isClosed = (s) => /^(Rejected|Archived)$/.test(s || '');

function statusClass(s) {
  if (isApplied(s)) return 's-applied';
  if (isClosed(s)) return 's-rejected';
  if (s) return 's-open';
  return 's-none';
}

function setMsg(text, kind) {
  $('msg').textContent = text || '';
  $('msg').className = kind || '';
}

async function getConfig() {
  return new Promise((r) => chrome.storage.sync.get(DEFAULTS, r));
}

function renderUntracked() {
  $('card').innerHTML =
    '<div class="role">Not on your board</div>' +
    '<div class="company muted">Clip this page to add it as a requisition.</div>' +
    '<button id="clip" class="btn btn-primary">+ Clip to board</button>';
  $('clip').onclick = doClip;
}

function renderTracked(row) {
  const tier = row.tier ? 'Tier ' + esc(row.tier) : '';
  const chips =
    (tier ? `<span class="chip">${tier}</span>` : '') +
    `<span class="chip">fit <b>${esc(row.fit ?? '—')}</b></span>` +
    `<span class="chip">prob <b>${esc(row.prob ?? '—')}</b></span>` +
    `<span class="chip">EV <b>${ev(row)}</b></span>`;
  const applied = isApplied(row.status);
  const closed = isClosed(row.status);
  $('card').innerHTML =
    `<div class="role">${esc(row.role || '—')}</div>` +
    `<div class="company">${esc(row.company || '')}</div>` +
    `<div class="metrics">${chips}</div>` +
    `<div class="status ${statusClass(row.status)}">${esc(row.status || 'Not Applied')}</div>` +
    (applied || closed ? '' : '<button id="applied" class="btn btn-primary">✓ Mark applied (today)</button>') +
    '<a id="board" class="link" href="#">View on board ↗</a>';
  const ab = $('applied');
  if (ab) ab.onclick = doMarkApplied;
  $('board').onclick = async (e) => {
    e.preventDefault();
    const cfg = await getConfig();
    if (cfg.origin) chrome.tabs.create({ url: cfg.origin.replace(/\/$/, '') });
  };
}

// ---- offline queue visibility (P1.14) ----
function relTime(ts) {
  if (!ts) return '';
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  return Math.floor(d / 86400) + 'd ago';
}
async function refreshQueue() {
  const q = await send({ type: 'queueStatus' });
  const box = $('queue');
  if (!q || !q.ok || !q.count) { box.classList.remove('open'); return; }
  box.classList.add('open');
  $('qcount').textContent = q.count;
  $('qlist').innerHTML = q.items.map((it) =>
    `<div class="qitem"><span class="qlabel" title="${esc(it.label)}">${esc(it.label)}</span>` +
    `<button class="qx" data-i="${it.i}" title="Discard">✕</button></div>`).join('');
  $('qlist').querySelectorAll('.qx').forEach((b) => { b.onclick = async () => { await send({ type: 'queueDiscard', index: +b.dataset.i }); await refreshQueue(); }; });
  $('qerr').textContent = q.lastError ? 'Last error: ' + q.lastError : '';
  $('qmeta').textContent = q.lastRetry ? 'Last retry ' + relTime(q.lastRetry) : 'Not retried yet';
}
$('qretry').onclick = async () => { $('qretry').disabled = true; $('qretry').textContent = 'Retrying…'; await send({ type: 'queueRetry' }); $('qretry').disabled = false; $('qretry').textContent = 'Retry now'; await refreshQueue(); await refresh(); };
$('qclear').onclick = async () => { await send({ type: 'queueClear' }); await refreshQueue(); };

async function refresh() {
  setMsg('');
  refreshQueue();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    $('card').innerHTML = '<div class="muted">Open a job posting (or any web page) to clip it.</div>';
    return;
  }
  const r = await send({ type: 'lookup', url: tab.url, force: true });
  if (!r || r.ok === false) {
    $('card').innerHTML = '<div class="role">Can’t reach the server</div><div class="company muted">Check the settings below, then Test.</div>';
    setMsg((r && r.msg) || 'Lookup failed.', 'err');
    $('settings').classList.add('open');
    return;
  }
  currentRow = r.row || null;
  if (currentRow) renderTracked(currentRow);
  else renderUntracked();
}

async function doClip() {
  if (!activeTab) return;
  $('clip').disabled = true;
  setMsg('Clipping…');
  const r = await send({ type: 'clip', url: activeTab.url, title: activeTab.title || '' });
  setMsg(r.msg, r.ok ? 'ok' : 'err');
  await refresh();
}

async function doMarkApplied() {
  if (!currentRow) return;
  const b = $('applied');
  if (b) b.disabled = true;
  setMsg('Marking applied…');
  const r = await send({ type: 'markApplied', row: currentRow });
  setMsg(r.msg, r.ok ? 'ok' : 'err');
  await refresh();
}

// ---- settings ----
async function loadSettings() {
  const cfg = await getConfig();
  $('origin').value = cfg.origin || '';
  $('token').value = cfg.token || '';
  $('notify').checked = cfg.notifyEnabled !== false;
  $('overlay').checked = cfg.overlayEnabled !== false;
}
$('gear').onclick = () => $('settings').classList.toggle('open');
$('panel').onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.sidePanel.open({ windowId: tab.windowId });
    window.close();
  } catch (e) {
    setMsg('Sidebar needs Chrome 116+. (' + (e && e.message ? e.message : e) + ')', 'err');
  }
};
$('save').onclick = async () => {
  const origin = ($('origin').value.trim() || DEFAULTS.origin).replace(/\/$/, '');
  // request host permission for a non-localhost origin (tunnel/HTTPS)
  try {
    const pattern = origin + '/*';
    if (!(await chrome.permissions.contains({ origins: [pattern] }))) {
      await chrome.permissions.request({ origins: [pattern] });
    }
  } catch (e) { /* localhost already granted */ }
  await chrome.storage.sync.set({ origin, token: $('token').value.trim(), notifyEnabled: $('notify').checked, overlayEnabled: $('overlay').checked });
  setMsg('Saved.', 'ok');
  await refresh();
};
$('test').onclick = async () => {
  setMsg('Testing…');
  const r = await send({ type: 'testConnection' });
  setMsg((r && r.msg) || 'No response.', r && r.ok ? 'ok' : 'err');
};

(async () => { await loadSettings(); await refresh(); })();
