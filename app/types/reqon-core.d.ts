// Ambient types for the shared CRM core (repo-root core/crm-core.js, plain CommonJS).
// The implementation is imported verbatim via the `@reqon/core` alias (resolved by Metro in
// metro.config.js and by jest in jest.config.js). Keep this in sync with core/crm-core.js —
// it is the single source of truth for the server, this app, and the Chrome extension.
declare module '@reqon/core' {
  /** A requisition row. Loosely typed here; the app layers a stricter model on top. */
  export type Req = Record<string, unknown> & {
    id?: string;
    company?: string;
    role?: string;
    link?: string;
    url?: string;
    fit?: number;
    prob?: number;
    tier?: Tier;
    status?: string;
    updatedAt?: string;
    syncedAt?: string;
    deleted?: boolean;
  };

  export type Tier = 'A' | 'B' | 'C';

  /** Injected environment so the core stays dependency-free (no Node/DOM clock or uuid). */
  export interface SyncDeps {
    genId(): string;
    now(): string;
  }

  export interface IdRemap {
    from: string;
    to: string;
  }

  export interface SyncResult {
    rows: Req[];
    applied: number;
    conflicts: number;
    idRemaps: IdRemap[];
  }

  export function reqKey(x: Req): string;
  export function postingId(u?: string | null): string;
  export function sameReq(a: Req, b: Req): boolean;
  export function expectedValue(x: Req): number;
  export function computeTier(fit?: number | null, prob?: number | null): Tier;
  export function reconcileSync(serverRows: Req[], clientRows: Req[], deps?: SyncDeps): SyncResult;

  const core: {
    reqKey: typeof reqKey;
    postingId: typeof postingId;
    sameReq: typeof sameReq;
    expectedValue: typeof expectedValue;
    computeTier: typeof computeTier;
    reconcileSync: typeof reconcileSync;
  };
  export default core;
}
