const $ = id => document.getElementById(id);
const CLOUD_ORIGIN = 'https://cloud.reqon.app';
const DEFAULTS = { origin: CLOUD_ORIGIN, token: '', overlayEnabled: true };

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

async function ensureHostPermission(origin) {
  try {
    const pattern = origin.replace(/\/$/, '') + '/*';
    const has = await chrome.permissions.contains({ origins: [pattern] });
    if (!has) await chrome.permissions.request({ origins: [pattern] });
  } catch (e) {}
}

$('save').onclick = async () => {
  const preset = $('serverPreset').value;
  const origin = (preset === 'cloud' ? CLOUD_ORIGIN : ($('origin').value.trim() || CLOUD_ORIGIN)).replace(/\/$/, '');
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
    await chrome.storage.sync.set({ origin, token: j.token || '', overlayEnabled: $('overlay').checked });
    $('msg').textContent = j.displayName ? `Connected as ${j.displayName}.` : 'Connected.';
    $('msg').className = 'ok';
    $('password').value = '';
  } catch (e) {
    $('msg').textContent = 'Network error: ' + e.message; $('msg').className = 'err';
  }
};

$('test').onclick = () => {
  $('msg').textContent = 'Testing…'; $('msg').className = '';
  chrome.runtime.sendMessage({ type: 'testConnection' }, r => {
    $('msg').textContent = (r && r.msg) || 'No response.';
    $('msg').className = (r && r.ok) ? 'ok' : 'err';
  });
};
