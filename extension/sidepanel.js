// Reqon side panel — board-synced analytics, the current page's record, and resume keyword coverage.
// All server I/O goes through bg.js; JD keywords come from the page's content script.
const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, res));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ev = (r) => Math.round(((+r.fit || 0) * (+r.prob || 0) / 10) * 10) / 10;
const isApplied = (s) => /^(Applied|Recruiter Screen|Hiring Manager|Panel|Offer)$/.test(s || '');
const isClosed = (s) => /^(Rejected|Archived)$/.test(s || '');
const statusClass = (s) => isApplied(s) ? 's-applied' : isClosed(s) ? 's-rejected' : s ? 's-open' : 's-none';
const daysAgo = (d) => { const t = Date.parse(d); return isNaN(t) ? Infinity : (Date.now() - t) / 86400000; };

let activeTab = null;
let currentRow = null;
let ENT = null; // freemium plan + feature gate map from GET /api/entitlements (null until loaded)

// Fail-open: until entitlements load (or if the server is old), treat features as available.
const entHas = (f) => !ENT || !ENT.features || ENT.features[f] !== false;
const entReq = (f) => { const p = ENT && ENT.requires && ENT.requires[f]; return p ? p[0].toUpperCase() + p.slice(1) : 'paid'; };

function setMsg(t, k) { $('msg').textContent = t || ''; $('msg').className = k || ''; }
const reqKeyOf = (typeof reqKey === 'function') ? reqKey : (x) => ((x.company || '') + '|' + (x.role || '')).toLowerCase().trim();

async function getOrigin() {
  const { origin } = await new Promise((r) => chrome.storage.sync.get({ origin: 'http://localhost:8787' }, r));
  return (origin || '').replace(/\/$/, '');
}

// ---- this page ----
async function renderPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    $('page').innerHTML = '<div class="muted">Open a job posting to clip or score it.</div>';
    return;
  }
  const r = await send({ type: 'lookup', url: tab.url, force: false });
  if (!r || r.ok === false) { $('page').innerHTML = '<div class="role">Can’t reach the board</div><div class="company muted">Check settings in the popup.</div>'; return; }
  const autofillBtn = '<button id="autofill" class="btn btn-ghost">⚡ Autofill (AI-assisted)</button>';
  const row = r.row;
  currentRow = row || null;
  if (!row) {
    $('page').innerHTML =
      '<div class="role">Not on your board</div>' +
      '<div class="company muted">' + esc((tab.title || '').slice(0, 80)) + '</div>' +
      '<button id="clip" class="btn btn-primary">+ Clip to board</button>' +
      autofillBtn;
    $('clip').onclick = doClip;
    $('autofill').onclick = doAutofill;
    return;
  }
  const chips =
    (row.tier ? `<span class="chip">Tier ${esc(row.tier)}</span>` : '') +
    `<span class="chip">fit <b>${esc(row.fit ?? '—')}</b></span>` +
    `<span class="chip">prob <b>${esc(row.prob ?? '—')}</b></span>` +
    `<span class="chip">EV <b>${ev(row)}</b></span>`;
  const interview = INTERVIEW_STATUSES.includes(row.status);
  const canScore = entHas('ai_score');
  const canGuide = entHas('guide_generate');
  const lock = (ok) => (ok ? '' : ' 🔒');
  const guideBtn = interview
    ? (row.guideAt
        ? '<button id="guideOpen" class="btn btn-ghost">📋 Interview guide</button>'
        : `<button id="guideGen" class="btn btn-ghost"${canGuide ? '' : ' data-locked="guide_generate"'}>📋 Generate interview guide${lock(canGuide)}</button>`)
    : '';
  $('page').innerHTML =
    `<div class="role">${esc(row.role || '—')}</div>` +
    `<div class="company">${esc(row.company || '')}</div>` +
    `<div class="metrics">${chips}</div>` +
    `<select id="statusSel" class="sel" style="margin-top:8px">` +
      STATUSES.map((s) => `<option ${s === (row.status || 'Not Applied') ? 'selected' : ''}>${s}</option>`).join('') +
    `</select>` +
    autofillBtn +
    `<button id="score" class="btn btn-ghost"${canScore ? '' : ' data-locked="ai_score"'}>✨ Score with AI${lock(canScore)}</button>` +
    guideBtn +
    '<div id="scoreOut"></div>' +
    trackingEditorHTML(row);
  $('autofill').onclick = doAutofill;
  $('statusSel').onchange = (e) => doSetStatus(e.target.value);
  $('score').onclick = canScore ? doScore : () => setMsg(`AI scoring needs the ${entReq('ai_score')} package.`, 'err');
  if ($('guideOpen')) $('guideOpen').onclick = () => openGuide(row);
  if ($('guideGen')) $('guideGen').onclick = canGuide ? (e) => doGuide(row, e && e.target) : () => setMsg(`Interview guides need the ${entReq('guide_generate')} package.`, 'err');
  wireTrackingEditor(row);
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
  if (b) { b.disabled = false; b.textContent = '✨ Score with AI'; }
  const out = $('scoreOut');
  if (!r || !r.ok) { if (out) out.innerHTML = `<div class="draft" style="border-color:#54322b;color:#e8a08f">⚠ ${esc((r && r.error) || 'Scoring failed')}</div>`; return; }
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

