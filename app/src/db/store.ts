import * as SQLite from 'expo-sqlite';
import { scoreRole, type Role, type Status } from '../model';
import { sampleSeed } from '../data/sample';

// Local-first persistence (expo-sqlite). Stores the raw row; tier + score are derived on read via
// the shared core. `updatedAt` + `deleted` mirror the server's sync model (FR-SRV-1/2) so the
// SyncEngine in M4 can reconcile against /api/sync with no schema change.
const DB_NAME = 'reqon.db';
let _db: SQLite.SQLiteDatabase | null = null;

interface Row {
  id: string;
  role: string;
  company: string;
  status: string;
  fit: number;
  prob: number;
  salary: string | null;
  location: string | null;
  link: string | null;
  applied: string | null;
  recruiter: string | null;
  next: string | null;
  notes: string | null;
  age: string;
  updatedAt: string;
  deleted: number;
}

const nowIso = () => new Date().toISOString();

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY NOT NULL,
      role TEXT NOT NULL,
      company TEXT NOT NULL,
      status TEXT NOT NULL,
      fit REAL NOT NULL,
      prob REAL NOT NULL,
      salary TEXT, location TEXT, link TEXT,
      applied TEXT, recruiter TEXT, next TEXT, notes TEXT,
      age TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    );
  `);
  return _db;
}

/** Open the DB and seed it from the sample roles on first run (empty table only). */
export async function initDb(): Promise<void> {
  const d = await db();
  const row = await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM roles');
  if (row && row.n > 0) return;
  const ts = nowIso();
  for (const s of sampleSeed) {
    await d.runAsync(
      `INSERT INTO roles (id, role, company, status, fit, prob, salary, location, link, applied, recruiter, next, notes, age, updatedAt, deleted)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
      [
        s.id, s.role, s.company, s.status, s.fit, s.prob,
        s.salary ?? null, s.location ?? null, s.link ?? null, s.applied ?? null,
        s.recruiter ?? null, s.next ?? null, s.notes ?? null, s.age, ts,
      ],
    );
  }
}

const toRole = (r: Row): Role =>
  scoreRole({
    id: r.id,
    role: r.role,
    company: r.company,
    status: r.status as Status,
    fit: r.fit,
    prob: r.prob,
    salary: r.salary ?? undefined,
    location: r.location ?? undefined,
    link: r.link ?? undefined,
    applied: r.applied ?? undefined,
    recruiter: r.recruiter ?? undefined,
    next: r.next ?? undefined,
    notes: r.notes ?? undefined,
    age: r.age,
  }) as Role;

/** All live (non-tombstoned) roles, tier + score derived. */
export async function getAllRoles(): Promise<Role[]> {
  const d = await db();
  const rows = await d.getAllAsync<Row>('SELECT * FROM roles WHERE deleted = 0');
  return rows.map(toRole);
}

/** Update a role's status (bumps updatedAt). Stamps `applied` when moving into Applied. */
export async function setRoleStatus(id: string, status: Status): Promise<void> {
  const d = await db();
  const applied = status === 'Applied' ? nowIso().slice(0, 10) : null;
  if (applied) {
    await d.runAsync(
      'UPDATE roles SET status = ?, applied = COALESCE(applied, ?), updatedAt = ? WHERE id = ?',
      [status, applied, nowIso(), id],
    );
  } else {
    await d.runAsync('UPDATE roles SET status = ?, updatedAt = ? WHERE id = ?', [status, nowIso(), id]);
  }
}

/** Patch arbitrary editable fields (bumps updatedAt). */
export async function updateRole(id: string, patch: Partial<Pick<Role, 'next' | 'recruiter' | 'notes' | 'salary' | 'location'>>): Promise<void> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length === 0) return;
  const d = await db();
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => patch[k] ?? null);
  await d.runAsync(`UPDATE roles SET ${sets}, updatedAt = ? WHERE id = ?`, [...values, nowIso(), id]);
}

/** Tombstone a role (soft delete — never spliced, per the sync model). */
export async function softDeleteRole(id: string): Promise<void> {
  const d = await db();
  await d.runAsync('UPDATE roles SET deleted = 1, updatedAt = ? WHERE id = ?', [nowIso(), id]);
}
