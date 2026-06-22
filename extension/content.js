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
    '#content .job__description', '[class*="job-description" i]', '[class*="description" i]', 'main', 'article'];
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
    if (msg.type === 'jdKeywords') { try { sendResponse({ ok: true, tokens: jdKeywords() }); } catch (e) { sendResponse({ ok: false }); } return; }
    if (msg.type === 'jdText') { try { sendResponse({ ok: true, text: jdText() }); } catch (e) { sendResponse({ ok: false }); } return; }
    if (msg.type === 'autofill') { fillForm().then((res) => sendResponse(res)).catch((e) => sendResponse({ ok: false, msg: String(e) })); return true; }
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