// Fill standard/factual fields on the open posting via its content script. Open-ended questions are
// left for the human (AI assist is a future phase). Never submits.
async function doAutofill() {
  const b = $('autofill');
  if (!activeTab || !/^https?:/.test(activeTab.url || '')) { setMsg('Open a job posting to autofill.', 'err'); return; }
  if (b) { b.disabled = true; b.textContent = 'Filling…'; }
  let res = null;
  // smartFill = deterministic factual/answer pass + an AI map_fields pass for what's left (T1.1).
  try { res = await chrome.tabs.sendMessage(activeTab.id, { type: 'smartFill' }); } catch (e) { res = null; }
  if (b) { b.disabled = false; b.textContent = '⚡ Autofill (AI-assisted)'; }
  if (!res) setMsg('Autofill works on the open posting on a supported board.', 'err');
  else setMsg(res.msg || (res.ok ? 'Filled — review before submitting.' : 'Nothing to fill here.') + (res.aiError ? ' (AI pass: ' + res.aiError + ')' : ''), res.ok ? 'ok' : '');
}

async function doClip() {
  if (!activeTab) return;
  const b = $('clip'); if (b) { b.disabled = true; b.textContent = 'Clipping…'; }
  const r = await send({ type: 'clip', url: activeTab.url, title: activeTab.title || '' });
  setMsg(r.msg, r.ok ? 'ok' : 'err');
  setTimeout(refresh, r.ok ? 2000 : 0);
}

