/**
 * On-page overlay (FR-EXT-3/4). Asks the worker whether this posting is tracked, then shows
 * a compact badge: fit/prob/EV/tier + status if tracked (with a Mark-applied button), or a
 * Clip button if not. No form autofill — that's intentionally Simplify's job.
 */
(function () {
  if (window.__jpcrmOverlay) return;
  window.__jpcrmOverlay = true;

  const send = msg => new Promise(r => chrome.runtime.sendMessage(msg, r));
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const ev = r => (((+r.fit || 0) * (+r.prob || 0)) / 10).toFixed(1);

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
  }

  function renderUntracked() {
    box.querySelector('.jpcrm-status').textContent = 'Not tracked yet';
    const body = box.querySelector('.jpcrm-body'); body.innerHTML = '';
    const b = el('button', 'jpcrm-btn jpcrm-primary', '+ Clip to CRM');
    b.onclick = async () => { b.disabled = true; b.textContent = 'Clipping…'; const r = await send({ type: 'clip', url: location.href, title: document.title }); toast(r.msg, r.ok); if (r.ok) setTimeout(() => refresh(true), 2500); else b.disabled = false; };
    body.appendChild(b);
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
