// Reqon side panel — board-synced analytics, the current page's record, and resume keyword coverage.
// All server I/O goes through bg.js; JD keywords come from the page's content script.
const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, res));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ev = (r) => Math.round(((+r.fit || 0) * (+r.prob || 0) / 10) * 10) / 10;
const isApplied = (s) => /^(Applied|Recruiter Screen|Hiring Manager|Panel|Offer)$/.test(s || '');
const isClosed = (s) => /^(Rejected|Archived)$/.test(s || '');
const daysAgo = (d) => { const t = Date.parse(d); return isNaN(t) ? Infinity : (Date.now() - t) / 86400000; };

// Tier → word (Strong / Possible / Long shot) + the signature score circle.
const TIER_WORD = { A: 'Strong', B: 'Possible', C: 'Long shot' };
const tierKey = (t) => (t || 'C').toString().toUpperCase();
function statusKey(s) {
  if (/^(Recruiter Screen|Hiring Manager|Panel|Offer)$/.test(s || '')) return 'interviewing';
  if (/^Applied$/.test(s || '')) return 'applied';
  if (isClosed(s)) return 'rejected';
  return s ? 'ready' : 'saved';
}
function scoreCircle(row) {
  return '<div class="scorewrap"><div class="scorecirc"><span>' + esc(row.fit ?? '—') + '</span></div>' +
    '<span class="scorelbl">' + (TIER_WORD[tierKey(row.tier)] || '') + '</span></div>';
}

let activeTab = null;
let currentRow = null;
let ENT = null; // freemium plan + feature gate map from GET /api/entitlements (null until loaded)
// Best-bets filter + expand state (persists across re-renders within a panel session).
let oppFilter = { tier: 'all', remote: false };
let oppsExpanded = false;
let lastRows = [];

// Fail-open: until entitlements load (or if the server is old), treat features as available.
const entHas = (f) => !ENT || !ENT.features || ENT.features[f] !== false;
const entReq = (f) => { const p = ENT && ENT.requires && ENT.requires[f]; return p ? p[0].toUpperCase() + p.slice(1) : 'paid'; };
const bestBetRow = (typeof reqonUiLib !== 'undefined' && reqonUiLib.isBestBetRow)
  ? reqonUiLib.isBestBetRow
  : (r) => r && r.status === 'Not Applied' && r.conf === 'verified' && !['closed', 'lead', 'unknown'].includes(r.reqCheck || '');
const usageView = (typeof reqonUiLib !== 'undefined' && reqonUiLib.buildAiUsageViewModel)
  ? reqonUiLib.buildAiUsageViewModel
  : (r) => ({ unlimited: !(r && r.today && r.today.cap), countText: String((r && r.today && r.today.calls) || 0), helperText: '', pct: 0, tone: '' });
const todayBucketsView = (typeof reqonUiLib !== 'undefined' && reqonUiLib.buildTodayBuckets)
  ? reqonUiLib.buildTodayBuckets
  : (rows) => ({ defaultSection: { id: 'ready-to-apply', title: 'Ready to apply' }, readyToApply: Array.isArray(rows) ? rows.filter(bestBetRow) : [], inProgress: [], needsFollowUp: [] });
const sidepanelMode = (typeof reqonSidepanelMode !== 'undefined' && reqonSidepanelMode)
  ? reqonSidepanelMode
  : { deriveAssistantMode: () => ({ mode: 'today', row: null }), buildTrackedRoleCards: () => [] };

function setMsg(t, k) { $('msg').textContent = t || ''; $('msg').className = k || ''; }
const reqKeyOf = (typeof reqKey === 'function') ? reqKey : (x) => ((x.company || '') + '|' + (x.role || '')).toLowerCase().trim();

async function getOrigin() {
  const { origin } = await new Promise((r) => chrome.storage.sync.get({ origin: 'http://localhost:8787' }, r));
  return (origin || '').replace(/\/$/, '');
}

let pageContext = null;

function pageActionsHTML() {
  return '<button id="fillForm" class="btn btn-ghost">⚡ Fill form</button>' +
    '<button id="aiFill" class="btn btn-ghost">✦ AI-fill rest</button>';
}

function renderTrackedCard(card) {
  return `<article class="assist-mini" data-card="${esc(card.id)}">` +
    `<div class="assist-mini-title">${esc(card.title)}</div>` +
    `<div class="assist-mini-copy">${esc(card.detail || '')}</div>` +
    '</article>';
}

function updateAssistantChrome(mode, tab, row) {
  const root = $('assistantRoot');
  if (root) root.setAttribute('data-mode', mode.mode);
  const pageTitle = $('pageTitle');
  const header = $('assistantHeader');
  const title = mode.mode === 'today'
    ? 'Today'
    : (row ? (row.role || 'Tracked role') : (tab && tab.title ? String(tab.title).slice(0, 80) : 'Job page'));
  const subtitle = mode.mode === 'today'
    ? 'Keep the pipeline moving, then jump into any live posting without reopening the panel.'
    : row
      ? `${row.company || 'Tracked role'} · ${row.status || 'Not Applied'}`
      : 'Recognized application page. Clip it, score it, or continue filling in place.';
  if (pageTitle) pageTitle.textContent = mode.mode === 'today' ? 'Today' : 'This page';
  if (header) {
    header.innerHTML =
      '<div class="assist-kicker">Reqon Assistant</div>' +
      `<div class="assist-title">${esc(title)}</div>` +
      `<div class="assist-subtitle">${esc(subtitle)}</div>`;
  }
}

