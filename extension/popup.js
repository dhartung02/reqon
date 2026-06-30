// Popup: shows the current tab's tracked status, lets you clip it or mark it applied, and holds
// the server config (origin + passphrase) + notification toggle. All server I/O goes through the
// background service worker (bg.js) — the popup only sends messages.
const $ = (id) => document.getElementById(id);
const DEFAULTS = { origin: 'https://cloud.reqon.app', token: '', notifyEnabled: true, overlayEnabled: true };
const CLOUD_ORIGIN = 'https://cloud.reqon.app';
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, res));

let activeTab = null;
let currentRow = null;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ev = (r) => Math.round(((+r.fit || 0) * (+r.prob || 0) / 10) * 10) / 10;
const isApplied = (s) => /^(Applied|Recruiter Screen|Hiring Manager|Panel|Offer)$/.test(s || '');
const isClosed = (s) => /^(Rejected|Archived)$/.test(s || '');

// Tier → word (the signature change: Strong / Possible / Long shot replaces TIER A/B/C).
const TIER_WORD = { A: 'Strong', B: 'Possible', C: 'Long shot' };
const tierKey = (t) => (t || 'C').toString().toUpperCase();
// Status → shared status role for the data-st color token (theme.css).
function statusKey(s) {
  if (/^(Recruiter Screen|Hiring Manager|Panel|Offer)$/.test(s || '')) return 'interviewing';
  if (/^Applied$/.test(s || '')) return 'applied';
  if (isClosed(s)) return 'rejected';
  return s ? 'ready' : 'saved';
}
// The circular fit dial: score in the tier color + Strong/Possible/Long shot beneath.
function scoreCircle(row) {
  return '<div class="scorewrap"><div class="scorecirc"><span>' + esc(row.fit ?? '—') + '</span></div>' +
    '<span class="scorelbl">' + (TIER_WORD[tierKey(row.tier)] || '') + '</span></div>';
}

function setMsg(text, kind) {
  $('msg').textContent = text || '';
  $('msg').className = kind || '';
}

async function getConfig() {
  return new Promise((r) => chrome.storage.sync.get(DEFAULTS, r));
}

function renderUntracked() {
  $('card').setAttribute('data-tier', '');
  $('card').setAttribute('data-st', 'ready');
  $('card').innerHTML =
    '<div class="role">Not tracked yet</div>' +
    '<div class="company">Clip this page to add it to your board.</div>' +
    '<div class="status" style="display:inline-flex;align-items:center;gap:6px;margin-top:9px;color:var(--emerald)">' +
      '<span style="width:6px;height:6px;border-radius:50%;background:var(--emerald)"></span>Clip it to your board</div>' +
    '<button id="clip" class="btn btn-primary">＋ Clip to my board</button>';
  $('clip').onclick = doClip;
}

function renderTracked(row) {
  const salaryChip = row.salary ? `<span class="chip">${esc(row.salary)}</span>` : '';
  const chips = salaryChip +
    `<span class="chip">prob <b>${esc(row.prob ?? '—')}</b></span>` +
    `<span class="chip ev">EV <b>${ev(row)}</b></span>`;
  const applied = isApplied(row.status);
  const closed = isClosed(row.status);
  $('card').setAttribute('data-tier', tierKey(row.tier).toLowerCase());
  $('card').setAttribute('data-st', statusKey(row.status));
  $('card').innerHTML =
    `<div class="clip-top">${scoreCircle(row)}` +
      `<div style="flex:1;min-width:0">` +
        `<div class="role">${esc(row.role || '—')}</div>` +
        `<div class="company">${esc(row.company || '')}${row.location ? ' · ' + esc(row.location) : ''}</div>` +
        `<div class="metrics">${chips}</div>` +
      `</div></div>` +
    `<div class="status">${esc(row.status || 'Not Applied')}</div>` +
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
    setSettingsView(true);
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
  const isCloud = !cfg.origin || cfg.origin === CLOUD_ORIGIN;
  $('serverPreset').value = isCloud ? 'cloud' : 'personal';
  $('customOriginWrap').style.display = isCloud ? 'none' : '';
  $('origin').value = isCloud ? '' : (cfg.origin || '');
  $('notify').checked = cfg.notifyEnabled !== false;
  $('overlay').checked = cfg.overlayEnabled !== false;
}
$('serverPreset').onchange = () => {
  $('customOriginWrap').style.display = $('serverPreset').value === 'personal' ? '' : 'none';
};
// The gear swaps the clip card for the settings view (and back), matching the redesign.
function setSettingsView(show) {
  $('settings').classList.toggle('open', show);
  const clipEls = [$('card'), $('panel'), $('queue'), document.querySelector('.reassure')];
  clipEls.forEach((e) => { if (e) e.style.display = show ? 'none' : ''; });
}
$('gear').onclick = () => setSettingsView(!$('settings').classList.contains('open'));
$('settingsBack').onclick = () => setSettingsView(false);
// Appearance switch (System / Light / Dark) — quick button by the gear + segmented control in settings.
if (window.reqonThemeWireButton) window.reqonThemeWireButton($('themeBtn'));
if (window.reqonThemeWireSeg) window.reqonThemeWireSeg($('themeSeg'));
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
  const preset = $('serverPreset').value;
  const origin = (preset === 'cloud' ? CLOUD_ORIGIN : ($('origin').value.trim() || CLOUD_ORIGIN)).replace(/\/$/, '');
  const username = $('username').value.trim();
  const password = $('password').value;
  setMsg('Connecting…');
  try {
    const pattern = origin + '/*';
    if (!(await chrome.permissions.contains({ origins: [pattern] }))) {
      await chrome.permissions.request({ origins: [pattern] });
    }
  } catch (e) {}
  try {
    const r = await fetch(origin + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) { setMsg(j.error || 'Login failed.', 'err'); return; }
    await chrome.storage.sync.set({ origin, token: j.token || '', notifyEnabled: $('notify').checked, overlayEnabled: $('overlay').checked });
    $('password').value = '';
    setMsg(j.displayName ? `Connected as ${j.displayName}.` : 'Connected.', 'ok');
    await refresh();
  } catch (e) {
    setMsg('Network error: ' + e.message, 'err');
  }
};
$('test').onclick = async () => {
  setMsg('Testing…');
  const r = await send({ type: 'testConnection' });
  setMsg((r && r.msg) || 'No response.', r && r.ok ? 'ok' : 'err');
};

(async () => { await loadSettings(); await refresh(); })();
