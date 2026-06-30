/**
 * On-page overlay (FR-EXT-3/4) + apply-assist fill. Shows a compact badge (fit/prob/EV/tier +
 * status if tracked, Clip if not) and a "Fill" button that fills factual fields from your Reqon
 * profile and inserts matching saved answers — on the real ATS page, in your real browser.
 * GUARDRAILS: factual fields + saved answers only; NEVER passwords / EEO / consent; NEVER submits.
 */
(function () {
  if (window.__jpcrmOverlay) return;
  window.__jpcrmOverlay = true;

  const send = msg => new Promise(r => chrome.runtime.sendMessage(msg, r));
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const ev = r => (((+r.fit || 0) * (+r.prob || 0)) / 10).toFixed(1);

  // ---- JD keyword extraction (Phase 2) — the side panel asks the page for its salient terms ----
  const JD_SELECTORS = ['.jobs-description', '.show-more-less-html', '.posting-page', '.section-wrapper',
    '#content .job__description',                          // greenhouse
    '[data-ui="job-description"]', '.styles__content',     // smartrecruiters
    '.job-description', '.description',                    // workable / generic
    '[class*="vacancy" i]', '[class*="posting" i]',        // teamtailor / recruitee
    '[class*="job-description" i]', '[class*="description" i]', 'main', 'article'];
  function jdText() {
    let best = '';
    for (const sel of JD_SELECTORS) {
      document.querySelectorAll(sel).forEach((n) => { const t = (n.innerText || '').trim(); if (t.length > best.length) best = t; });
    }
    if (best.length < 200) best = (document.body && document.body.innerText || '').trim();
    return best.slice(0, 20000);
  }
  // Function words + job-posting boilerplate that carry no résumé-match signal. Frequency ranking
  // alone surfaces these (they're the most common words), which pollutes the keyword coverage and
  // makes the % meaningless — so we drop them before ranking.
  const STOPWORDS = new Set((
    'a an the and or but if then else of to in on at by for with from into onto upon about above below ' +
    'under over across through during before after between among per via within without as is are was were ' +
    'be been being am do does did have has had having will would shall should can could may might must ' +
    'not no nor so than too very just only also more most much many some any all each every both few several ' +
    'other others such own same this that these those here there where when why how what which who whom whose ' +
    'you your yours we our ours us they them their theirs it its he she his her hers i me my mine everyone ' +
    'anyone someone everything anything something etc ie eg ' +
    // posting boilerplate — present in nearly every JD, so non-differentiating
    'role roles job jobs position positions candidate candidates applicant applicants apply application ' +
    'hiring hire company companies looking join opportunity opportunities please ability able including ' +
    'include includes new using use used help make want need years year week weeks day days plus'
  ).split(/\s+/));

  // Tokens belonging to the employer name (og:site_name + the company portion of the page title).
  // The company name is in every JD but says nothing about résumé fit, so we exclude it.
  function companyTokens() {
    const tk = (typeof _tokenize === 'function' ? _tokenize : (s) => (String(s || '').toLowerCase().match(/[a-z0-9+#]+/g) || []));
    const siteName = (document.querySelector('meta[property="og:site_name"]') || {}).content || '';
    const title = document.title || '';
    // company commonly trails a separator: "Role | Company", "Role - Company", "Role at Company"
    const parts = title.split(/\s[|–—\-@·]\s|\s+at\s+|\s+hiring\s+/i);
    const tail = parts.length > 1 ? parts[parts.length - 1] : '';
    return new Set([...tk(siteName), ...tk(tail)]);
  }

  function jdKeywords() {
    const tk = (typeof _tokenize === 'function' ? _tokenize : (s) => (String(s || '').toLowerCase().match(/[a-z0-9+#]+/g) || []));
    const co = companyTokens();
    const freq = new Map();
    for (const t of tk(jdText())) {
      if (t.length < 3) continue;          // drop 1–2 char noise
      if (/^\d+$/.test(t)) continue;       // drop pure numbers
      if (STOPWORDS.has(t)) continue;      // drop function words + boilerplate
      if (co.has(t)) continue;             // drop the employer name
      freq.set(t, (freq.get(t) || 0) + 1);
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]).slice(0, 24);
  }
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    hookFocus();   // once the panel/overlay is in use, track the last-focused field for Insert
    if (msg.type === 'jdKeywords') { try { sendResponse({ ok: true, tokens: jdKeywords() }); } catch (e) { sendResponse({ ok: false }); } return; }
    if (msg.type === 'jdText') { try { sendResponse({ ok: true, text: jdText() }); } catch (e) { sendResponse({ ok: false }); } return; }
    if (msg.type === 'autofill') { fillForm().then((res) => sendResponse(res)).catch((e) => sendResponse({ ok: false, msg: String(e) })); return true; }
    if (msg.type === 'smartFill') { smartFill().then((res) => sendResponse(res)).catch((e) => sendResponse({ ok: false, msg: String(e) })); return true; }
    if (msg.type === 'insertDraft') { try { sendResponse(insertDraft(msg.text)); } catch (e) { sendResponse({ ok: false, msg: String(e) }); } return; }
  });

  // ---- apply-assist fill (mirrors the iOS in-app browser; runs in the real page) ----
  const factualFields = (p) => {
    const a = (p && p.applicant) || {};
    const name = (a.name || '').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    return [
      { keys: ['given-name', 'first name', 'firstname', 'fname', 'first_name'], val: parts[0] || '' },
      { keys: ['family-name', 'last name', 'lastname', 'lname', 'last_name', 'surname'], val: parts.length > 1 ? parts.slice(1).join(' ') : '' },
      { keys: ['full name', 'your name', 'full_name', 'legal name'], val: name },
      { keys: ['email', 'e-mail'], val: a.email || '', type: 'email' },
      { keys: ['phone', 'tel', 'mobile', 'telephone'], val: a.phone || '', type: 'tel' },
      { keys: ['linkedin', 'linked in'], val: a.linkedin || '' },
      { keys: ['github', 'git hub'], val: a.github || '' },
      { keys: ['location', 'city', 'where are you', 'current location'], val: a.location || '' },
      { keys: ['website', 'portfolio', 'personal site', 'personal website'], val: a.website || '' },
    ];
  };
  const fieldSig = (e) => {
    const p = [e.name, e.id, e.placeholder, e.getAttribute('aria-label'), e.getAttribute('autocomplete')];
    try { if (e.labels && e.labels[0]) p.push(e.labels[0].textContent); } catch (x) {}
    return p.filter(Boolean).join(' ').toLowerCase();
  };
  let highlighted = [];   // fields we filled this session — tracked so "Clear highlights" can reset them
  const setVal = (e, v) => {
    const proto = e.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    (d && d.set ? d.set : function (x) { this.value = x; }).call(e, v);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    e.style.outline = '2px solid #00E5A3';
    e.style.outlineOffset = '1px';
    highlighted.push(e);
  };
  function clearHighlights() { highlighted.forEach((e) => { try { e.style.outline = ''; e.style.outlineOffset = ''; } catch (x) {} }); highlighted = []; }
  // Count fields we deliberately leave for the human, so the autofill summary (P1.13) is honest.
  const EEO_CONSENT = /gender|race|ethnic|veteran|disab|hispanic|lgbt|sexual orientation|consent|agree|terms|privacy|authoriz|sponsor|eeo|demographic/i;
  function skipTally() {
    let eeoConsent = 0, file = 0, password = 0;
    document.querySelectorAll('input, textarea').forEach((e) => {
      const t = (e.type || '').toLowerCase();
      if (t === 'file') { file++; return; }
      if (t === 'password') { password++; return; }
      if (EEO_CONSENT.test(fieldSig(e))) eeoConsent++;
    });
    return { eeoConsent, file, password };
  }
  const SKIP_TYPES = ['password', 'file', 'hidden', 'submit', 'button', 'checkbox', 'radio', 'range', 'color'];
  // Fills standard/factual fields from the profile + inserts matching saved answers for simple
  // questions. Returns a result; callers (overlay button or side-panel message) surface the message.
  // NEVER touches passwords/EEO/consent and NEVER submits. Open-ended questions are left for the
  // human (and, later, AI assist).
  async function fillForm() {
    const r = await send({ type: 'profile' });
    if (!r || !r.ok) return { ok: false, factual: 0, answered: 0, msg: 'Could not load profile — check connection.' };
    const p = r.profile || {};
    const fields = factualFields(p);
    const answers = p.answers || [];
    let factual = 0, answered = 0;
    document.querySelectorAll('input, textarea').forEach((e) => {
      const t = (e.type || '').toLowerCase();
      if (SKIP_TYPES.indexOf(t) >= 0) return;
      if (e.value && e.value.trim()) return;
      const s = fieldSig(e);
      for (const f of fields) {
        if (!f.val) continue;
        if ((f.type && t === f.type) || f.keys.some(k => s.indexOf(k) >= 0)) { setVal(e, f.val); factual++; return; }
      }
      const isQuestion = e.tagName === 'TEXTAREA' || /\?|why|describe|tell us|cover|experience|interest|motivat/i.test(s);
      if (isQuestion && answers.length) {
        const a = bestAnswerMatch(s, answers); // from lib.js
        if (a) { setVal(e, a.a); answered++; }
      }
    });
    return {
      ok: factual + answered > 0,
      factual, answered,
      msg: `Filled ${factual} field${factual === 1 ? '' : 's'}` + (answered ? ` + ${answered} answer${answered === 1 ? '' : 's'}` : '') + ' — review, never auto-submitted.',
    };
  }
  const fillBtn = () => { const b = el('button', 'jpcrm-btn', '⚡ Fill form'); b.onclick = async () => { b.disabled = true; b.textContent = 'Filling…'; const res = await fillForm(); b.disabled = false; b.textContent = '⚡ Fill form'; renderFillSummary(res); }; return b; };

  // Autofill summary (P1.13): after a fill, show exactly what changed + what was intentionally left,
  // a review reminder, and a Clear-highlights action. Replaces the old one-line toast.
  function renderFillSummary(res) {
    if (!box) return;
    const old = box.querySelector('.jpcrm-summary'); if (old) old.remove();
    const sk = skipTally();
    const wrap = el('div', 'jpcrm-summary');
    const line = (txt, cls) => { const d = el('div', 'jpcrm-sum-line' + (cls ? ' ' + cls : ''), txt); wrap.appendChild(d); };
    line((res.ok ? '✓ ' : '• ') + 'Filled ' + (res.factual || 0) + ' factual field' + ((res.factual === 1) ? '' : 's'), res.ok ? 'jpcrm-ok' : '');
    if (res.answered) line('✓ Inserted ' + res.answered + ' saved answer' + (res.answered === 1 ? '' : 's'), 'jpcrm-ok');
    if (res.ai) line('✓ ' + res.ai + ' field' + (res.ai === 1 ? '' : 's') + ' via AI map', 'jpcrm-ok');
    if (res.aiError) line('AI fill unavailable: ' + res.aiError, 'jpcrm-warn-line');
    const skips = [];
    if (sk.eeoConsent) skips.push(sk.eeoConsent + ' EEO/consent');
    if (sk.file) skips.push(sk.file + ' file upload');
    if (sk.password) skips.push(sk.password + ' login');
    if (skips.length) line('Skipped (left for you): ' + skips.join(', '));
    line('Review every field — nothing is submitted.', 'jpcrm-dim');
    const acts = el('div', 'jpcrm-clip-acts');
    const clr = el('button', 'jpcrm-btn', 'Clear highlights');
    clr.onclick = () => { clearHighlights(); wrap.remove(); };
    acts.appendChild(clr);
    wrap.appendChild(acts);
    box.appendChild(wrap);
  }

  // ---- AI smart-fill (T1.1): deterministic pass, then ask the server's map_fields tool to fill
  // remaining empty fields it's confident about. Server grounds in factual profile only; we apply
  // only confidence >= 0.6. NEVER passwords/EEO/consent (those are skipped here too); NEVER submits.
  async function smartFill() {
    const base = await fillForm();
    const candidates = [];
    let idx = 0;
    document.querySelectorAll('input, textarea').forEach((e) => {
      const t = (e.type || '').toLowerCase();
      if (SKIP_TYPES.indexOf(t) >= 0) return;
      if (e.value && e.value.trim()) return;             // already filled (incl. deterministic pass)
      if (t === 'email' || t === 'tel') { /* still allow */ }
      e.setAttribute('data-reqon-i', String(idx));
      candidates.push({ i: idx, sig: fieldSig(e), type: t });
      idx++;
    });
    if (!candidates.length) return base;
    const r = await send({ type: 'mapFields', payload: { fields: candidates } });
    if (!r || !r.ok) return Object.assign(base, { aiError: (r && r.error) || 'AI fill unavailable' });
    let ai = 0;
    (r.fields || []).forEach((m) => {
      if (!m || (typeof m.confidence === 'number' && m.confidence < 0.6)) return;
      const e = document.querySelector('[data-reqon-i="' + m.i + '"]');
      if (e && !(e.value && e.value.trim()) && m.value) { setVal(e, String(m.value)); ai++; }
    });
    return Object.assign(base, { ai, ok: (base.factual + base.answered + ai) > 0,
      msg: `Filled ${base.factual} standard` + (base.answered ? ` + ${base.answered} answer` : '') + (ai ? ` + ${ai} AI` : '') + ' field(s) — review, never auto-submitted.' });
  }

  // ---- focus tracking + draft insert (T2.5): remember the last-focused field so an AI draft from
  // the side panel can be dropped into the right textarea. Installed on demand.
  let lastField = null, focusHooked = false;
  function hookFocus() {
    if (focusHooked) return; focusHooked = true;
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) lastField = t;
    }, true);
  }
  function insertDraft(text) {
    const e = lastField;
    if (!e || (e.tagName !== 'TEXTAREA' && e.tagName !== 'INPUT')) return { ok: false, msg: 'Tap a field on the page first, then Insert.' };
    setVal(e, String(text || ''));
    return { ok: true, msg: 'Inserted into the focused field — review it.' };
  }

  // ---- clip-capture metadata (P1.10) — read salient fields off the live page, score confidence ----
  // Count the application form's shape so fillabilityHint() can classify it (P1.11).
  function formStats() {
    let inputs = 0, textareas = 0, hasFile = false, hasPassword = false, fillableNow = 0;
    document.querySelectorAll('input, textarea').forEach((e) => {
      const t = (e.type || '').toLowerCase();
      if (t === 'file') { hasFile = true; return; }
      if (t === 'password') { hasPassword = true; return; }
      if (SKIP_TYPES.indexOf(t) >= 0) return;
      if (e.tagName === 'TEXTAREA') { textareas++; return; }
      inputs++;
      const s = fieldSig(e);
      // a field is "fillable now" if it maps to a factual key we hold
      if (/name|email|phone|tel|linkedin|github|location|city|website|portfolio/.test(s)) fillableNow++;
    });
    return { inputs, textareas, hasFile, hasPassword, fillableNow };
  }
  // Pull company/role/remote/salary/JD-excerpt/ATS off the page. company/role stay best-effort
  // (the server's parseTitle is authoritative); we send what we see so the lead arrives richer.
  function captureMeta() {
    const text = jdText();
    const { source, applyMode } = detectATS(location.href);
    const title = document.title || '';
    const meta = {
      source, applyMode,
      remote: detectRemote(text),
      salary: extractSalary(text),
      jdExcerpt: text.slice(0, 600),
      postingId: postingId(location.href),
      seniority: /\b(principal|director|staff|head of|vp|vice president|lead|group)\b/i.test(title + ' ' + text.slice(0, 400)) ? 'senior' : '',
    };
    const fill = fillabilityHint(applyMode, formStats());
    // The server's parseTitle resolves the employer; if the title is company-structured
    // (" at X", "X hiring", "Role | X") we count company as a positive signal for confidence.
    const hasCompanySignal = /\s(?:at|@|—|–|\||·|-)\s|hiring/i.test(title) || !!document.querySelector('meta[property="og:site_name"]');
    const conf = captureConfidence(Object.assign({ company: hasCompanySignal ? title : '', role: title }, meta));
    return { meta, fill, conf };
  }

  let box;
  // Mirror the extension's appearance switch (chrome.storage.sync "theme"): the overlay can't read
  // storage synchronously at CSS-load, so the content script sets the mode class on the box. dark is
  // the base; jpcrm-light forces light; jpcrm-system follows the OS via overlay.css's media query.
  function applyOverlayTheme(pref) {
    if (!box) return;
    box.classList.remove('jpcrm-system', 'jpcrm-light', 'jpcrm-dark');
    box.classList.add('jpcrm-' + (pref === 'light' || pref === 'dark' ? pref : 'system'));
  }
  function mount() {
    box = el('div', 'jpcrm-box jpcrm-system');
    box.innerHTML = '<div class="jpcrm-row"><span class="jpcrm-logo">Reqon</span><span class="jpcrm-status">checking…</span><button class="jpcrm-x" title="Hide on this page">×</button></div><div class="jpcrm-body"></div>';
    document.documentElement.appendChild(box);
    box.querySelector('.jpcrm-x').onclick = () => { box.remove(); box = null; };
    chrome.storage.sync.get({ theme: 'system' }, (c) => applyOverlayTheme(c && c.theme));
  }

  // Tier → word (the signature change: Strong / Possible / Long shot replaces TIER A/B/C).
  const TIER_WORD = { A: 'Strong', B: 'Possible', C: 'Long shot' };
  function setTier(t) {
    if (!box) return;
    box.classList.remove('jpcrm-tA', 'jpcrm-tB', 'jpcrm-tC');
    box.classList.add('jpcrm-t' + (t || 'C').toUpperCase());
  }
  // The circular fit dial + "Strong match" + fit/prob/EV metrics row.
  function scoreBlock(row) {
    const t = (row.tier || 'C').toUpperCase();
    const blk = el('div', 'jpcrm-score');
    blk.innerHTML =
      '<div class="jpcrm-circle"><span>' + (+row.fit || 0) + '</span></div>' +
      '<div class="jpcrm-score-main">' +
        '<div class="jpcrm-match">' + (TIER_WORD[t] || '') + ' match</div>' +
        '<div class="jpcrm-metrics"><span>fit <b>' + (+row.fit || 0) + '</b></span>' +
        '<span>prob <b>' + (+row.prob || 0) + '</b></span>' +
        '<span class="jpcrm-ev">EV <b>' + ev(row) + '</b></span></div>' +
      '</div>';
    return blk;
  }

  function renderTracked(row) {
    box.querySelector('.jpcrm-status').textContent = row.role || row.company || '';
    const body = box.querySelector('.jpcrm-body'); body.innerHTML = '';
    setTier(row.tier);
    body.appendChild(scoreBlock(row));
    body.appendChild(el('span', 'jpcrm-pill', row.status || 'Not Applied'));
    if (row.status === 'Not Applied' || !row.status) {
      const b = el('button', 'jpcrm-btn', '✓ Mark applied (today)');
      b.onclick = async () => { b.disabled = true; b.textContent = 'Saving…'; const r = await send({ type: 'markApplied', row }); toast(r.msg, r.ok); if (r.ok) { row.status = 'Applied'; renderTracked(row); } else b.disabled = false; };
      body.appendChild(b);
    }
    // Interview prep guide (T1.2): show for rows in an interview stage — open if built, else generate.
    if (['Recruiter Screen', 'Hiring Manager', 'Panel', 'Offer'].includes(row.status)) {
      const g = el('button', 'jpcrm-btn', row.guideAt ? '📋 Interview guide' : '📋 Generate guide');
      g.onclick = async () => {
        const key = reqKey(row);
        const { origin } = await new Promise((r) => chrome.storage.sync.get({ origin: 'http://localhost:8787' }, r));
        const base = (origin || '').replace(/\/$/, '');
        const url = base + '/api/reqs/' + encodeURIComponent(key) + '/guide';
        if (row.guideAt) { window.open(url, '_blank'); return; }
        g.disabled = true; g.textContent = 'Generating…';
        const r2 = await send({ type: 'genGuide', key });
        if (r2 && r2.ok) { row.guideAt = new Date().toISOString(); window.open(url, '_blank'); renderTracked(row); }
        else { toast((r2 && r2.error) || 'Guide failed', false); g.disabled = false; g.textContent = '📋 Generate guide'; }
      };
      body.appendChild(g);
    }
    const { fill } = captureMeta();
    body.appendChild(fillabilityRow(fill));
    if (fill.level !== 'External redirect') { body.appendChild(fillBtn()); body.appendChild(el('div', 'jpcrm-foot', 'Skips passwords & EEO · never submits')); }
  }

  function renderUntracked() {
    box.querySelector('.jpcrm-status').textContent = 'Not tracked yet';
    const body = box.querySelector('.jpcrm-body'); body.innerHTML = '';
    setTier('');
    const { fill } = captureMeta();
    body.appendChild(fillabilityRow(fill));
    const b = el('button', 'jpcrm-btn jpcrm-primary', '＋ Clip to my board');
    b.onclick = () => openClipPanel();
    body.appendChild(b);
    if (fill.level !== 'External redirect') { body.appendChild(fillBtn()); body.appendChild(el('div', 'jpcrm-foot', 'Skips passwords & EEO · never submits')); }
  }

  // Fillability hint line (P1.11): "Likely fillable · 5 fields" + a tooltip of the reasons.
  function fillabilityRow(fill) {
    const cls = { 'Easy Apply': 'jpcrm-fl-ok', 'Likely fillable': 'jpcrm-fl-ok', 'Partially fillable': 'jpcrm-fl-mid',
      'Manual-heavy': 'jpcrm-fl-warn', 'External redirect': 'jpcrm-fl-warn', 'Unknown': 'jpcrm-fl-dim' }[fill.level] || 'jpcrm-fl-dim';
    const row = el('div', 'jpcrm-fill ' + cls);
    row.appendChild(el('span', 'jpcrm-fill-dot'));
    row.appendChild(el('span', null, fill.level));
    if (fill.reasons && fill.reasons.length) row.title = fill.reasons.join('\n');
    return row;
  }

  // Clip confirmation panel (P1.10 + P1.12): shows what was captured, confidence, and optional
  // note/tag/priority before the row is created. Nothing is sent until the user confirms.
  function openClipPanel() {
    const { meta, conf } = captureMeta();
    const body = box.querySelector('.jpcrm-body'); body.innerHTML = '';
    const panel = el('div', 'jpcrm-clip');
    const confCls = { High: 'jpcrm-c-hi', Medium: 'jpcrm-c-mid', Low: 'jpcrm-c-lo' }[conf.level] || 'jpcrm-c-mid';
    panel.innerHTML =
      '<div class="jpcrm-clip-h">' + esc(document.title).slice(0, 80) + '</div>' +
      '<div class="jpcrm-clip-conf ' + confCls + '">Confidence: ' + conf.level + '</div>' +
      (conf.detected.length ? '<div class="jpcrm-clip-meta">Detected: ' + conf.detected.map(esc).join(', ') + '</div>' : '') +
      (conf.needsReview.length ? '<div class="jpcrm-clip-meta jpcrm-clip-warn">Needs review: ' + conf.needsReview.map(esc).join(', ') + '</div>' : '');
    const note = el('input', 'jpcrm-in'); note.placeholder = 'Why save this? (optional note)';
    const tag = el('input', 'jpcrm-in'); tag.placeholder = 'Tag (optional, e.g. dream, backup)';
    const prio = el('select', 'jpcrm-in');
    ['Priority: normal', 'Priority: high', 'Priority: low'].forEach((t, i) => { const o = el('option', null, t); o.value = ['', 'high', 'low'][i]; prio.appendChild(o); });
    panel.appendChild(note); panel.appendChild(tag); panel.appendChild(prio);
    const row = el('div', 'jpcrm-clip-acts');
    const confirm = el('button', 'jpcrm-btn jpcrm-primary', '✓ Clip to my board');
    const cancel = el('button', 'jpcrm-btn', 'Cancel');
    confirm.onclick = async () => {
      confirm.disabled = cancel.disabled = true; confirm.textContent = 'Clipping…';
      const r = await send({ type: 'clip', url: location.href, title: document.title, meta, note: note.value.trim(), tag: tag.value.trim(), priority: prio.value });
      toast(r.msg, r.ok);
      if (r.ok) setTimeout(() => refresh(true), 2500);
      else { confirm.disabled = cancel.disabled = false; confirm.textContent = '✓ Clip to my board'; }
    };
    cancel.onclick = () => renderUntracked();
    row.appendChild(confirm); row.appendChild(cancel);
    panel.appendChild(row);
    body.appendChild(panel);
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function toast(msg, ok) {
    const t = el('div', 'jpcrm-toast' + (ok ? '' : ' jpcrm-warn'), msg);
    box.appendChild(t); setTimeout(() => t.remove(), 4000);
  }

  async function refresh(force) {
    const r = await send({ type: 'lookup', url: location.href, force: !!force });
    if (!box) return;
    if (!r || !r.ok) { box.querySelector('.jpcrm-status').textContent = 'CRM unreachable'; return; }
    r.row ? renderTracked(r.row) : renderUntracked();
  }

  // The overlay is opt-out: respect the user's setting (default on) and react if they toggle it live.
  function start() { if (box) return; mount(); refresh(false); }
  chrome.storage.sync.get({ overlayEnabled: true }, (cfg) => { if (cfg.overlayEnabled !== false) start(); });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'sync') return;
    if (ch.theme && box) applyOverlayTheme(ch.theme.newValue);
    if (!ch.overlayEnabled) return;
    if (ch.overlayEnabled.newValue === false) { if (box) { box.remove(); box = null; } }
    else start();
  });
  // SPA boards (Ashby/LinkedIn) swap postings without a full load — re-check on URL change
  let last = location.href;
  setInterval(() => { if (box && location.href !== last) { last = location.href; refresh(false); } }, 1500);
})();