function renderTrackedJobMode(row) {
  const cards = sidepanelMode.buildTrackedRoleCards(row);
  const chips =
    `<span class="chip">fit <b>${esc(row.fit ?? '—')}</b></span>` +
    `<span class="chip">prob <b>${esc(row.prob ?? '—')}</b></span>` +
    `<span class="chip ev">EV <b>${ev(row)}</b></span>`;
  const interview = INTERVIEW_STATUSES.includes(row.status);
  const canScore = entHas('ai_score');
  const canGuide = entHas('guide_generate');
  const lock = (ok) => (ok ? '' : ' 🔒');
  const guideBtn = interview
    ? (row.guideAt
        ? '<button id="guideOpen" class="btn btn-ghost">📋 Interview guide</button>'
        : `<button id="guideGen" class="btn btn-ghost"${canGuide ? '' : ' data-locked="guide_generate"'}>📋 Generate interview guide${lock(canGuide)}</button>`)
    : '';
  $('page').setAttribute('data-tier', tierKey(row.tier).toLowerCase());
  $('page').setAttribute('data-st', statusKey(row.status));
  $('page').innerHTML =
    `<section class="assist-card">` +
      `<div class="page-top">${scoreCircle(row)}<div style="flex:1;min-width:0">` +
        `<div class="role">${esc(row.role || '—')}</div>` +
        `<div class="company">${esc(row.company || '')}</div></div></div>` +
      `<div class="metrics">${chips}</div>` +
      `<div class="assist-card-grid">${cards.map(renderTrackedCard).join('')}</div>` +
      `<select id="statusSel" class="sel" style="margin-top:12px">` +
        STATUSES.map((s) => `<option ${s === (row.status || 'Not Applied') ? 'selected' : ''}>${s}</option>`).join('') +
      `</select>` +
      `<div class="assist-actions">${pageActionsHTML()}</div>` +
      `<div class="btnrow" style="margin-top:8px">` +
        `<button id="score" class="btn btn-ghost"${canScore ? '' : ' data-locked="ai_score"'}>✦ Score with AI${lock(canScore)}</button>` +
      `</div>` +
      guideBtn +
      '<div id="scoreOut"></div>' +
      trackingEditorHTML(row) +
    '</section>';
  wireFill();
  $('statusSel').onchange = (e) => doSetStatus(e.target.value);
  $('score').onclick = canScore ? doScore : () => setMsg(`AI scoring needs the ${entReq('ai_score')} package.`, 'err');
  if ($('guideOpen')) $('guideOpen').onclick = () => openGuide(row);
  if ($('guideGen')) $('guideGen').onclick = canGuide ? (e) => doGuide(row, e && e.target) : () => setMsg(`Interview guides need the ${entReq('guide_generate')} package.`, 'err');
  wireTrackingEditor(row);
}

function renderJobMode(tab) {
  $('page').removeAttribute('data-tier');
  $('page').removeAttribute('data-st');
  $('page').innerHTML =
    '<section class="assist-card">' +
      '<div class="role">Recognized job page</div>' +
      '<div class="company muted">' + esc((tab && tab.title ? tab.title : '').slice(0, 80)) + '</div>' +
      '<div class="assist-card-grid">' +
        '<article class="assist-mini"><div class="assist-mini-title">Track this role</div><div class="assist-mini-copy">Clip it to the board without leaving the page.</div></article>' +
        '<article class="assist-mini"><div class="assist-mini-title">Start with factual fill</div><div class="assist-mini-copy">Use your saved profile answers before you draft anything custom.</div></article>' +
      '</div>' +
      '<button id="clip" class="btn btn-primary" style="margin-top:12px">+ Clip to board</button>' +
      '<div class="assist-actions">' + pageActionsHTML() + '</div>' +
    '</section>';
  $('clip').onclick = doClip;
  wireFill();
}

function todayRoleHtml(row, meta) {
  const label = meta || `${row.company || 'Unknown company'} · ${ev(row)} EV`;
  return `<article class="assist-mini"${row.link ? ` data-open-link="${esc(row.link)}"` : ''}>` +
    `<div class="assist-mini-title">${esc(row.role || 'Untitled role')}</div>` +
    `<div class="assist-mini-copy">${esc(label)}</div>` +
    '</article>';
}

function renderTodayEntryPoint(id, title, rows, emptyText) {
  const count = rows.length;
  const next = rows[0];
  const nextLabel = next
    ? `${next.company || 'Unknown company'} · ${next.role || 'Untitled role'}`
    : emptyText;
  const actionLabel = next && next.link ? 'Open next role' : 'Open board';
  return `<article class="assist-mini" data-entry-point="${esc(id)}">` +
    `<div class="assist-mini-title">${esc(title)} · ${count}</div>` +
    `<div class="assist-mini-copy">${esc(nextLabel)}</div>` +
    `<button class="btn btn-ghost" style="margin-top:10px" data-entry-action="${esc(id)}"${next && next.link ? ` data-open-link="${esc(next.link)}"` : ''}>${esc(actionLabel)}</button>` +
    '</article>';
}

