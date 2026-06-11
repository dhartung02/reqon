// Greenhouse target boards (mirrors the greenhouse subset of agent/boards.json). Only Greenhouse
// is polled in this on-device v1 — its public board API is CORS-open JSON, no key needed.
export interface Board {
  name: string;
  slug: string;
  heritage?: boolean; // small interview-probability bump (e.g. Acxiom alumni network)
}

export const GREENHOUSE_BOARDS: Board[] = [
  { name: 'Glean', slug: 'gleanwork' },
  { name: 'Postscript', slug: 'postscript' },
  { name: 'Hightouch', slug: 'hightouch' },
  { name: 'GitLab', slug: 'gitlab' },
  { name: 'Mercury', slug: 'mercury' },
  { name: 'DoubleVerify', slug: 'doubleverify' },
  { name: 'Zeta Global', slug: 'zetaglobal' },
];
