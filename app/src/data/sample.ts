import { scoreRole, type Role, type Status } from '../model';

// Seed roles spanning every lane. Stored raw (fit/prob/status/…) in the expo-sqlite DB on first
// run; tier + score are derived on read via the shared core (scoreRole).
export interface Seed {
  id: string;
  role: string;
  company: string;
  status: Status;
  fit: number;
  prob: number;
  age: string;
  salary?: string;
  location?: string;
  link?: string;
  applied?: string;
  recruiter?: string;
  next?: string;
  notes?: string;
}

const SEED: Seed[] = [
  { id: '1', role: 'Principal Systems Architect', company: 'Autonomous Infrastructure Corp', status: 'Not Applied', fit: 9.4, prob: 9, age: '2h ago', salary: '$240–280K', location: 'Remote', link: 'https://job-boards.greenhouse.io/aic/jobs/551', next: 'Review draft, then apply', notes: 'Local-first + data platform — bullseye.' },
  { id: '2', role: 'Director of Engineering (Local-First)', company: 'Cryptographic Systems Inc', status: 'Not Applied', fit: 7.8, prob: 9, age: '1d ago', salary: '$220–250K', location: 'Remote', link: 'https://jobs.ashbyhq.com/csi/dir-eng' },
  { id: '3', role: 'Staff PM, Data Platform', company: 'Lakehouse Labs', status: 'Not Applied', fit: 8.6, prob: 8, age: '4h ago', salary: '$230–260K', location: 'Remote' },
  { id: '4', role: 'Group PM, Identity & Access', company: 'Vanta', status: 'Applied', fit: 8.2, prob: 7, age: '3d ago', applied: '2026-06-07', salary: '$235K', location: 'Remote', recruiter: 'Dana Reyes', next: 'Await recruiter response' },
  { id: '5', role: 'Principal PM, CDP', company: 'Segment', status: 'Applied', fit: 9.0, prob: 7.5, age: '5d ago', applied: '2026-06-05', recruiter: 'M. Okafor', next: 'Follow up if quiet by 6/12' },
  { id: '6', role: 'Senior PM, Usage & Billing', company: 'Twilio', status: 'Applied', fit: 7.2, prob: 6.5, age: '6d ago', applied: '2026-06-04', next: 'Follow up — gone quiet' },
  { id: '7', role: 'Principal PM, AI Platform', company: 'Mercury', status: 'Recruiter Screen', fit: 8.8, prob: 8, age: '8d ago', applied: '2026-06-02', recruiter: 'Priya N.', next: 'Recruiter call Thu 2pm' },
  { id: '8', role: 'Head of Product, MCP Tooling', company: 'GitHub', status: 'Hiring Manager', fit: 9.1, prob: 7, age: '11d ago', applied: '2026-05-30', recruiter: 'Sam W.', next: 'HM interview prep' },
  { id: '9', role: 'Director PM, Data Infra', company: 'Snowflake', status: 'Panel', fit: 8.4, prob: 6.8, age: '14d ago', applied: '2026-05-27', next: 'Panel loop scheduling' },
  { id: '10', role: 'Senior Technical Lead', company: 'Mass-Market Logistics Group', status: 'Rejected', fit: 4.2, prob: 8, age: '9d ago', applied: '2026-06-01', next: 'Archive' },
  { id: '11', role: 'Product Manager, Catalog', company: 'Generic Commerce Co', status: 'Rejected', fit: 6.1, prob: 5, age: '12d ago', applied: '2026-05-29' },
  { id: '12', role: 'PM, Internal Tools', company: 'Legacy Retail Inc', status: 'Archived', fit: 5.0, prob: 4, age: '20d ago', notes: 'Onsite-only — out of scope.' },
];

export const sampleSeed: Seed[] = SEED;
export const sampleRoles: Role[] = SEED.map((s) => scoreRole(s) as Role);