function renderTodayWorkspace(rows) {
  const buckets = todayBucketsView(rows);
  const readyList = buckets.readyToApply.slice(0, 3);
  const readyHtml = readyList.length
    ? readyList.map((row) => todayRoleHtml(row, `${row.company || 'Unknown company'} · Tier ${tierKey(row.tier)} · EV ${ev(row)}`)).join('')
    : '<div class="assist-mini"><div class="assist-mini-title">Nothing ready yet</div><div class="assist-mini-copy">Verify more live roles or clip new postings to refill this queue.</div></div>';

  return '<section class="assist-card">' +
      '<div class="role">Today workspace</div>' +
      '<div class="company muted">Start with the default queue, then branch into follow-up or in-progress work without mixing those paths together.</div>' +
      '<div class="sect-title" style="margin-top:12px">Ready to apply</div>' +
      '<div class="assist-card-grid" data-today-default="' + esc(buckets.defaultSection.id) + '">' + readyHtml + '</div>' +
      '<div class="sect-title">Other entry points</div>' +
      '<div class="assist-card-grid">' +
        renderTodayEntryPoint('in-progress', 'In progress', buckets.inProgress, 'No active applications need attention yet.') +
        renderTodayEntryPoint('needs-follow-up', 'Needs follow up', buckets.needsFollowUp, 'No follow ups are due right now.') +
      '</div>' +
    '</section>';
}

async function openBoardHome() {
  const o = await getOrigin();
  if (o) chrome.tabs.create({ url: o });
}

function wireTodayWorkspace() {
  const page = $('page');
  if (!page) return;
  page.querySelectorAll('[data-open-link]').forEach((el) => {
    el.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = el.getAttribute('data-open-link');
      if (url) chrome.tabs.create({ url });
    };
  });
  page.querySelectorAll('[data-entry-action]').forEach((el) => {
    if (el.hasAttribute('data-open-link')) return;
    el.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await openBoardHome();
    };
  });
}

function renderTodayMode(rows) {
  const live = (rows || []).filter((r) => r && r.deleted !== true);
  $('page').removeAttribute('data-tier');
  $('page').removeAttribute('data-st');
  $('page').innerHTML = renderTodayWorkspace(live);
  wireTodayWorkspace();
}

async function renderPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    updateAssistantChrome({ mode: 'today' }, tab, null);
    currentRow = null;
    $('page').innerHTML = '<div class="muted">Open a job posting to clip or score it.</div>';
    return;
  }
  const [ctxResponse, lookupResponse] = await Promise.all([
    send({ type: 'pageContext', force: false }),
    send({ type: 'lookup', url: tab.url, force: false }),
  ]);
  if (!lookupResponse || lookupResponse.ok === false) {
    $('page').innerHTML = '<div class="role">Can’t reach the board</div>' +
      '<div class="company muted">Check your server connection.</div>' +
      '<button id="openSettings" class="btn btn-ghost" style="margin-top:8px">Open settings</button>';
    const os = $('openSettings'); if (os) os.onclick = () => { try { chrome.runtime.openOptionsPage(); } catch (_) {} };
    return;
  }
  pageContext = (ctxResponse && ctxResponse.ok !== false) ? ctxResponse : pageContext;
  const mode = sidepanelMode.deriveAssistantMode({
    activeTab: tab,
    pageContext: pageContext && pageContext.url === tab.url
      ? Object.assign({}, pageContext, { row: lookupResponse.row || pageContext.row || null })
      : { recognized: typeof detectATS === 'function' ? detectATS(tab.url).applyMode !== 'Unknown' : false, row: lookupResponse.row || null, url: tab.url },
  });
  currentRow = mode.row || lookupResponse.row || null;
  updateAssistantChrome(mode, tab, currentRow);
  if (mode.mode === 'tracked-job' && currentRow) {
    renderTrackedJobMode(currentRow);
    return;
  }
  if (mode.mode === 'job') {
    currentRow = null;
    renderJobMode(tab);
    return;
  }
  const rowsResponse = await send({ type: 'reqs', force: false });
  renderTodayMode(rowsResponse && rowsResponse.ok !== false && Array.isArray(rowsResponse.rows) ? rowsResponse.rows : lastRows);
}

