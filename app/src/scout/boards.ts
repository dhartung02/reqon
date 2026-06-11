// Scout target boards (mirrors agent/boards.json). Greenhouse + Ashby are seeded; Lever is also
// supported by the adapter (add entries with ats:'lever'). All three are CORS-open public JSON.
export type Ats = 'greenhouse' | 'ashby' | 'lever';

export interface Board {
  name: string;
  slug: string;
  ats: Ats;
  heritage?: boolean; // small interview-probability bump (e.g. Acxiom alumni network)
}

export const BOARDS: Board[] = [
  { name: 'Glean', slug: 'gleanwork', ats: 'greenhouse' },
  { name: 'Postscript', slug: 'postscript', ats: 'greenhouse' },
  { name: 'Hightouch', slug: 'hightouch', ats: 'greenhouse' },
  { name: 'GitLab', slug: 'gitlab', ats: 'greenhouse' },
  { name: 'Mercury', slug: 'mercury', ats: 'greenhouse' },
  { name: 'DoubleVerify', slug: 'doubleverify', ats: 'greenhouse' },
  { name: 'Zeta Global', slug: 'zetaglobal', ats: 'greenhouse' },
  { name: 'Confluent', slug: 'confluent', ats: 'ashby' },
  { name: 'WorkOS', slug: 'workos', ats: 'ashby' },
  { name: 'Supabase', slug: 'supabase', ats: 'ashby' },
  { name: 'Vanta', slug: 'vanta', ats: 'ashby' },
  { name: 'Render', slug: 'render', ats: 'ashby' },
  { name: 'Drata', slug: 'drata', ats: 'ashby' },
];
