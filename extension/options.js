const $ = id => document.getElementById(id);
const DEFAULTS = { origin: 'http://localhost:8787', token: '' };

chrome.storage.sync.get(DEFAULTS, c => { $('origin').value = c.origin; $('token').value = c.token; });

async function ensureHostPermission(origin) {
  // request host permission for non-default origins (e.g. a tunnel HTTPS host)
  try {
    const pattern = origin.replace(/\/$/, '') + '/*';
    const has = await chrome.permissions.contains({ origins: [pattern] });
    if (!has) await chrome.permissions.request({ origins: [pattern] });
  } catch (e) { /* localhost is already in host_permissions */ }
}

$('save').onclick = async () => {
  const origin = $('origin').value.trim() || DEFAULTS.origin;
  await ensureHostPermission(origin);
  chrome.storage.sync.set({ origin, token: $('token').value.trim() }, () => {
    $('msg').textContent = 'Saved.'; $('msg').className = 'ok';
  });
};

$('test').onclick = () => {
  $('msg').textContent = 'Testing…'; $('msg').className = '';
  chrome.runtime.sendMessage({ type: 'testConnection' }, r => {
    $('msg').textContent = (r && r.msg) || 'No response.';
    $('msg').className = (r && r.ok) ? 'ok' : 'err';
  });
};
