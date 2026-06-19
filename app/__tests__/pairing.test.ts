import { encodePairing, decodePairing } from '@reqon/core';

// Device-pairing codec (shared core). The board encodes {url, token} into a QR/paste string;
// the app decodes it to auto-fill sync config. Round-trip + rejection of junk.
describe('pairing codec', () => {
  it('round-trips url + token', () => {
    const code = encodePairing('http://192.168.1.5:8787', 'sw0rdfish');
    expect(code.startsWith('REQON1:')).toBe(true);
    expect(decodePairing(code)).toEqual({ url: 'http://192.168.1.5:8787', token: 'sw0rdfish' });
  });

  it('handles an empty token (no passphrase set)', () => {
    expect(decodePairing(encodePairing('http://localhost:8787', ''))).toEqual({
      url: 'http://localhost:8787',
      token: '',
    });
  });

  it('preserves unicode in the passphrase', () => {
    const code = encodePairing('https://x.example.com', 'pä$$ wörd 你好');
    expect(decodePairing(code)?.token).toBe('pä$$ wörd 你好');
  });

  it('returns null for non-pairing input', () => {
    expect(decodePairing('')).toBeNull();
    expect(decodePairing('https://jobs.example.com/123')).toBeNull();
    expect(decodePairing('REQON1:not-base64-json###')).toBeNull();
  });
});
