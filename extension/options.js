const $ = id => document.getElementById(id);
const CLOUD_ORIGIN = 'https://cloud.reqon.app';
const DEFAULTS = { origin: CLOUD_ORIGIN, token: '', overlayEnabled: true };
const resolveOrigin = (typeof resolveBoardOrigin === 'function')
  ? resolveBoardOrigin
  : ({ preset, draftOrigin }) => (preset === 'cloud' ? CLOUD_ORIGIN : String(draftOrigin || '').trim().replace(/\/$/, '') || CLOUD_ORIGIN);
const prefsPatch = (typeof buildLocalPrefsPatch === 'function')
  ? buildLocalPrefsPatch
  : ({ overlayEnabled, notifyEnabled }) => {
      const patch = {};
      if (typeof overlayEnabled === 'boolean') patch.overlayEnabled = overlayEnabled;
      if (typeof notifyEnabled === 'boolean') patch.notifyEnabled = notifyEnabled;
      return patch;
    };

chrome.storage.sync.get(DEFAULTS, c => {
  const isCloud = !c.origin || c.origin === CLOUD_ORIGIN;
  $('serverPreset').value = isCloud ? 'cloud' : 'personal';
  $('customOriginWrap').style.display = isCloud ? 'none' : '';
  $('origin').value = isCloud ? '' : c.origin;
  $('overlay').checked = c.overlayEnabled !== false;
});

$('serverPreset').onchange = () => {
  const personal = $('serverPreset').value === 'personal';
  $('customOriginWrap').style.display = personal ? '' : 'none';
};
$('overlay').onchange = () => { chrome.storage.sync.set(prefsPatch({ overlayEnabled: $('overlay').checked })); };

// Appearance: System / Light / Dark (persisted in chrome.storage.sync via theme.js).
if (window.reqonThemeWireSeg) window.reqonThemeWireSeg($('themeSeg'));

// ---- AI usage (full breakdown) — relocated here from the side panel, which now shows just the
// daily-calls bar. Same data via bg.js → /api/assist/usage. ----
const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const urow = (l, v) => `<div class="urow"><span>${escHtml(l)}</span><span class="v">${escHtml(v)}</span></div>`;
async function loadUsage() {
  const el = $('usage');
  if (!el) return;
  const r = await new Promise((res) => chrome.runtime.sendMessage({ type: 'assistUsage' }, res));
  if (!r || r.ok === false) {
    el.innerHTML = (r && r.keySet === false)
      ? '<div class="muted">Add an OpenAI key in the board Settings to enable AI.</div>'
      : '<div class="muted">Usage unavailable — connect your board first, then reopen this page.</div>';
    return;
  }
  if (!r.keySet) { el.innerHTML = '<div class="muted">No OpenAI key set. Add one in the board Settings to enable AI drafts.</div>'; return; }
  const t = r.today || {}, w7 = r.last7d || {}, w30 = r.last30d || {};
  const money = (v) => v == null ? '—' : '$' + v.toFixed(2);
  let html =
    urow('Calls today', `${t.calls || 0}${t.cap ? ' / ' + t.cap : ''}`) +
    urow('Tokens today', (t.tokens || 0).toLocaleString()) +
    urow('Last 7 days', `${(w7.tokens || 0).toLocaleString()} tok` + (w7.estCost != null ? ` · ${money(w7.estCost)}` : '')) +
    urow('Last 30 days', `${(w30.tokens || 0).toLocaleString()} tok` + (w30.estCost != null ? ` · ${money(w30.estCost)}` : '')) +
    urow('Model', escHtml(r.model || '—'));
  if (r.monthlyBudget != null && r.budgetUsedPct != null) {
    const pct = r.budgetUsedPct;
    const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
    html += `<div class="budget"><span class="${cls}" style="width:${Math.min(100, pct)}%"></span></div>` +
      `<div class="tok">${money(w30.estCost)} of ${money(r.monthlyBudget)} monthly budget (${pct}%)</div>`;
  } else if (r.ratePer1M == null) {
    html += '<div class="tok" style="margin-top:6px">Set <code>OPENAI_PRICE_PER_1M</code> (and optionally <code>ASSIST_MONTHLY_BUDGET</code>) in the board to estimate $ cost.</div>';
  }
  html += `<div class="tok" style="margin-top:8px">${escHtml(r.note || '')} <a class="link" id="usageDash" href="#">Open OpenAI usage ↗</a></div>`;
  el.innerHTML = html;
  const d = $('usageDash'); if (d) d.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: r.dashboard || 'https://platform.openai.com/usage' }); };
}
loadUsage();