// Compact tracking-field editor — parity with the web board's expanded-card tracking strip. Edits
// PATCH the row via bg.js (free; no AI). Rejection fields appear only when the row is closed/rejected.
function trackingEditorHTML(row) {
  const v = (k) => esc(row[k] || '');
  const sent = !!row.thankYouSent;
  const closed = isClosed(row.status);
  const fieldRow = (id, label, val, ph) =>
    `<label class="tk-row"><span class="tk-lbl">${label}</span><input id="${id}" class="tk-in" value="${esc(val)}" placeholder="${ph || ''}"></label>`;
  return (
    '<details class="tk" style="margin-top:10px"><summary>Tracking</summary>' +
    '<div class="tk-body">' +
    fieldRow('tkFollowup', 'Follow-up due', v('followup'), 'YYYY-MM-DD') +
    fieldRow('tkInterview', 'Interview date', v('interview'), 'YYYY-MM-DD') +
    fieldRow('tkReferral', 'Referral', v('referral'), '') +
    fieldRow('tkRecruiterEmail', 'Recruiter email', v('recruiterEmail'), '') +
    `<label class="tk-row"><span class="tk-lbl">Thank-you sent</span>` +
      `<input id="tkThankYou" type="checkbox" ${sent ? 'checked' : ''}> <span class="tk-note">${sent ? esc(row.thankYouSent) : 'not sent'}</span></label>` +
    (closed
      ? fieldRow('tkRejStage', 'Rejection stage', v('rejectionStage'), '') +
        fieldRow('tkRejReason', 'Rejection reason', v('rejectionReason'), '') +
        fieldRow('tkRejFeedback', 'Rejection feedback', v('rejectionFeedback'), '')
      : '') +
    '</div></details>'
  );
}
function wireTrackingEditor(row) {
  const save = async (fields) => {
    const r = await send({ type: 'patchFields', row, fields });
    if (r && r.ok) { setMsg('Saved.', 'ok'); setTimeout(refresh, 600); }
    else setMsg((r && r.error) || 'Save failed.', 'err');
  };
  const bindText = (id, key) => { const el = $(id); if (el) el.onchange = () => save({ [key]: el.value.trim() }); };
  bindText('tkFollowup', 'followup');
  bindText('tkInterview', 'interview');
  bindText('tkReferral', 'referral');
  bindText('tkRecruiterEmail', 'recruiterEmail');
  bindText('tkRejStage', 'rejectionStage');
  bindText('tkRejReason', 'rejectionReason');
  bindText('tkRejFeedback', 'rejectionFeedback');
  const ty = $('tkThankYou');
  if (ty) ty.onchange = () => save({ thankYouSent: ty.checked ? new Date().toISOString().slice(0, 10) : '' });
}
const STATUSES = ['Not Applied', 'Applied', 'Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer', 'Rejected', 'Archived'];
const INTERVIEW_STATUSES = ['Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer'];

async function doSetStatus(status) {
  if (!currentRow) return;
  setMsg('Updating status…');
  const r = await send({ type: 'setStatus', row: currentRow, status });
  if (!r || !r.ok) { setMsg((r && r.error) || 'Status update failed.', 'err'); return; }
  setMsg(`Status → ${status}.`, 'ok');
  setTimeout(refresh, 800);   // re-pull so guide button etc. reflect the change
}

async function openGuide(row) {
  const o = await getOrigin();
  if (o) chrome.tabs.create({ url: o + '/api/reqs/' + encodeURIComponent(reqKeyOf(row)) + '/guide' });
}
async function doGuide(row, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  const r = await send({ type: 'genGuide', key: reqKeyOf(row) });
  if (!r || !r.ok) { setMsg((r && r.error) || 'Guide generation failed.', 'err'); if (btn) { btn.disabled = false; btn.textContent = '📋 Generate interview guide'; } return; }
  await openGuide(row);
  setTimeout(refresh, 600);
}

async function doScore() {
  if (!currentRow) return;
  const b = $('score'); if (b) { b.disabled = true; b.textContent = 'Scoring…'; }
  let jd = '';
  try { if (activeTab && activeTab.id != null) { const t = await chrome.tabs.sendMessage(activeTab.id, { type: 'jdText' }); if (t && t.ok) jd = t.text || ''; } } catch (e) { /* not a job page */ }
  const r = await send({ type: 'score', payload: { key: reqKeyOf(currentRow), jd } });
  if (b) { b.disabled = false; b.textContent = '✦ Score with AI'; }
  const out = $('scoreOut');
  if (!r || !r.ok) { if (out) out.innerHTML = `<div class="draft" style="border-color:var(--coral);color:var(--coral)">⚠ ${esc((r && r.error) || 'Scoring failed')}</div>`; return; }
  if (out) {
    out.innerHTML =
      `<div class="draft"><b>AI score</b> — fit ${esc(r.fit)}, prob ${esc(r.prob)}, tier ${esc(r.tier)}<br>${esc(r.rationale || '')}</div>` +
      `<div class="draft-foot"><span class="tok">${esc(r.tokens ? '~' + r.tokens + ' tokens' : '')}</span><button id="applyScore" class="copybtn">Apply to board</button></div>`;
    $('applyScore').onclick = async () => {
      const rr = await send({ type: 'patchFields', row: currentRow, fields: { fit: r.fit, prob: r.prob, tier: r.tier } });
      if (rr && rr.ok) { setMsg('Score applied to board.', 'ok'); setTimeout(refresh, 700); }
      else setMsg((rr && rr.error) || 'Could not apply score.', 'err');
    };
  }
}

// Autofill: deterministic "Fill form" (factual fields + saved answers) and an "AI-fill rest"
// enhancement (map_fields for what's left), matching the on-page overlay. Open-ended questions are
// left for the human; never submits. The AI action spends one request (free on the AI tier).
function wireFill() {
  const ff = $('fillForm'); if (ff) ff.onclick = () => doFill('autofill', ff);
  const af = $('aiFill');
  if (af) {
    if (!(ENT && ENT.plan && ENT.plan.ai)) af.textContent = '✦ AI-fill rest · 1 request';
    af.onclick = () => doFill('aiFillRest', af);
  }
}
async function doFill(kind, btn) {
  if (!activeTab || !/^https?:/.test(activeTab.url || '')) { setMsg('Open a job posting to autofill.', 'err'); return; }
  const label = btn && btn.textContent;
  if (btn) { btn.disabled = true; btn.textContent = kind === 'aiFillRest' ? 'AI filling…' : 'Filling…'; }
  let res = null;
  try { res = await chrome.tabs.sendMessage(activeTab.id, { type: kind }); } catch (e) { res = null; }
  if (btn) { btn.disabled = false; btn.textContent = label; }
  if (!res) setMsg('Autofill works on the open posting on a supported board.', 'err');
  else setMsg(res.msg || (res.ok ? 'Filled — review before submitting.' : 'Nothing to fill here.'), res.ok ? 'ok' : '');
  if (kind === 'aiFillRest') loadUsage();   // an AI request was consumed
}

