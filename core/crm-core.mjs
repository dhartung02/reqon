// ESM shim for bundlers (React Native / Expo) that prefer `import`. The implementation lives
// in crm-core.js (CommonJS) so Node `require()` works without a build step; this re-exports it.
import core from './crm-core.js';
export const { reqKey, postingId, sameReq, expectedValue, computeTier, reconcileSync, encodePairing, decodePairing } = core;
export default core;