function ensureExperienceMetaNode() {
  let el = $('experienceMeta');
  if (el) return el;
  const usage = $('usage');
  if (!usage || !usage.parentNode) return null;
  el = document.createElement('div');
  el.id = 'experienceMeta';
  el.className = 'fineprint';
  usage.parentNode.insertBefore(el, usage.nextSibling);
  return el;
}

async function loadExperienceMeta(force) {
  const meta = ensureExperienceMetaNode();
  if (!meta) return;
  const r = await new Promise((res) => chrome.runtime.sendMessage({ type: 'experienceConfig', force: !!force }, res));
  if (!r || r.ok === false) {
    meta.textContent = 'Experience config unavailable until the extension can reach your board.';
    return;
  }
  const updateMode = r.updates && r.updates.mode ? r.updates.mode.replace(/_/g, ' ') : 'managed updates';
  meta.textContent = `Experience config ${r.version} loaded from your Reqon server. Updates use ${updateMode}.`;
}
loadExperienceMeta();

async function ensureHostPermission(origin) {
  try {
    const pattern = origin.replace(/\/$/, '') + '/*';
    const has = await chrome.permissions.contains({ origins: [pattern] });
    if (!has) await chrome.permissions.request({ origins: [pattern] });
  } catch (e) {}
}
async function getConfig() {
  return new Promise((r) => chrome.storage.sync.get(DEFAULTS, r));
}
async function testDraftConnection() {
  const cfg = await getConfig();
  const origin = resolveOrigin({
    preset: $('serverPreset').value,
    draftOrigin: $('origin').value,
    savedOrigin: cfg.origin,
    cloudOrigin: CLOUD_ORIGIN,
  });
  await ensureHostPermission(origin);
  const r = await fetch(origin + '/api/health');
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return { ok: true, msg: 'Connected — ' + j.count + ' rows on the board.' };
}

$('save').onclick = async () => {
  const cfg = await getConfig();
  const origin = resolveOrigin({
    preset: $('serverPreset').value,
    draftOrigin: $('origin').value,
    savedOrigin: cfg.origin,
    cloudOrigin: CLOUD_ORIGIN,
  });
  const username = $('username').value.trim();
  const password = $('password').value;

  $('msg').textContent = 'Connecting…'; $('msg').className = '';

  try {
    await ensureHostPermission(origin);
    const r = await fetch(origin + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) {
      $('msg').textContent = j.error || 'Login failed.'; $('msg').className = 'err'; return;
    }
    await chrome.storage.sync.set({ origin, token: j.token || '', ...prefsPatch({ overlayEnabled: $('overlay').checked }) });
    await loadExperienceMeta(true);
    $('msg').textContent = j.displayName ? `Connected as ${j.displayName}.` : 'Connected.';
    $('msg').className = 'ok';
    $('password').value = '';
  } catch (e) {
    $('msg').textContent = 'Network error: ' + e.message; $('msg').className = 'err';
  }
};

$('test').onclick = () => {
  $('msg').textContent = 'Testing…'; $('msg').className = '';
  testDraftConnection()
    .then(async (r) => {
      await loadExperienceMeta(true);
      $('msg').textContent = r.msg;
      $('msg').className = 'ok';
    })
    .catch((e) => {
      $('msg').textContent = e && e.message ? e.message : 'No response.';
      $('msg').className = 'err';
    });
};
