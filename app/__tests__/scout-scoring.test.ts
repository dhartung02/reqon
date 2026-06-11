// Locks the scout scoring port (app/src/scout/scoring.ts) against agent/scout.py's behavior.
import { isPmRole, remoteMode, usEligible, scoreFit, bandAdj, scoreProb } from '../src/scout/scoring';

describe('scout scoring — PM filter', () => {
  it('isPmRole', () => {
    expect(isPmRole('Senior Product Manager')).toBe(true);
    expect(isPmRole('Head of Product')).toBe(true);
    expect(isPmRole('Software Engineer')).toBe(false);
    expect(isPmRole('Product Marketing Manager')).toBe(false); // marketing excluded
    expect(isPmRole('Technical Program Manager')).toBe(false); // program manager excluded
  });
});

describe('scout scoring — location', () => {
  it('remoteMode', () => {
    expect(remoteMode('Remote, United States')).toBe('remote');
    expect(remoteMode('Hybrid - SF')).toBe('flex');
    expect(remoteMode('New York, NY')).toBe('onsite');
  });
  it('usEligible', () => {
    expect(usEligible('Remote, United States')).toBe(true);
    expect(usEligible('Remote, Ontario, Canada')).toBe(false); // foreign remote, no US
    expect(usEligible('')).toBe(true);
    expect(usEligible('Remote')).toBe(true); // plain remote allowed
    expect(usEligible('San Francisco, CA')).toBe(true);
  });
});

describe('scout scoring — fit / band / prob', () => {
  it('scoreFit tiers', () => {
    expect(scoreFit('Senior Product Manager, Data Platform', '')).toBe(8.5); // priority in title
    expect(scoreFit('CDP Data Platform Product Manager', '')).toBe(8.6); // 2 priority → +0.1
    expect(scoreFit('Product Manager, Catalog', '')).toBe(7.0); // secondary in title
    expect(scoreFit('Product Manager, Platform', '')).toBe(6.0); // generic only
    expect(scoreFit('Product Manager', '')).toBe(5.0); // nothing
    expect(scoreFit('Product Manager', 'we build a data platform and pipelines')).toBe(7.5); // 2 priority in body
  });
  it('bandAdj', () => {
    expect(bandAdj('Principal Product Manager')).toBe(0.5);
    expect(bandAdj('VP Product')).toBe(-1.5);
    expect(bandAdj('Senior Product Manager')).toBe(0);
    expect(bandAdj('Product Manager')).toBe(-0.5);
    expect(bandAdj('Staff Product Manager')).toBe(0);
  });
  it('scoreProb combines fit + band + remote', () => {
    expect(scoreProb(8.5, 'Senior Product Manager', 'remote', false)).toBe(8.0); // 7.5 + 0 + 0.5
    expect(scoreProb(8.5, 'Senior Product Manager', 'onsite', false)).toBe(5.5); // 7.5 + 0 - 2
    expect(scoreProb(8.5, 'Principal Product Manager', 'remote', true)).toBe(9.0); // capped at 9
  });
});
