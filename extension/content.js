/**
 * On-page overlay (FR-EXT-3/4) + apply-assist fill. Shows a floating banner for tracked/untracked
 * job pages and a "Fill" action that fills factual fields from your Reqon
 * profile, inserts matching saved answers, and attaches the résumé you uploaded in Settings to
 * résumé upload fields — on the real ATS page, in your real browser.
 * GUARDRAILS: factual fields + saved answers + résumé attach only; NEVER passwords / EEO / consent;
 * NEVER submits (the résumé is attached for you to review, never sent).
 */
(function () {
  const reqonUiLib = (typeof module !== 'undefined' && module.exports)
    ? require('./ui-lib.js')
    : globalThis.reqonUiLib;
  const FILLABLE_LEVELS = new Set(['Easy Apply', 'Likely fillable', 'Partially fillable']);

  function isRecognizedJobPage(job) {
    return !!(job && (job.role || job.company));
  }

  function isBannerFillable(fill) {
    return !!(fill && FILLABLE_LEVELS.has(fill.level));
  }

  function summarizeBannerFillResult(res) {
    const factual = Number(res && res.factual) || 0;
    const answered = Number(res && res.answered) || 0;
    const resume = Number(res && res.resume) || 0;
    const ai = Number(res && res.ai) || 0;
    const direct = Number(res && res.direct) || (factual + answered + resume);
    const total = Number(res && res.total) || (direct + ai + (Number(res && res.remaining) || 0));
    const remaining = res && res.remaining != null
      ? Number(res.remaining) || 0
      : Math.max(0, total - direct - ai);
    return reqonUiLib.summarizeFillAvailability({ total, direct, ai, remaining }).replace(` of ${total}`, '');
  }

  function deriveBannerState({ row, job, fill, fit }) {
    const recognized = isRecognizedJobPage(job);
    const fillable = isBannerFillable(fill);
    const model = reqonUiLib.buildBannerModel({
      row: row || null,
      pageState: {
        recognized,
        fillable,
        fit: row && row.fit != null ? row.fit : fit,
      },
    });
    return { recognized, fillable, model };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      deriveBannerState,
      summarizeBannerFillResult,
      isBannerFillable,
      isRecognizedJobPage,
    };
    return;
  }

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
    'include includes new using use used help make want need years year week weeks day days plus ' +
    // EEO / legal / benefits boilerplate — in most JDs, never a résumé-fit signal (this is the junk
    // that showed up as "veteran / disability / status": legal language, not skills).
    'equal opportunity employer regardless race color religion religious creed sex gender genders ' +
    'sexual orientation identity national origin ancestry age marital pregnancy disability disabilities ' +
    'disabled veteran veterans status citizenship immigration sponsorship sponsor authorized authorization ' +
    'eligible eligibility accommodation accommodations reasonable protected affirmative diversity inclusion ' +
    'belonging compensation salary benefits benefit insurance dental vision medical healthcare retirement ' +
    'bonus equity stipend perks wellness pto background check drug screening ' +
    // generic HR / posting-process words that carry no skill signal on their own
    'qualifications qualification requirements requirement responsibilities responsibility duties preferred ' +
    'required must based located location remote hybrid onsite office select selected work working team teams ' +
    'experience skills strong excellent great good ideal successful responsible'
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

  function jdKeywords(company) {
    const tk = (typeof _tokenize === 'function' ? _tokenize : (s) => (String(s || '').toLowerCase().match(/[a-z0-9+#]+/g) || []));
    const co = companyTokens();
    tk(company).forEach((t) => co.add(t));   // the tracked employer name from the board (drops e.g. "smartsheet")
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
    if (msg.type === 'jdKeywords') { try { sendResponse({ ok: true, tokens: jdKeywords(msg.company) }); } catch (e) { sendResponse({ ok: false }); } return; }
    if (msg.type === 'jdText') { try { sendResponse({ ok: true, text: jdText() }); } catch (e) { sendResponse({ ok: false }); } return; }
    if (msg.type === 'captureMeta') { try { const c = captureMeta(); sendResponse({ ok: true, meta: c.meta, job: c.job }); } catch (e) { sendResponse({ ok: false }); } return; }
    if (msg.type === 'autofill') { fillForm().then((res) => sendResponse(res)).catch((e) => sendResponse({ ok: false, msg: String(e) })); return true; }
    if (msg.type === 'smartFill') { smartFill().then((res) => sendResponse(res)).catch((e) => sendResponse({ ok: false, msg: String(e) })); return true; }
    if (msg.type === 'aiFillRest') { aiFillRest().then((res) => sendResponse(res)).catch((e) => sendResponse({ ok: false, msg: String(e) })); return true; }
    if (msg.type === 'insertDraft') { try { sendResponse(insertDraft(msg.text)); } catch (e) { sendResponse({ ok: false, msg: String(e) }); } return; }
  });

  // ---- apply-assist fill (mirrors the iOS in-app browser; runs in the real page) ----
  const factualFields = (p) => {
    const a = (p && p.applicant) || {};
    const name = (a.name || '').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    // keys are matched as WHOLE WORDS (see matchFactual), so "tel" no longer hits "Tell us…" and a
    // bare "Name" field is caught without a "Company name" field grabbing the person's name. `neg`
    // vetoes a match when a disqualifying token is present. Order matters: first/last before full.
    return [
      { keys: ['first name', 'given name', 'firstname', 'fname'], val: parts[0] || '' },
      { keys: ['last name', 'family name', 'lastname', 'lname', 'surname'], val: parts.length > 1 ? parts.slice(1).join(' ') : '' },
      { keys: ['full name', 'your name', 'legal name', 'name'], neg: /company|organi[sz]ation|business|employer|file|user|nick|middle|maiden|pronoun|preferred/, val: name },
      { keys: ['email'], type: 'email', val: a.email || '' },
      { keys: ['phone', 'mobile', 'telephone', 'tel'], type: 'tel', val: a.phone || '' },
      { keys: ['linkedin'], val: a.linkedin || '' },
      { keys: ['github'], val: a.github || '' },
      { keys: ['website', 'portfolio', 'personal site', 'personal website'], val: a.website || '' },
      { keys: ['location', 'city', 'current location', 'where are you based'], neg: /relocat|preferred|company|country|nationality|citizen|passport/, val: a.location || '' },
    ];
  };
  // Whole-word key matching: ALL of a key's words must appear as word-bounded tokens in the field's
  // signature. Stops substring false-positives (the "tel" in "Tell us…", "name" in "username", etc).
  const hasWord = (s, w) => new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(s);
  const keyHit = (s, key) => key.split(/[\s_-]+/).every((w) => w && hasWord(s, w));
  function matchFactual(sig, type, fields) {
    for (const f of fields) {
      if (!f.val) continue;
      if (f.type && type === f.type) return f;          // input type is the strongest signal
      if (f.neg && f.neg.test(sig)) continue;           // a disqualifying token vetoes this field
      if (f.keys.some((k) => keyHit(sig, k))) return f;
    }
    return null;
  }
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
      const isTextarea = e.tagName === 'TEXTAREA';
      // Factual identity fields are short inputs, never a free-text box — so a phone can't land in a
      // "Tell us about your experience" textarea just because its label contains "tel".
      if (!isTextarea) {
        const f = matchFactual(s, t, fields);
        if (f) { setVal(e, f.val); factual++; return; }
      }
      const isQuestion = isTextarea || /\?|why|describe|tell us|cover letter|motivat|interest/i.test(s);
      if (isQuestion && answers.length) {
        const a = bestAnswerMatch(s, answers); // from lib.js
        if (a) { setVal(e, a.a); answered++; }
      }
    });
    const rez = await attachResume();   // inject the stored résumé into any résumé upload field
    return {
      ok: factual + answered + (rez.attached || 0) > 0,
      factual, answered, resume: rez.attached || 0, resumeMissing: !!rez.noResume,
      msg: `Filled ${factual} field${factual === 1 ? '' : 's'}` + (answered ? ` + ${answered} answer${answered === 1 ? '' : 's'}` : '')
        + (rez.attached ? ` + résumé attached` : '') + ' — review, never auto-submitted.',
    };
  }

  // ── Résumé upload injection (like Simplify) ──────────────────────────────────────────────────
  // Browsers block setting a file input's value via JS; the one supported path is building a File
  // and assigning it through a DataTransfer. We fetch the résumé the user already uploaded in
  // Settings (served base64 by the server) and inject it into detected résumé upload fields. Works
  // on standard <input type=file> (Greenhouse/Lever/Ashby/Glassdoor Easy Apply); custom drag-drop
  // widgets and account-gated portals (Workday/iCIMS) can't be populated this way. NEVER submits.
  let _resumeCache = null;   // { name, mime, bytes } cached per page session
  async function fetchResume() {
    if (_resumeCache !== null) return _resumeCache || null;
    let r; try { r = await send({ type: 'resumeFile' }); } catch (e) { r = null; }
    if (!r || !r.ok || !r.exists || !r.dataBase64) { _resumeCache = false; return null; }
    try {
      const bin = atob(r.dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      _resumeCache = { name: r.name || 'resume', mime: r.mime || 'application/octet-stream', bytes };
      return _resumeCache;
    } catch (e) { _resumeCache = false; return null; }
  }
  function resumeInputs() {
    const out = [];
    document.querySelectorAll('input[type="file"]').forEach((e) => {
      const sig = fieldSig(e);
      const accept = (e.getAttribute('accept') || '').toLowerCase();
      if (/cover|portfolio|photo|image|headshot|transcript|logo|avatar/i.test(sig)) return;   // not the résumé slot
      const resumeSig = /resume|résumé|\bcv\b|curriculum/i.test(sig);
      const docAccept = /pdf|word|document|msword|officedocument|\.docx?/.test(accept) && !accept.includes('image');
      if (resumeSig || docAccept) out.push(e);
    });
    return out;
  }
  async function attachResume() {
    let inputs;
    try { inputs = resumeInputs().filter((e) => !(e.files && e.files.length)); } catch (e) { return { attached: 0 }; }
    if (!inputs.length) return { attached: 0 };
    const rz = await fetchResume();
    if (!rz) return { attached: 0, noResume: true };
    let attached = 0;
    for (const e of inputs) {
      try {
        const dt = new DataTransfer();
        dt.items.add(new File([rz.bytes], rz.name, { type: rz.mime }));
        e.files = dt.files;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
        e.style.outline = '2px solid #00E5A3'; e.style.outlineOffset = '1px'; highlighted.push(e);
        attached++;
      } catch (err) { /* this input blocks programmatic files (custom widget) — leave it for the human */ }
    }
    return { attached };
  }
  const fillBtn = () => { const b = el('button', 'jpcrm-btn jpcrm-primary', 'Start guided fill'); b.onclick = async () => { b.disabled = true; b.textContent = 'Filling…'; const res = await fillForm(); b.disabled = false; b.textContent = 'Start guided fill'; renderFillSummary(res); }; return b; };
  // The consistent autofill pair (mirrors the side panel): deterministic "Fill form" first, then an
  // "AI-fill rest" enhancement that spends one AI request (free on the AI tier — label reflects it).
  function fillRow() {
    const row = el('div', 'jpcrm-clip-acts');
    const fb = fillBtn();
    const ab = el('button', 'jpcrm-btn', '✦ AI-fill rest');
    send({ type: 'entitlements' }).then((e) => { if (!(e && e.ok && e.plan && e.plan.ai)) ab.textContent = '✦ AI-fill rest · 1 request'; }).catch(() => {});
    ab.onclick = async () => {
      ab.disabled = true; ab.textContent = 'AI filling…';
      const res = await aiFillRest();
      ab.disabled = false; ab.textContent = '✦ AI-fill rest';
      send({ type: 'entitlements' }).then((e) => { if (!(e && e.ok && e.plan && e.plan.ai)) ab.textContent = '✦ AI-fill rest · 1 request'; }).catch(() => {});
      renderFillSummary(res);
      toast(res.msg || (res.ok ? 'AI filled fields — review.' : 'Nothing to add.'), res.ok);
    };
    row.appendChild(fb); row.appendChild(ab);
    return row;
  }

  // Autofill summary (P1.13): after a fill, show exactly what changed + what was intentionally left,
  // a review reminder, and a Clear-highlights action. Replaces the old one-line toast.
  function renderFillSummary(res) {
    if (!box) return;
    const old = box.querySelector('.jpcrm-summary'); if (old) old.remove();
    const msg = box.querySelector('.jpcrm-banner-message');
    const sk = skipTally();
    const wrap = el('div', 'jpcrm-summary');
    const line = (txt, cls) => { const d = el('div', 'jpcrm-sum-line' + (cls ? ' ' + cls : ''), txt); wrap.appendChild(d); };
    if (msg) msg.textContent = summarizeBannerFillResult(res);
    line((res.ok ? '✓ ' : '• ') + 'Filled ' + (res.factual || 0) + ' factual field' + ((res.factual === 1) ? '' : 's'), res.ok ? 'jpcrm-ok' : '');
    if (res.answered) line('✓ Inserted ' + res.answered + ' saved answer' + (res.answered === 1 ? '' : 's'), 'jpcrm-ok');
    if (res.ai) line('✓ ' + res.ai + ' field' + (res.ai === 1 ? '' : 's') + ' via AI map', 'jpcrm-ok');
    if (res.aiError) line('AI fill unavailable: ' + res.aiError, 'jpcrm-warn-line');
    if (res.resume) line('✓ Attached your résumé to ' + res.resume + ' upload field' + (res.resume === 1 ? '' : 's') + ' — confirm it before submitting', 'jpcrm-ok');
    else if (res.resumeMissing) line('Résumé upload found — add a résumé in Settings to auto-attach it', 'jpcrm-warn-line');
    const skips = [];
    if (sk.eeoConsent) skips.push(sk.eeoConsent + ' EEO/consent');
    // File uploads still left for the human — minus the résumé slot(s) we just attached.
    const filesLeft = Math.max(0, (sk.file || 0) - (res.resume || 0));
    if (filesLeft) skips.push(filesLeft + ' other file upload' + (filesLeft === 1 ? '' : 's'));
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

  // ---- AI enhancement (T1.1): ask the server's map_fields tool to fill the fields still empty after
  // the deterministic pass, applying only confidence >= 0.6. This is the "AI-fill the rest" action —
  // offered as an enhancement on BOTH the overlay and the side panel, consistent with the keyword
  // match: it spends one AI request (server-gated), free on the AI tier. NEVER passwords/EEO/consent
  // (skipped here too); NEVER submits.
  async function aiFillRest() {
    const candidates = [];
    let idx = 0;
    document.querySelectorAll('input, textarea').forEach((e) => {
      const t = (e.type || '').toLowerCase();
      const sig = fieldSig(e);
      if (typeof shouldSkipAiField === 'function' && shouldSkipAiField(sig, t)) return;
      if (SKIP_TYPES.indexOf(t) >= 0) return;
      if (e.value && e.value.trim()) return;             // already filled (incl. deterministic pass)
      e.setAttribute('data-reqon-i', String(idx));
      candidates.push({ i: idx, sig, type: t });
      idx++;
    });
    if (!candidates.length) return { ok: false, ai: 0, msg: 'Nothing left for AI to fill.' };
    const r = await send({ type: 'mapFields', payload: { fields: candidates } });
    if (!r || !r.ok) return { ok: false, ai: 0, aiError: (r && r.error) || 'AI fill unavailable', msg: (r && r.error) || 'AI fill unavailable' };
    let ai = 0;
    (r.fields || []).forEach((m) => {
      if (!m || (typeof m.confidence === 'number' && m.confidence < 0.6)) return;
      const e = document.querySelector('[data-reqon-i="' + m.i + '"]');
      if (e && !(e.value && e.value.trim()) && m.value) { setVal(e, String(m.value)); ai++; }
    });
    return { ok: ai > 0, ai, msg: ai ? `AI filled ${ai} more field${ai === 1 ? '' : 's'} — review, never submitted.` : 'AI had nothing confident to add.' };
  }
  // Deterministic pass + AI enhancement in one call (kept for callers that want both at once).
  async function smartFill() {
    const base = await fillForm();
    const rest = await aiFillRest();
    if (rest.aiError) return Object.assign(base, { aiError: rest.aiError });
    const ai = rest.ai || 0;
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
  // Extract the SPECIFIC job on the page — structured (JSON-LD JobPosting) first, then the visible
  // detail-pane heading. Aggregator / SPA pages (Glassdoor & LinkedIn "For You", Indeed) keep a
  // generic tab title ("Recommended Jobs For You") while the real job lives in a detail pane, so
  // clipping off document.title captured garbage. Returns {company, role, location} best-effort.
  function captureJob() {
    const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 160);
    // 1) JSON-LD JobPosting — the most reliable, site-agnostic source (Glassdoor / LinkedIn / Indeed /
    //    Greenhouse / Lever commonly embed it). Handles a single object, an array, or an @graph.
    try {
      const flat = [];
      document.querySelectorAll('script[type="application/ld+json"]').forEach((n) => {
        let data; try { data = JSON.parse(n.textContent || 'null'); } catch (e) { return; }
        const push = (d) => { if (d && typeof d === 'object') flat.push(d); };
        if (Array.isArray(data)) data.forEach(push);
        else if (data && Array.isArray(data['@graph'])) data['@graph'].forEach(push);
        else push(data);
      });
      const typeOf = (d) => [].concat(d['@type'] || []).map((x) => String(x).toLowerCase());
      const jp = flat.find((d) => typeOf(d).includes('jobposting'));
      if (jp) {
        const org = jp.hiringOrganization;
        const company = clean(typeof org === 'string' ? org : (org && org.name));
        const role = clean(jp.title);
        const loc0 = Array.isArray(jp.jobLocation) ? jp.jobLocation[0] : jp.jobLocation;
        const addr = loc0 && loc0.address;
        const location = clean(addr && [addr.addressLocality, addr.addressRegion].filter(Boolean).join(', '));
        if (role || company) return { company, role, location, from: 'jsonld' };
      }
    } catch (e) { /* defensive */ }
    // 2) Visible detail-pane heading (SPA aggregators). Job-specific selectors first so a generic
    //    page heading ("Recommended Jobs For You") is never mistaken for a role.
    try {
      const pick = (sels) => { for (const s of sels) { const el = document.querySelector(s); const v = clean(el && el.textContent); if (v) return v; } return ''; };
      const role = pick(['[data-test="job-title"]', '[data-test="jobTitle"]',
        '.job-details-jobs-unified-top-card__job-title', 'h1[class*="jobTitle" i]',
        '[class*="JobDetails_jobTitle" i]', '[id^="job-details"] h1']);
      if (role) {
        const company = pick(['[data-test="employer-name"]', '[data-test="employerName"]',
          '.job-details-jobs-unified-top-card__company-name', '[class*="EmployerProfile_employerName" i]',
          '[class*="companyName" i]']);
        return { company, role, location: '', from: 'dom' };
      }
    } catch (e) { /* defensive */ }
    return { company: '', role: '', location: '', from: '' };
  }

  // Pull company/role/remote/salary/JD-excerpt/ATS off the page. company/role are extracted from the
  // page (captureJob) and sent explicitly; the server honors them and only parses the tab title when
  // they're absent, so aggregator/SPA clips arrive as the real job, not the page name.
  function captureMeta() {
    const text = jdText();
    const { source, applyMode } = detectATS(location.href);
    const job = captureJob();
    const title = document.title || '';
    const meta = {
      source, applyMode,
      company: job.company || undefined,
      role: job.role || undefined,
      location: job.location || undefined,
      remote: detectRemote(text),
      salary: extractSalary(text),
      jdExcerpt: text.slice(0, 600),
      postingId: postingId(location.href),
      seniority: /\b(principal|director|staff|head of|vp|vice president|lead|group)\b/i.test((job.role || title) + ' ' + text.slice(0, 400)) ? 'senior' : '',
    };
    const fill = fillabilityHint(applyMode, formStats());
    // Prefer the extracted job for confidence; fall back to the title heuristic when nothing parsed.
    const hasCompanySignal = !!job.company || /\s(?:at|@|—|–|\||·|-)\s|hiring/i.test(title) || !!document.querySelector('meta[property="og:site_name"]');
    const conf = captureConfidence(Object.assign(
      { company: job.company || (hasCompanySignal ? title : ''), role: job.role || title }, meta));
    return { meta, fill, conf, job };
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
    box.innerHTML = [
      '<div class="jpcrm-banner-shell">',
      '<div class="jpcrm-row jpcrm-drag"><span class="jpcrm-logo">Reqon</span><span class="jpcrm-status">checking…</span><button class="jpcrm-x" title="Hide on this page">×</button></div>',
      '<div class="jpcrm-banner-main">',
      '<div class="jpcrm-banner-summary">Checking this page…</div>',
      '<div class="jpcrm-banner-message">Looking up this role on your board.</div>',
      '<div class="jpcrm-banner-actions"></div>',
      '<div class="jpcrm-banner-meta"></div>',
      '</div>',
      '<div class="jpcrm-body"></div>',
      '</div>',
    ].join('');
    document.documentElement.appendChild(box);
    box.querySelector('.jpcrm-x').onclick = () => { box.remove(); box = null; };
    chrome.storage.sync.get({ theme: 'system' }, (c) => applyOverlayTheme(c && c.theme));
    restoreBoxPos();
    makeDraggable(box, box.querySelector('.jpcrm-drag'));
  }
  // Drag the overlay by its header and remember where it lands (per the user's request to move it off
  // the bottom-right). Positions in storage.local so it persists across pages; clamped to the viewport.
  function restoreBoxPos() {
    chrome.storage.local.get({ _reqonBoxPos: null }, (c) => {
      const p = c && c._reqonBoxPos;
      if (p && box && typeof p.left === 'number' && typeof p.top === 'number') {
        box.style.left = p.left + 'px'; box.style.top = p.top + 'px'; box.style.right = 'auto'; box.style.bottom = 'auto';
      }
    });
  }
  function makeDraggable(elm, handle) {
    if (!handle) return;
    handle.style.cursor = 'move';
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;   // let the × / pin buttons click through
      dragging = true;
      const r = elm.getBoundingClientRect();
      ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
      elm.style.left = ox + 'px'; elm.style.top = oy + 'px'; elm.style.right = 'auto'; elm.style.bottom = 'auto';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const nx = Math.max(4, Math.min(window.innerWidth - elm.offsetWidth - 4, ox + (e.clientX - sx)));
      const ny = Math.max(4, Math.min(window.innerHeight - elm.offsetHeight - 4, oy + (e.clientY - sy)));
      elm.style.left = nx + 'px'; elm.style.top = ny + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return; dragging = false;
      chrome.storage.local.set({ _reqonBoxPos: { left: parseInt(elm.style.left, 10) || 0, top: parseInt(elm.style.top, 10) || 0 } });
    });
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
    const { fill, job } = captureMeta();
    const banner = deriveBannerState({ row, job, fill, fit: row.fit });
    box.dataset.mode = banner.model.mode;
    box.querySelector('.jpcrm-status').textContent = row.role || row.company || '';
    box.querySelector('.jpcrm-banner-summary').textContent = banner.model.summaryText;
    box.querySelector('.jpcrm-banner-message').textContent = row.company ? `${row.company} is already tracked on your board.` : 'Tracked role found on your board.';
    renderBannerActions({
      primaryLabel: banner.model.primaryCta,
      primaryKind: fill.level !== 'External redirect' ? 'fill' : 'board',
      secondaryLabel: banner.model.secondaryCta,
      secondaryKind: 'board',
      row,
    });
    renderBannerMeta([banner.model.fitText, banner.model.statusText, fill.level]);
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
    body.appendChild(fillabilityRow(fill));
    if (fill.level !== 'External redirect') { body.appendChild(fillRow()); body.appendChild(el("div", "jpcrm-foot", "Skips passwords & EEO · never submits")); }
  }

  function renderUntracked() {
    const { fill, job } = captureMeta();
    const banner = deriveBannerState({ row: null, job, fill });
    box.dataset.mode = banner.model.mode;
    box.querySelector('.jpcrm-status').textContent = 'Not tracked yet';
    box.querySelector('.jpcrm-banner-summary').textContent = banner.model.summaryText;
    box.querySelector('.jpcrm-banner-message').textContent = banner.fillable
      ? 'This looks fillable. Save it or start guided fill from here.'
      : 'Review this page, then save it to your board if it is worth tracking.';
    renderBannerActions({
      primaryLabel: banner.model.primaryCta,
      primaryKind: banner.fillable ? 'fill' : 'clip',
      secondaryLabel: banner.model.secondaryCta,
      secondaryKind: 'clip',
      row: null,
    });
    renderBannerMeta([banner.model.fitText, banner.model.fillText, fill.level]);
    const body = box.querySelector('.jpcrm-body'); body.innerHTML = '';
    setTier('');
    body.appendChild(fillabilityRow(fill));
    const b = el('button', 'jpcrm-btn jpcrm-primary', '＋ Clip to my board');
    b.onclick = () => openClipPanel();
    body.appendChild(b);
    if (fill.level !== 'External redirect') { body.appendChild(fillRow()); body.appendChild(el("div", "jpcrm-foot", "Skips passwords & EEO · never submits")); }
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
    const { meta, conf, job } = captureMeta();
    const body = box.querySelector('.jpcrm-body'); body.innerHTML = '';
    const panel = el('div', 'jpcrm-clip');
    const confCls = { High: 'jpcrm-c-hi', Medium: 'jpcrm-c-mid', Low: 'jpcrm-c-lo' }[conf.level] || 'jpcrm-c-mid';
    // Show the extracted job (role — company), not the tab title, so the confirm reflects what saves.
    const heading = [job.role, job.company].filter(Boolean).join(' — ') || esc(document.title);
    panel.innerHTML =
      '<div class="jpcrm-clip-h">' + esc(heading).slice(0, 90) + '</div>' +
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

  function renderBannerMeta(items) {
    if (!box) return;
    const meta = box.querySelector('.jpcrm-banner-meta');
    if (!meta) return;
    meta.innerHTML = '';
    items.filter(Boolean).forEach((item) => meta.appendChild(el('span', 'jpcrm-banner-chip', item)));
  }

  function openBoard(row) {
    chrome.storage.sync.get({ origin: 'http://localhost:8787' }, (cfg) => {
      const base = String((cfg && cfg.origin) || 'http://localhost:8787').replace(/\/$/, '');
      const url = row && typeof reqKey === 'function'
        ? `${base}/?q=${encodeURIComponent(reqKey(row))}`
        : base;
      window.open(url, '_blank');
    });
  }

  function renderBannerActions({ primaryLabel, primaryKind, secondaryLabel, secondaryKind, row }) {
    if (!box) return;
    const actions = box.querySelector('.jpcrm-banner-actions');
    if (!actions) return;
    actions.innerHTML = '';
    const primary = el('button', 'jpcrm-btn jpcrm-primary', primaryLabel);
    primary.onclick = async () => {
      if (primaryKind === 'fill') {
        primary.disabled = true;
        primary.textContent = 'Filling…';
        const res = await fillForm();
        primary.disabled = false;
        primary.textContent = primaryLabel;
        renderFillSummary(res);
        return;
      }
      if (primaryKind === 'clip') return openClipPanel();
      if (primaryKind === 'board') return openBoard(row);
    };
    actions.appendChild(primary);
    if (secondaryLabel) {
      const secondary = el('button', 'jpcrm-btn jpcrm-btn-ghost', secondaryLabel);
      secondary.onclick = () => {
        if (secondaryKind === 'clip') return openClipPanel();
        if (secondaryKind === 'board') return openBoard(row);
      };
      actions.appendChild(secondary);
    }
  }

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
  // It also yields to the side panel — only one Reqon surface shows at a time. The side panel sets
  // `_reqonPanelOpen` while it's open (see sidepanel.js); we hide the overlay then and restore it on close.
  function start() { if (box) return; mount(); refresh(false); }
  function hide() { if (box) { box.remove(); box = null; } }
  function maybeStart() {
    chrome.storage.sync.get({ overlayEnabled: true }, (cfg) => {
      if (cfg.overlayEnabled === false) return;
      chrome.storage.local.get({ _reqonPanelOpen: false }, (l) => { if (!(l && l._reqonPanelOpen)) start(); });
    });
  }
  maybeStart();
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'sync') {
      if (ch.theme && box) applyOverlayTheme(ch.theme.newValue);
      if (ch.overlayEnabled) { ch.overlayEnabled.newValue === false ? hide() : maybeStart(); }
    } else if (area === 'local' && ch._reqonPanelOpen) {
      ch._reqonPanelOpen.newValue ? hide() : maybeStart();   // side panel opened → hide overlay; closed → restore
    }
  });
  // SPA boards (Ashby/LinkedIn) swap postings without a full load — re-check on URL change
  let last = location.href;
  setInterval(() => { if (box && location.href !== last) { last = location.href; refresh(false); } }, 1500);
})();
