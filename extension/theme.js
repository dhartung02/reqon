// Appearance controller for the extension UI (popup, side panel, options). Mirrors the app's
// light/dark/system model (app/src/theme.ts): default System (follow OS), with Light/Dark overrides.
// The preference persists in chrome.storage.sync (key "theme") so every surface stays in sync; the
// in-page overlay reads the same key (see content.js). Sets data-theme on <html> and dispatches a
// "reqontheme" event so surfaces can repaint their switch.
(function () {
  const ORDER = ['system', 'light', 'dark'];
  const ICON = { system: '◑', light: '☀', dark: '☾' };
  const LABEL = { system: 'System', light: 'Light', dark: 'Dark' };
  const norm = (p) => (p === 'light' || p === 'dark' || p === 'system') ? p : 'system';
  let pref = 'system';

  const resolve = (p) => (p === 'light' || p === 'dark')
    ? p
    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

  function apply() {
    const scheme = resolve(pref);
    document.documentElement.setAttribute('data-theme', scheme);
    document.dispatchEvent(new CustomEvent('reqontheme', { detail: { pref, scheme } }));
  }

  window.reqonThemePref = () => pref;
  window.reqonThemeIcon = (p) => ICON[p || pref] || ICON.system;
  window.reqonThemeLabel = (p) => LABEL[p || pref] || LABEL.system;
  window.reqonThemeSet = (p) => { pref = norm(p); apply(); try { chrome.storage.sync.set({ theme: pref }); } catch (e) {} };
  window.reqonThemeCycle = () => { const i = ORDER.indexOf(pref); window.reqonThemeSet(ORDER[(i + 1) % ORDER.length]); };

  // Wire the single cycle button (System → Light → Dark) — the small brightness control next to
  // Settings, matching cloud.reqon.app. The button keeps its inline SVG glyph; we only update the
  // tooltip/aria + a data-pref hook (so CSS can reflect state if desired). Never touch its innerHTML.
  window.reqonThemeWireButton = (el) => {
    if (!el) return;
    const paint = () => {
      el.title = 'Appearance: ' + LABEL[pref] + ' (click to change)';
      el.setAttribute('aria-label', 'Appearance: ' + LABEL[pref] + '. Click to switch theme.');
      el.setAttribute('data-pref', pref);
    };
    el.addEventListener('click', () => window.reqonThemeCycle());
    document.addEventListener('reqontheme', paint);
    paint();
  };
  // Wire a 3-way segmented control (buttons with data-pref), like the app's Appearance setting.
  window.reqonThemeWireSeg = (el) => {
    if (!el) return;
    const btns = Array.prototype.slice.call(el.querySelectorAll('[data-pref]'));
    btns.forEach((b) => b.addEventListener('click', () => window.reqonThemeSet(b.dataset.pref)));
    const paint = () => btns.forEach((b) => b.classList.toggle('on', b.dataset.pref === pref));
    document.addEventListener('reqontheme', paint);
    paint();
  };

  try {
    chrome.storage.sync.get({ theme: 'system' }, (c) => { pref = norm(c && c.theme); apply(); });
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'sync' && ch.theme) { pref = norm(ch.theme.newValue); apply(); }
    });
  } catch (e) { apply(); }

  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (pref === 'system') apply(); });
    } catch (e) {}
  }
})();
