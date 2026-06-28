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

  /** Tunable tier thresholds (Reqon "Tiers & rules" setting). Omit any field to use the default. */
  export interface TierThresholds {
    aEv?: number;
    aFit?: number;
    aProb?: number;
    bEv?: number;
  }
  export const DEFAULT_TIER_THRESHOLDS: Required<TierThresholds>;

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
  export function computeTier(fit?: number | null, prob?: number | null, thr?: TierThresholds): Tier;
  export function reconcileSync(serverRows: Req[], clientRows: Req[], deps?: SyncDeps): SyncResult;

  /** Decoded device-pairing payload (server URL + passphrase). */
  export interface PairingInfo {
    url: string;
    token: string;
  }
  export function encodePairing(url: string, token: string): string;
  /** Parse a pairing code/QR string; returns null if it isn't a valid Reqon pairing code. */
  export function decodePairing(code: string): PairingInfo | null;

  // ── entitlements (freemium tier model) ──────────────────────────────────────
  /** À-la-carte package an account can hold. */
  export type Package = 'free' | 'cloud' | 'ai';
  /** A feature's required package, or a grant label. */
  export type Grant = Package | 'pro' | 'owner';
  /** Catalog: feature key → the package that unlocks it. */
  export const FEATURES: Record<string, Package>;
  export const PACKAGES: Package[];
  export const PACKAGE_LABELS: Record<string, string>;
  export const FEATURE_LABELS: Record<string, string>;

  /** Raw signals the server resolves a plan from. */
  export interface PlanSignals {
    isOwner?: boolean;
    selfHostSingleUser?: boolean;
    localProUnlock?: boolean;
    license?: string;
  }
  /** An effective, normalized plan. */
  export interface Plan {
    owner: boolean;
    pro: boolean;
    cloud: boolean;
    ai: boolean;
    packages: Package[];
    tier: 'free' | 'cloud' | 'ai' | 'cloud+ai' | 'pro' | 'owner';
  }
  export function parseLicense(license?: string | null): { owner: boolean; pro: boolean; cloud: boolean; ai: boolean };
  export function resolvePlan(sig?: PlanSignals): Plan;
  export function requiredPackage(feature: string): Package | null;
  export function hasFeature(plan: Plan | null | undefined, feature: string): boolean;
  export function featureMap(plan: Plan | null | undefined): Record<string, boolean>;
  export function tierLabel(tier: string): string;

  const core: {
    reqKey: typeof reqKey;
    postingId: typeof postingId;
    sameReq: typeof sameReq;
    expectedValue: typeof expectedValue;
    computeTier: typeof computeTier;
    reconcileSync: typeof reconcileSync;
    encodePairing: typeof encodePairing;
    decodePairing: typeof decodePairing;
    DEFAULT_TIER_THRESHOLDS: Required<TierThresholds>;
    FEATURES: typeof FEATURES;
    PACKAGES: typeof PACKAGES;
    PACKAGE_LABELS: typeof PACKAGE_LABELS;
    FEATURE_LABELS: typeof FEATURE_LABELS;
    parseLicense: typeof parseLicense;
    resolvePlan: typeof resolvePlan;
    requiredPackage: typeof requiredPackage;
    hasFeature: typeof hasFeature;
    featureMap: typeof featureMap;
    tierLabel: typeof tierLabel;
  };
  export default core;
}
