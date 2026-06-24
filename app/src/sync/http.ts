// fetch with a hard timeout — so a slow/flaky link (e.g. a tunnel) fails fast and the caller can fall
// back to local data, instead of the request hanging indefinitely (RN fetch has no default timeout).
export async function timedFetch(url: string, opts: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
