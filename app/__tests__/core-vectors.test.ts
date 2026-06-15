/**
 * Proves the Reqon app consumes the shared core correctly by running the SAME JSON fixtures
 * (repo-root tests/vectors/) the server asserts — through the app's own @reqon/core alias and
 * the jest-expo toolchain. If this is green, the app's scoring/dedupe/sync logic IS the
 * server's, not a drifting copy. Mirrors tests/run-core-vectors.js.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  reqKey,
  postingId,
  sameReq,
  expectedValue,
  computeTier,
  reconcileSync,
  type Req,
  type SyncDeps,
} from '@reqon/core';

const VEC = path.resolve(__dirname, '..', '..', 'tests', 'vectors');
const load = (name: string) => JSON.parse(fs.readFileSync(path.join(VEC, name), 'utf8'));

describe('@reqon/core — shared identity/scoring vectors (app parity)', () => {
  it('postingId fixtures', () => {
    for (const v of load('posting-id.json') as { url?: string; expect: string }[]) {
      expect(postingId(v.url)).toBe(v.expect);
    }
  });

  it('sameReq fixtures', () => {
    for (const v of load('same-req.json') as { name: string; a: Req; b: Req; expect: boolean }[]) {
      expect(sameReq(v.a, v.b)).toBe(v.expect);
    }
  });

  it('computeTier fixtures', () => {
    for (const v of load('tier.json') as { fit: number; prob: number; expect: string }[]) {
      expect(computeTier(v.fit, v.prob)).toBe(v.expect);
    }
  });

  it('computeTier honors custom thresholds (Tiers & rules override)', () => {
    // fit 8 × prob 6 → ev 4.8: default B; but with a looser A gate it promotes to A.
    expect(computeTier(8, 6)).toBe('B');
    expect(computeTier(8, 6, { aEv: 4.5, aFit: 8, aProb: 6, bEv: 4.0 })).toBe('A');
    // stricter B floor demotes a default-B to C.
    expect(computeTier(7, 6)).toBe('B'); // ev 4.2 ≥ 4.0
    expect(computeTier(7, 6, { bEv: 5.0 })).toBe('C');
    // omitted fields fall back to defaults (partial override).
    expect(computeTier(9, 7, { aFit: 9 })).toBe('A'); // ev 6.3, fit 9 ≥ 9, prob 7 ≥ 6.5
    expect(computeTier(8.5, 7, { aFit: 9 })).toBe('B'); // fit 8.5 < 9 → fails A, ev 5.95 ≥ 4 → B
  });

  it('expectedValue is fit*prob/10 (1dp)', () => {
    expect(expectedValue({ fit: 8, prob: 7 })).toBe(5.6);
    expect(expectedValue({})).toBe(0);
  });

  it('reconcileSync (last-writer-wins) fixtures', () => {
    const deps: SyncDeps = { genId: () => 'gen-id', now: () => '2026-06-10T23:59:59.000Z' };
    type LwwCase = {
      name: string;
      server: Req[];
      client: Req[];
      expect: {
        len: number;
        applied: number;
        conflicts: number;
        idRemaps: number;
        rows?: { id: string; field: string; value: unknown }[];
      };
    };
    for (const v of load('lww.json') as LwwCase[]) {
      const r = reconcileSync(
        JSON.parse(JSON.stringify(v.server)),
        JSON.parse(JSON.stringify(v.client)),
        deps,
      );
      expect(r.rows.length).toBe(v.expect.len);
      expect(r.applied).toBe(v.expect.applied);
      expect(r.conflicts).toBe(v.expect.conflicts);
      expect(r.idRemaps.length).toBe(v.expect.idRemaps);
      for (const a of v.expect.rows || []) {
        const row = r.rows.find((x) => x.id === a.id);
        expect(row && row[a.field]).toBe(a.value);
      }
    }
  });
});