async function doClip() {
  if (!activeTab) return;
  const b = $('clip'); if (b) { b.disabled = true; b.textContent = 'Clipping…'; }
  // Ask the page for the extracted job (JSON-LD / detail pane) so the clip captures the real role +
  // company, not the tab title — same source the on-page overlay uses.
  let meta;
  try { if (activeTab.id != null) { const c = await chrome.tabs.sendMessage(activeTab.id, { type: 'captureMeta' }); if (c && c.ok) meta = c.meta; } } catch (e) { /* not a job page */ }
  const r = await send({ type: 'clip', url: activeTab.url, title: activeTab.title || '', meta });
  setMsg(r.msg, r.ok ? 'ok' : 'err');
  setTimeout(refresh, r.ok ? 2000 : 0);
}

// ---- keyword coverage (Phase 2) ----
const tokenize = (typeof _tokenize === 'function') ? _tokenize : (s) => (String(s || '').toLowerCase().match(/[a-z0-9+#]+/g) || []);

async function renderCoverage() {
  if (!activeTab || !/^https?:/.test(activeTab.url || '')) { return; }
  let jd = null;
  try { jd = await chrome.tabs.sendMessage(activeTab.id, { type: 'jdKeywords', company: currentRow && currentRow.company }); } catch (e) { jd = null; }
  if (!jd || !jd.ok || !Array.isArray(jd.tokens) || !jd.tokens.length) {
    $('coverage').innerHTML = '<div class="muted">No job description detected on this page.</div>';
    return;
  }
  const pr = await send({ type: 'profile' });
  const kws = (pr && pr.ok && pr.profile && Array.isArray(pr.profile.keywords)) ? pr.profile.keywords : [];
  const resumeSet = new Set();
  kws.forEach((k) => tokenize(k && k.kw).forEach((t) => resumeSet.add(t)));
  if (!resumeSet.size) {
    $('coverage').innerHTML = '<div class="muted">Add a résumé in your profile to score keyword coverage.</div>';
    return;
  }
  const top = jd.tokens.slice(0, 12);
  const covered = top.filter((t) => resumeSet.has(t));
  const missing = top.filter((t) => !resumeSet.has(t));
  const pct = Math.round((covered.length / top.length) * 100);
  const cls = pct >= 70 ? 'good' : pct >= 40 ? 'mid' : 'low';
  $('coverage').innerHTML =
    `<div class="cov-head"><span class="muted">Covers ${covered.length} of ${top.length} JD keywords</span>` +
    `<span class="cov-pct ${cls}">${pct}%</span></div>` +
    `<div class="cov-bar"><span class="${cls === 'good' ? '' : cls}" style="width:${pct}%"></span></div>` +
    '<div>' +
    (covered.length
      ? covered.map((t) => `<span class="kw hit">${esc(t)}</span>`).join('')
      : '<span class="muted" style="font-size:.72rem">None of the top JD keywords match your résumé keywords yet.</span>') +
    '</div>' +
    (missing.length ? '<button id="tailor" class="btn btn-ghost" style="margin-top:10px">✦ Suggest how to strengthen your match</button><div id="tailorOut"></div>' : '') +
    '<div id="covAi" class="covai"></div>';
  wireTailor(missing);
  renderKwAiSlot();
}

function wireTailor(missing) {
  const tb = $('tailor');
  if (!tb) return;
  tb.onclick = async () => {
    tb.disabled = true; tb.textContent = 'Thinking…';
    let jdText = '';
    try { if (activeTab && activeTab.id != null) { const t = await chrome.tabs.sendMessage(activeTab.id, { type: 'jdText' }); if (t && t.ok) jdText = t.text || ''; } } catch (e) { /* ignore */ }
    const payload = { kind: 'tailor', keywords: missing.join(', '), jd: jdText };
    if (currentRow) payload.key = reqKeyOf(currentRow);
    const r = await send({ type: 'assist', payload });
    tb.disabled = false; tb.textContent = '✦ Suggest how to strengthen your match';
    const out = $('tailorOut');
    if (!r || !r.ok) { if (out) out.innerHTML = `<div class="draft" style="border-color:var(--coral);color:var(--coral)">⚠ ${esc((r && r.error) || 'Suggestion failed')}</div>`; return; }
    if (out) { out.innerHTML = '<div class="draft" id="tailorText"></div>'; $('tailorText').textContent = r.draft || ''; }
    loadUsage();
  };
}

// AI keyword/skills match — the paid enhancement over the deterministic coverage above. On the AI
// tier it runs automatically (cached per posting so navigation/refresh never re-spends a request);
// on other tiers it's a one-request button. The server gates the package and counts the request.
const aiKwCache = {};   // activeTab.url -> { score, matched, missing, summary }
function renderKwAiSlot() {
  const slot = $('covAi'); if (!slot) return;
  const url = activeTab && activeTab.url;
  if (url && aiKwCache[url]) { renderKwAi(aiKwCache[url]); return; }
  const aiTier = !!(ENT && ENT.plan && ENT.plan.ai);
  if (aiTier) { runKeywordAI(); return; }
  slot.innerHTML = '<button id="kwAiBtn" class="btn btn-ghost" style="margin-top:10px">✦ Improve match with AI (1 request)</button>';
  const b = $('kwAiBtn'); if (b) b.onclick = () => runKeywordAI();
}
async function runKeywordAI() {
  const slot = $('covAi'); if (!slot) return;
  slot.innerHTML = '<div class="muted" style="margin-top:10px">Analyzing skills with AI…</div>';
  let jdText = '';
  try { if (activeTab && activeTab.id != null) { const t = await chrome.tabs.sendMessage(activeTab.id, { type: 'jdText' }); if (t && t.ok) jdText = t.text || ''; } } catch (e) { /* ignore */ }
  const payload = { jd: jdText };
  if (currentRow) payload.key = reqKeyOf(currentRow);
  const r = await send({ type: 'keywordMatch', payload });
  if (!r || !r.ok) {
    const m = (r && r.error) || 'AI match unavailable';
    const upgrade = /package|upgrade/i.test(m);
    slot.innerHTML = `<div class="muted" style="margin-top:10px">${esc(m)}` + (upgrade ? '' : ' <a class="link" id="kwRetry" href="#">Try again</a>') + '</div>';
    const rt = $('kwRetry'); if (rt) rt.onclick = (e) => { e.preventDefault(); runKeywordAI(); };
    return;
  }
  const res = { score: r.score || 0, matched: r.matched || [], missing: r.missing || [], summary: r.summary || '' };
  if (activeTab && activeTab.url) aiKwCache[activeTab.url] = res;
  renderKwAi(res);
  loadUsage();
}
function renderKwAi(res) {
  const slot = $('covAi'); if (!slot) return;
  const cls = res.score >= 70 ? 'good' : res.score >= 40 ? 'mid' : 'low';
  slot.innerHTML =
    `<div class="cov-head covai-head"><span class="muted">AI skills match</span><span class="cov-pct ${cls}">${res.score}%</span></div>` +
    (res.matched.length ? '<div>' + res.matched.map((t) => `<span class="kw hit">${esc(t)}</span>`).join('') + '</div>' : '') +
    (res.summary ? `<div class="muted" style="margin-top:8px;font-size:.74rem">${esc(res.summary)}</div>` : '');
}

// ---- analytics ----
function renderAnalytics(rows) {
  const live = rows.filter((r) => r.deleted !== true);
  const total = live.length;
  const tier = { A: 0, B: 0, C: 0 };
  let applied = 0, open = 0, closed = 0, evSum = 0;
  live.forEach((r) => {
    const t = (r.tier || 'C').toUpperCase(); if (tier[t] != null) tier[t]++;
    if (isClosed(r.status)) closed++;
    else if (isApplied(r.status)) applied++;
    else open++;
    evSum += ev(r);
  });
  const avgEv = total ? (evSum / total).toFixed(1) : '0.0';
  // "Applied" = total applied/in-process across the board (matches the count you see in the app),
  // not a 7-day window — the old "Applied · 7d" read as a confusing 0 next to a much larger total.
  $('kpis').innerHTML =
    kpi(tier.A, 'Strong', 'accent') +
    kpi(applied, 'Applied', 'teal') +
    kpi(total, 'Tracked') +
    kpi(avgEv, 'Avg EV');

  const tt = tier.A + tier.B + tier.C || 1;
  $('tierbar').innerHTML =
    `<div class="bar"><span class="tA" style="width:${tier.A / tt * 100}%"></span>` +
    `<span class="tB" style="width:${tier.B / tt * 100}%"></span>` +
    `<span class="tC" style="width:${tier.C / tt * 100}%"></span></div>` +
    `<div class="legend"><span><i style="background:var(--emerald)"></i>Strong ${tier.A}</span>` +
    `<span><i style="background:var(--info)"></i>Possible ${tier.B}</span>` +
    `<span><i style="background:var(--muted)"></i>Long shot ${tier.C}</span></div>`;

  lastRows = live;
  renderOpps();
}
const kpi = (v, l, cls) => `<div class="kpi"><div class="kpi-v ${cls || ''}">${v}</div><div class="kpi-l">${l}</div></div>`;

// Best bets — the open (not applied/closed) roles ranked by EV. Filter chips (tier + remote-only)
// narrow the set; the list shows the top few with a "Show N more" expander for the rest, so you can
// work the whole ranked backlog from here instead of just the first six.
const OPP_TOP = 6;
function oppMatches(r) {
  if (isApplied(r.status) || isClosed(r.status)) return false;
  if (!bestBetRow(r)) return false;
  if (oppFilter.tier !== 'all' && tierKey(r.tier) !== oppFilter.tier) return false;
  if (oppFilter.remote && !/remote|flex/i.test(r.remote || '')) return false;
  return true;
}
function renderOpps() {
  const all = lastRows.filter(oppMatches).sort((a, b) => ev(b) - ev(a));
  const chip = (f, label, active) => `<button class="oppchip${active ? ' on' : ''}" data-f="${f}">${esc(label)}</button>`;
  $('oppsFilters').innerHTML =
    chip('tier:all', 'All', oppFilter.tier === 'all') +
    chip('tier:A', 'Strong', oppFilter.tier === 'A') +
    chip('tier:B', 'Possible', oppFilter.tier === 'B') +
    chip('tier:C', 'Long shot', oppFilter.tier === 'C') +
    chip('remote', 'Remote only', oppFilter.remote);
  const shown = oppsExpanded ? all : all.slice(0, OPP_TOP);
  const rowHtml = (r) => `<div class="opp" data-tier="${esc((r.tier || 'C').toLowerCase())}" data-link="${esc(r.link || '')}">` +
    `<span class="tdot"></span>` +
    `<div class="opp-main"><div class="opp-role">${esc(r.role || '—')}</div>` +
    `<div class="opp-co">${esc(r.company || '')}</div></div>` +
    `<span class="opp-ev">${ev(r)}</span></div>`;
  const anyOpen = lastRows.some((r) => !isApplied(r.status) && !isClosed(r.status));
  $('opps').innerHTML = shown.length
    ? shown.map(rowHtml).join('') +
      (all.length > OPP_TOP
        ? `<button class="oppmore" id="oppMore">${oppsExpanded ? 'Show fewer' : 'Show ' + (all.length - OPP_TOP) + ' more'}</button>`
        : '')
    : `<div class="muted">${anyOpen ? 'No open roles match these filters.' : 'Nothing open — clip some roles to build your pipeline.'}</div>`;
  $('opps').querySelectorAll('.opp').forEach((el) => {
    el.onclick = () => { const u = el.getAttribute('data-link'); if (u) chrome.tabs.create({ url: u }); };
  });
  const more = $('oppMore'); if (more) more.onclick = () => { oppsExpanded = !oppsExpanded; renderOpps(); };
  $('oppsFilters').querySelectorAll('.oppchip').forEach((el) => {
    el.onclick = () => {
      const f = el.getAttribute('data-f');
      if (f === 'remote') oppFilter.remote = !oppFilter.remote;
      else if (f.indexOf('tier:') === 0) oppFilter.tier = f.slice(5);
      oppsExpanded = false;   // collapse when the filter changes so the top of the new set shows
      renderOpps();
    };
  });
}

async function renderPipeline() {
  const r = await send({ type: 'reqs', force: false });
  if (!r || r.ok === false || !Array.isArray(r.rows)) {
    $('kpis').innerHTML = ''; $('opps').innerHTML = '<div class="muted">Board unreachable.</div>';
    setMsg((r && r.msg) || 'Could not load pipeline.', 'err');
    return;
  }
  renderAnalytics(r.rows);
}

// ---- AI assist: draft open-ended answers (grounded server-side in your narratives) ----
async function doDraft() {
  const kind = $('aiKind').value;
  const q = $('aiQ').value.trim();
  if (kind !== 'cover' && !q) { setMsg('Paste the question to draft an answer.', 'err'); return; }
  $('aiDraft').disabled = true;
  $('aiOut').innerHTML = '<div class="muted" style="margin-top:10px">Drafting…</div>';
  let jd = '';
  try { if (activeTab && activeTab.id != null) { const t = await chrome.tabs.sendMessage(activeTab.id, { type: 'jdText' }); if (t && t.ok) jd = t.text || ''; } } catch (e) { /* not a job page */ }
  const payload = { kind, question: q, jd };
  if (currentRow) payload.key = reqKeyOf(currentRow);
  let r;
  try { r = await send({ type: 'assist', payload }); } catch (e) { r = { ok: false, error: String(e && e.message || e) }; }
  $('aiDraft').disabled = false;
  if (!r || !r.ok) {
    // Show the failure right here under the button — #msg is far down the panel and easy to miss.
    const err = (r && r.error) || 'Draft failed — no response from the board (is it running and the OpenAI key set?).';
    $('aiOut').innerHTML = `<div class="draft" style="border-color:var(--coral);color:var(--coral)">⚠ ${esc(err)}</div>`;
    return;
  }
  if (!r.draft || !r.draft.trim()) {
    $('aiOut').innerHTML = '<div class="draft" style="border-color:var(--coral);color:var(--coral)">⚠ The model returned an empty draft. Try again or rephrase the question.</div>';
    return;
  }
  renderDraft(r.draft, r.tokens, r.usage);
  loadUsage();
}

function renderDraft(text, tokens, usage) {
  const cap = usage && usage.cap;
  const used = usage && usage.calls;
  const meta = (used != null ? `${used}${cap ? '/' + cap : ''} AI requests today` : '') + (tokens ? ` · ~${tokens} tokens` : '');
  const out = $('aiOut');
  out.innerHTML = `<div class="draft" id="draftText"></div>` +
    `<div class="draft-foot"><span class="tok">${esc(meta)}</span><span><button id="insertDraft" class="copybtn">Insert into page</button> <button id="copyDraft" class="copybtn">Copy</button></span></div>` +
    `<div class="tok" style="margin-top:6px">Review before using — drafted from your narratives, never submitted.</div>`;
  $('draftText').textContent = text;
  $('copyDraft').onclick = async () => { try { await navigator.clipboard.writeText(text); setMsg('Draft copied.', 'ok'); } catch (e) { setMsg('Copy failed — select the text manually.', 'err'); } };
  // Insert into the page's last-focused field (T2.5) — click into the target field first, then this.
  $('insertDraft').onclick = async () => {
    if (!activeTab || activeTab.id == null) { setMsg('No active page to insert into.', 'err'); return; }
    let res = null;
    try { res = await chrome.tabs.sendMessage(activeTab.id, { type: 'insertDraft', text }); } catch (e) { res = null; }
    setMsg(res ? (res.msg || (res.ok ? 'Inserted.' : 'Tap a field on the page first.')) : 'Insert works on a supported job page.', res && res.ok ? 'ok' : 'err');
  };
}

// ---- AI usage — simplified: just today's calls vs the daily cap, as a bar + count. The full
// breakdown (tokens, 7/30-day cost, budget, model) lives in the extension's Settings → Usage. ----
async function loadUsage() {
  const r = await send({ type: 'assistUsage' });
  const el = $('usage');
  if (!r || r.ok === false) {
    el.innerHTML = (r && r.keySet === false)
      ? '<div class="muted">Add an OpenAI key in the board Settings to enable AI.</div>'
      : '<div class="muted">Usage unavailable — is the board reachable?</div>';
    return;
  }
  if (!r.keySet) { el.innerHTML = '<div class="muted">No OpenAI key set. Add one in the board Settings to enable AI drafts.</div>'; return; }
  const vm = usageView(r);
  el.innerHTML =
    `<div class="urow"><span class="muted">AI requests today</span><span class="v">${esc(vm.countText)}</span></div>` +
    (!vm.unlimited ? `<div class="budget"><span class="${vm.tone}" style="width:${vm.pct}%"></span></div>` : '') +
    `<div class="tok" style="margin-top:6px">${esc(vm.helperText)}</div>` +
    `<div class="tok" style="margin-top:8px"><a class="link" id="usageDetails" href="#">Detailed usage →</a></div>`;
  const d = $('usageDetails'); if (d) d.onclick = (e) => { e.preventDefault(); try { chrome.runtime.openOptionsPage(); } catch (_) {} };
}

async function refresh() {
  setMsg('');
  try { const e = await send({ type: 'entitlements' }); ENT = (e && e.ok) ? e : null; } catch (_) { ENT = null; }
  applyDraftGate();
  await renderPage();
  lastPageUrl = activeTab && activeTab.url;   // record the loaded page so only real navigations clear drafts
  await Promise.all([renderCoverage(), renderPipeline(), loadUsage()]);
}

// Re-detect just the current page when the active tab navigates or changes. The pipeline, usage
// and entitlements don't change with the tab, so the full refresh() stays for load / manual reload
// / post-edit. Without this the panel kept rendering the previously-detected page and showed a
// stale "Not on your board" after you opened a different posting (e.g. a Best-bets link) — the only
// way to refresh was reopening the panel. Debounced so a navigation's burst of events runs once.
// AI output is built for one specific job — clear it when the active tab moves to a different
// listing so a draft/score from the previous job never lingers on the new one. (renderPage rebuilds
// #page, clearing #scoreOut; the draft answer + pasted question live in the static #ai section.)
let lastPageUrl = null;
function clearJobDrafts() {
  const out = $('aiOut'); if (out) out.innerHTML = '';
  const q = $('aiQ'); if (q) q.value = '';
  const so = $('scoreOut'); if (so) so.innerHTML = '';
}
let pageNavTimer = null;
function refreshPageSoon() {
  clearTimeout(pageNavTimer);
  pageNavTimer = setTimeout(async () => {
    await renderPage();
    const url = activeTab && activeTab.url;
    if (url && url !== lastPageUrl) { clearJobDrafts(); lastPageUrl = url; }   // new listing → reset AI work
    await Promise.all([renderCoverage(), renderPipeline()]);
  }, 150);
}
chrome.tabs.onActivated.addListener(refreshPageSoon);
chrome.tabs.onUpdated.addListener((tabId, info, tab) => { if (tab && tab.active && (info.url || info.status === 'complete')) refreshPageSoon(); });
try { chrome.windows.onFocusChanged.addListener((wid) => { if (wid !== chrome.windows.WINDOW_ID_NONE) refreshPageSoon(); }); } catch (_) {}
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'pageContextChanged') {
    pageContext = msg.context || null;
    refreshPageSoon();
  }
});

