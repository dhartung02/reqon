// ESM shim for bundlers (React Native / Expo) that prefer `import`. The implementation lives
// in crm-core.js (CommonJS) so Node `require()` works without a build step; this re-exports it.
import core from './crm-core.js';
export const { reqKey, postingId, sameReq, expectedValue, computeTier, reconcileSync, encodePairing, decodePairing } = core;
// entitlements (freemium tier model) — same single catalog, re-exported for the ESM bundler.
export const {
  PACKAGES, PACKAGE_LABELS, FEATURES, FEATURE_LABELS,
  parseLicense, resolvePlan, requiredPackage, hasFeature, featureMap, tierLabel,
} = core;
export default core;
