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
  async function fillForm() {
    const r = await send({ type: 'profile' });
    if (!r || !r.ok) { toast('Could not load profile — check connection.', false); return; }
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
    toast(`Filled ${factual} field${factual === 1 ? '' : 's'}` + (answered ? ` + ${answered} answer${answered === 1 ? '' : 's'}` : '') + ' — review, never auto-submitted.', factual + answered > 0);
  }
  const fillBtn = () => { const b = el('button', 'jpcrm-btn', '✎ Fill'); b.onclick = fillForm; return b; };

  let box;
  function mount() {
    box = el('div', 'jpcrm-box');
    box.innerHTML = '<div class="jpcrm-row"><span class="jpcrm-logo">JPCRM</span><span class="jpcrm-status">checking…</span><button class="jpcrm-x" title="Hide">×</button></div><div class="jpcrm-body"></div>';
    document.documentElement.appendChild(box);
    box.querySelector('.jpcrm-x').onclick = () => box.remove();
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

  mount();
  refresh(false);
  // SPA boards (Ashby/LinkedIn) swap postings without a full load — re-check on URL change
  let last = location.href;
  setInterval(() => { if (location.href !== last) { last = location.href; refresh(false); } }, 1500);
})();