// Gate the open-ended AI draft button on the AI package (it calls /api/assist).
function applyDraftGate() {
  const b = $('aiDraft');
  if (!b) return;
  const ok = entHas('ai_draft');
  b.disabled = false; // keep clickable so the upgrade message can show
  b.style.opacity = ok ? '' : '0.55';
  b.title = ok ? '' : `Requires the ${entReq('ai_draft')} package`;
}

$('aiDraft').onclick = () => {
  if (!entHas('ai_draft')) { setMsg(`AI drafts need the ${entReq('ai_draft')} package. Upgrade in the board settings.`, 'err'); return; }
  doDraft();
};
if (window.reqonThemeWireButton) window.reqonThemeWireButton($('themeBtn'));
$('refresh').onclick = () => { send({ type: 'reqs', force: true }); refresh(); };
$('board').onclick = async (e) => { e.preventDefault(); const o = await getOrigin(); if (o) chrome.tabs.create({ url: o }); };

// Only one Reqon surface at a time: flag the panel open so the on-page overlay hides itself, and
// clear it when the panel closes so the overlay comes back (content.js watches this key).
try {
  chrome.storage.local.set({ _reqonPanelOpen: true });
  window.addEventListener('pagehide', () => { try { chrome.storage.local.set({ _reqonPanelOpen: false }); } catch (_) {} });
} catch (_) {}

refresh();
