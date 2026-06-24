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
  function jdKeywords() {
    const toks = (typeof _tokenize === 'function' ? _tokenize : (s) => (String(s || '').toLowerCase().match(/[a-z0-9+#]+/g) || []))(jdText());
    const freq = new Map();
    for (const t of toks) { if (/^\d+$/.test(t)) continue; freq.set(t, (freq.get(t) || 0) + 1); }
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
  const setVal = (e, v) => {
    const proto = e.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    (d && d.set ? d.set : function (x) { this.value = x; }).call(e, v);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    e.style.outline = '2px solid #00E5A3';
    e.style.outlineOffset = '1px';
  };
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
  const fillBtn = () => { const b = el('button', 'jpcrm-btn', '✎ Fill'); b.onclick = async () => { const res = await fillForm(); toast(res.msg, res.ok); }; return b; };

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

  let box;
  function mount() {
    box = el('div', 'jpcrm-box');
    box.innerHTML = '<div class="jpcrm-row"><span class="jpcrm-logo">Reqon</span><span class="jpcrm-status">checking…</span><button class="jpcrm-x" title="Hide on this page">×</button></div><div class="jpcrm-body"></div>';
    document.documentElement.appendChild(box);
    box.querySelector('.jpcrm-x').onclick = () => { box.remove(); box = null; };
  }

  function renderTracked(row) {
    box.querySelector('.jpcrm-status').textContent = row.company + ' — ' + (row.role || '');
    const body = box.querySelector('.jpcrm-body'); body.innerHTML = '';
    const tier = (row.tier || 'C');
    body.appendChild(el('span', 'jpcrm-tier jpcrm-t' + tier, 'Tier ' + tier));
    body.appendChild(el('span', 'jpcrm-metric', 'Fit ' + (+row.fit || 0)));
    body.appendChild(el('span', 'jpcrm-metric', 'Prob ' + (+row.prob || 0)));
    body.appendChild(el('span', 'jpcrm-metric jpcrm-ev', 'EV ' + ev(row)));
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
    body.appendChild(fillBtn());
  }

  function renderUntracked() {
    box.querySelector('.jpcrm-status').textContent = 'Not tracked yet';
    const body = box.querySelector('.jpcrm-body'); body.innerHTML = '';
    const b = el('button', 'jpcrm-btn jpcrm-primary', '+ Clip to CRM');
    b.onclick = async () => { b.disabled = true; b.textContent = 'Clipping…'; const r = await send({ type: 'clip', url: location.href, title: document.title }); toast(r.msg, r.ok); if (r.ok) setTimeout(() => refresh(true), 2500); else b.disabled = false; };
    body.appendChild(b);
    body.appendChild(fillBtn());
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
  function start() { if (box) return; mount(); refresh(false); }
  chrome.storage.sync.get({ overlayEnabled: true }, (cfg) => { if (cfg.overlayEnabled !== false) start(); });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'sync' || !ch.overlayEnabled) return;
    if (ch.overlayEnabled.newValue === false) { if (box) { box.remove(); box = null; } }
    else start();
  });
  // SPA boards (Ashby/LinkedIn) swap postings without a full load — re-check on URL change
  let last = location.href;
  setInterval(() => { if (box && location.href !== last) { last = location.href; refresh(false); } }, 1500);
})();
