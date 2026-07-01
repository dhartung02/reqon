function buildExperienceCache({ ttlMs = 60_000, now = () => Date.now() } = {}) {
  let payload = null;
  let at = 0;
  return {
    get() { return payload; },
    set(next) { payload = next; at = now(); },
    isFresh() { return !!payload && (now() - at) < ttlMs; },
    clear() { payload = null; at = 0; },
  };
}

function shouldBroadcastPageContext(prev, next) {
  if (!prev || !next) return true;
  return prev.mode !== next.mode || prev.pageKey !== next.pageKey;
}

function normalizeUpdateCheckResult(status, details) {
  if (status === 'update_available') {
    const version = details && details.version ? ` (${details.version})` : '';
    return {
      ok: true,
      status,
      message: `Reqon update available${version}. Chrome will install it when the extension is idle.`,
    };
  }
  if (status === 'throttled') {
    return {
      ok: false,
      status,
      message: 'Chrome throttled the update check. Try again in a little while.',
    };
  }
  return {
    ok: true,
    status: 'no_update',
    message: 'Reqon is already up to date.',
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    buildExperienceCache,
    shouldBroadcastPageContext,
    normalizeUpdateCheckResult,
  };
}
