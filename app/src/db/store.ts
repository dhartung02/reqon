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
  // Migration: `raw` holds the full server row JSON so a sync round-trip preserves fields the
  // app doesn't model (full fidelity / no clobber when push lands in Stage 2).
  const cols = await _db.getAllAsync<{ name: string }>('PRAGMA table_info(roles)');
  if (!cols.some((c) => c.name === 'raw')) {
    await _db.execAsync('ALTER TABLE roles ADD COLUMN raw TEXT');
  }
  // `seed` marks the offline demo rows so they are NEVER pushed to a real server (and are purged
  // once real synced rows arrive). `meta` holds sync bookkeeping (lastSync cursor).
  if (!cols.some((c) => c.name === 'seed')) {
    await _db.execAsync('ALTER TABLE roles ADD COLUMN seed INTEGER NOT NULL DEFAULT 0');
  }
  await _db.execAsync('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);');
  return _db;
}

export async function getMeta(key: string): Promise<string | null> {
  const d = await db();
  const r = await d.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return r?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const d = await db();
  await d.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
}

/** Open the DB and seed it from the sample roles on first run (empty table only). */
export async function initDb(): Promise<void> {
  const d = await db();
  const row = await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM roles');
  if (row && row.n > 0) return;
  const ts = nowIso();
  for (const s of sampleSeed) {
    await d.runAsync(
      `INSERT INTO roles (id, role, company, status, fit, prob, salary, location, link, applied, recruiter, next, notes, age, updatedAt, deleted, seed)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)`,
      [
        s.id, s.role, s.company, s.status, s.fit, s.prob,
        s.salary ?? null, s.location ?? null, s.link ?? null, s.applied ?? null,
        s.recruiter ?? null, s.next ?? null, s.notes ?? null, s.age, ts,
      ],
    );
  }
}

const toRole = (r: Row & { raw?: string | null }): Role => {
  // Hygiene/triage fields live in the full server row (raw); surface them for the Today lanes.
  const x = typeof r.raw === 'string' ? (JSON.parse(r.raw) as Record<string, unknown>) : {};
  return scoreRole({
    id: r.id,
    role: r.role,
    company: r.company,
    status: r.status as Status,
    fit: r.fit,
    prob: r.prob,
    salary: r.salary ?? undefined,
    location: r.location ?? undefined,
    link: r.link ?? undefined,
    applied: r.applied ?? (x.applied as string) ?? undefined,
    recruiter: r.recruiter ?? undefined,
    next: r.next ?? undefined,
    notes: r.notes ?? undefined,
    age: r.age,
    conf: (x.conf as string) ?? undefined,
    reqCheck: (x.reqCheck as string) ?? undefined,
    lastcontact: (x.lastcontact as string) ?? undefined,
    added: (x.added as string) ?? undefined,
  }) as Role;
};

/** All live (non-tombstoned) roles, tier + score derived. */
export async function getAllRoles(): Promise<Role[]> {
  const d = await db();
  const rows = await d.getAllAsync<Row & { raw?: string | null }>('SELECT * FROM roles WHERE deleted = 0');
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

/**
 * Replace the local store with the server's rows (Stage-1 full pull — server is source of truth).
 * Stores the full row JSON in `raw` for fidelity; skips tombstones. Returns rows applied.
 */
export async function replaceAllFromServer(rows: unknown[]): Promise<number> {
  const d = await db();
  await d.execAsync('DELETE FROM roles');
  let n = 0;
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    if (!r || !r.id || r.deleted) continue;
    await d.runAsync(
      `INSERT OR REPLACE INTO roles (id, role, company, status, fit, prob, salary, location, link, applied, recruiter, next, notes, age, updatedAt, deleted, raw)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
      [
        String(r.id),
        String(r.role ?? ''),
        String(r.company ?? ''),
        String(r.status ?? 'Not Applied'),
        Number(r.fit) || 0,
        Number(r.prob) || 0,
        (r.salary as string) ?? null,
        (r.location as string) ?? null,
        (r.link as string) ?? null,
        (r.applied as string) ?? null,
        (r.recruiter as string) ?? null,
        (r.next as string) ?? null,
        (r.notes as string) ?? null,
        'synced',
        (r.updatedAt as string) ?? nowIso(),
        JSON.stringify(r),
      ],
    );
    n++;
  }
  return n;
}

/**
 * Full local rows for a PUSH (Stage 2) — excludes demo seed rows, includes tombstones. Overlays
 * the app's current fields onto the stored `raw` server JSON so server-only fields round-trip.
 */
export async function getRowsForSync(): Promise<Record<string, unknown>[]> {
  const d = await db();
  const rows = await d.getAllAsync<Record<string, unknown>>('SELECT * FROM roles WHERE seed = 0');
  return rows.map((r) => {
    const base = typeof r.raw === 'string' ? JSON.parse(r.raw) : {};
    return {
      ...base,
      id: r.id,
      role: r.role,
      company: r.company,
      status: r.status,
      fit: r.fit,
      prob: r.prob,
      salary: r.salary,
      location: r.location,
      link: r.link,
      applied: r.applied,
      recruiter: r.recruiter,
      next: r.next,
      notes: r.notes,
      updatedAt: r.updatedAt,
      deleted: r.deleted === 1,
    };
  });
}

/**
 * Apply the server's post-reconcile rows (Stage 2). idRemaps: server deduped a client row to an
 * existing one — drop the local `from` id (the canonical `to` row arrives in `rows`). Upserts with
 * the row's tombstone flag. Once real rows land, the demo seed is purged.
 */
export async function applySyncRows(
  rows: unknown[],
  idRemaps?: { from: string; to: string }[],
): Promise<number> {
  const d = await db();
  for (const m of idRemaps ?? []) {
    await d.runAsync('DELETE FROM roles WHERE id = ?', [String(m.from)]);
  }
  let n = 0;
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    if (!r || !r.id) continue;
    await d.runAsync(
      `INSERT OR REPLACE INTO roles (id, role, company, status, fit, prob, salary, location, link, applied, recruiter, next, notes, age, updatedAt, deleted, raw, seed)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
      [
        String(r.id),
        String(r.role ?? ''),
        String(r.company ?? ''),
        String(r.status ?? 'Not Applied'),
        Number(r.fit) || 0,
        Number(r.prob) || 0,
        (r.salary as string) ?? null,
        (r.location as string) ?? null,
        (r.link as string) ?? null,
        (r.applied as string) ?? null,
        (r.recruiter as string) ?? null,
        (r.next as string) ?? null,
        (r.notes as string) ?? null,
        'synced',
        (r.updatedAt as string) ?? nowIso(),
        r.deleted ? 1 : 0,
        JSON.stringify(r),
      ],
    );
    n++;
  }
  if (n > 0) await d.runAsync('DELETE FROM roles WHERE seed = 1');
  return n;
}

export interface NewRole {
  role: string;
  company: string;
  fit: number;
  prob: number;
  salary?: string;
  location?: string;
  link?: string;
}

/** Insert a new role (status 'Not Applied'). Returns the generated id. */
export async function addRole(input: NewRole): Promise<string> {
  const d = await db();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await d.runAsync(
    `INSERT INTO roles (id, role, company, status, fit, prob, salary, location, link, applied, recruiter, next, notes, age, updatedAt, deleted)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
    [
      id, input.role, input.company, 'Not Applied', input.fit, input.prob,
      input.salary ?? null, input.location ?? null, input.link ?? null,
      null, null, null, null, 'just now', nowIso(),
    ],
  );
  return id;
}