// ---- keyword coverage (Phase 2) ----
const tokenize = (typeof _tokenize === 'function') ? _tokenize : (s) => (String(s || '').toLowerCase().match(/[a-z0-9+#]+/g) || []);

async function renderCoverage() {
  if (!activeTab || !/^https?:/.test(activeTab.url || '')) { return; }
  let jd = null;
  try { jd = await chrome.tabs.sendMessage(activeTab.id, { type: 'jdKeywords' }); } catch (e) { jd = null; }
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
    `<div class="cov-head"><span class="muted">Résumé covers ${covered.length} of ${top.length} JD keywords</span>` +
    `<span class="cov-pct ${cls}">${pct}%</span></div>` +
    '<div style="margin-top:7px">' +
    covered.map((t) => `<span class="kw">${esc(t)}</span>`).join('') +
    missing.map((t) => `<span class="kw miss">${esc(t)}</span>`).join('') +
    '</div>' +
    (missing.length ? '<div class="muted" style="margin-top:8px;font-size:.72rem">Red = in the posting, not in your résumé keywords.</div>' : '') +
    (missing.length ? '<button id="tailor" class="btn btn-ghost" style="margin-top:8px">✨ Suggest how to close the gaps</button><div id="tailorOut"></div>' : '');
  const tb = $('tailor');
  if (tb) tb.onclick = async () => {
    tb.disabled = true; tb.textContent = 'Thinking…';
    let jdText = '';
    try { if (activeTab && activeTab.id != null) { const t = await chrome.tabs.sendMessage(activeTab.id, { type: 'jdText' }); if (t && t.ok) jdText = t.text || ''; } } catch (e) { /* ignore */ }
    const payload = { kind: 'tailor', keywords: missing.join(', '), jd: jdText };
    if (currentRow) payload.key = reqKeyOf(currentRow);
    const r = await send({ type: 'assist', payload });
    tb.disabled = false; tb.textContent = '✨ Suggest how to close the gaps';
    const out = $('tailorOut');
    if (!r || !r.ok) { if (out) out.innerHTML = `<div class="draft" style="border-color:#54322b;color:#e8a08f">⚠ ${esc((r && r.error) || 'Suggestion failed')}</div>`; return; }
    if (out) { out.innerHTML = '<div class="draft" id="tailorText"></div>'; $('tailorText').textContent = r.draft || ''; }
    loadUsage();
  };
}

// ---- analytics ----
function renderAnalytics(rows) {
  const live = rows.filter((r) => r.deleted !== true);
  const total = live.length;
  const tier = { A: 0, B: 0, C: 0 };
  let applied = 0, open = 0, closed = 0, appliedWk = 0, evSum = 0;
  live.forEach((r) => {
    const t = (r.tier || 'C').toUpperCase(); if (tier[t] != null) tier[t]++;
    if (isClosed(r.status)) closed++;
    else if (isApplied(r.status)) { applied++; if (daysAgo(r.applied) <= 7) appliedWk++; }
    else open++;
    evSum += ev(r);
  });
  const avgEv = total ? (evSum / total).toFixed(1) : '0.0';
  $('kpis').innerHTML =
    kpi(total, 'Roles tracked') +
    kpi(open, 'Open / not applied', 'accent') +
    kpi(applied, 'Applied / in process', 'violet') +
    kpi(appliedWk, 'Applied this week', 'lime');

  const tt = tier.A + tier.B + tier.C || 1;
  $('tierbar').innerHTML =
    `<div class="bar"><span class="tA" style="width:${tier.A / tt * 100}%"></span>` +
    `<span class="tB" style="width:${tier.B / tt * 100}%"></span>` +
    `<span class="tC" style="width:${tier.C / tt * 100}%"></span></div>` +
    `<div class="legend"><span><i style="background:#00df8f"></i>A ${tier.A}</span>` +
    `<span><i style="background:#79a6e0"></i>B ${tier.B}</span>` +
    `<span><i style="background:#5a6470"></i>C ${tier.C}</span>` +
    `<span style="margin-left:auto">avg EV ${avgEv}</span></div>`;

  const opps = live
    .filter((r) => !isApplied(r.status) && !isClosed(r.status))
    .sort((a, b) => ev(b) - ev(a))
    .slice(0, 6);
  $('opps').innerHTML = opps.length
    ? opps.map((r) => `<div class="opp" data-link="${esc(r.link || '')}">` +
        `<span class="tdot ${esc((r.tier || 'C').toUpperCase())}"></span>` +
        `<div class="opp-main"><div class="opp-role">${esc(r.role || '—')}</div>` +
        `<div class="opp-co">${esc(r.company || '')}</div></div>` +
        `<span class="opp-ev">${ev(r)}</span></div>`).join('')
    : '<div class="muted">Nothing open — clip some roles to build your pipeline.</div>';
  $('opps').querySelectorAll('.opp').forEach((el) => {
    el.onclick = () => { const u = el.getAttribute('data-link'); if (u) chrome.tabs.create({ url: u }); };
  });
}
const kpi = (v, l, cls) => `<div class="kpi"><div class="kpi-v ${cls || ''}">${v}</div><div class="kpi-l">${l}</div></div>`;

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
    $('aiOut').innerHTML = `<div class="draft" style="border-color:#54322b;color:#e8a08f">⚠ ${esc(err)}</div>`;
    return;
  }
  if (!r.draft || !r.draft.trim()) {
    $('aiOut').innerHTML = '<div class="draft" style="border-color:#54322b;color:#e8a08f">⚠ The model returned an empty draft. Try again or rephrase the question.</div>';
    return;
  }
  renderDraft(r.draft, r.tokens, r.usage);
  loadUsage();
}

function renderDraft(text, tokens, usage) {
  const cap = usage && usage.cap;
  const used = usage && usage.calls;
  const meta = (used != null ? `${used}${cap ? '/' + cap : ''} calls today` : '') + (tokens ? ` · ~${tokens} tokens` : '');
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

// ---- AI usage / consumption monitor ----
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
  const t = r.today || {}, w7 = r.last7d || {}, w30 = r.last30d || {};
  const money = (v) => v == null ? '—' : '$' + v.toFixed(2);
  let html =
    urow('Today', `${t.calls || 0}${t.cap ? ' / ' + t.cap : ''} calls`) +
    urow('Tokens today', (t.tokens || 0).toLocaleString()) +
    urow('Last 7 days', `${(w7.tokens || 0).toLocaleString()} tok` + (w7.estCost != null ? ` · ${money(w7.estCost)}` : '')) +
    urow('Last 30 days', `${(w30.tokens || 0).toLocaleString()} tok` + (w30.estCost != null ? ` · ${money(w30.estCost)}` : '')) +
    urow('Model', esc(r.model || '—'));
  if (r.monthlyBudget != null && r.budgetUsedPct != null) {
    const pct = r.budgetUsedPct;
    const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
    html += `<div class="budget"><span class="${cls}" style="width:${Math.min(100, pct)}%"></span></div>` +
      `<div class="tok">${money(w30.estCost)} of ${money(r.monthlyBudget)} monthly budget (${pct}%)</div>`;
  } else if (r.ratePer1M == null) {
    html += '<div class="tok" style="margin-top:6px">Set <code>OPENAI_PRICE_PER_1M</code> (and optionally <code>ASSIST_MONTHLY_BUDGET</code>) in the board to estimate $ cost.</div>';
  }
  html += `<div class="tok" style="margin-top:8px">${esc(r.note || '')} <a class="link" id="usageDash" href="#">Open OpenAI usage ↗</a></div>`;
  el.innerHTML = html;
  const d = $('usageDash'); if (d) d.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: r.dashboard || 'https://platform.openai.com/usage' }); };
}
const urow = (l, v) => `<div class="urow"><span class="muted">${esc(l)}</span><span class="v">${esc(v)}</span></div>`;

async function refresh() {
  setMsg('');
  try { const e = await send({ type: 'entitlements' }); ENT = (e && e.ok) ? e : null; } catch (_) { ENT = null; }
  applyDraftGate();
  await renderPage();
  await Promise.all([renderCoverage(), renderPipeline(), loadUsage()]);
}

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
$('refresh').onclick = () => { send({ type: 'reqs', force: true }); refresh(); };
$('board').onclick = async (e) => { e.preventDefault(); const o = await getOrigin(); if (o) chrome.tabs.create({ url: o }); };

refresh();
