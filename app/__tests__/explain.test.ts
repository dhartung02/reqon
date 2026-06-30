import { explainScore, remoteBadge } from '../src/scout/explain';
import type { Role } from '../src/model';

const role = (p: Partial<Role>): Role =>
  ({ id: 'x', role: 'Product Manager', company: 'Co', status: 'Not Applied', tier: 'B', score: 5, fit: 7, prob: 7, age: '', ...p } as Role);

describe('explainScore', () => {
  it('flags a strong domain match from a priority keyword in the title', () => {
    const lines = explainScore(role({ role: 'Principal Product Manager, CDP', location: 'Remote, US', tier: 'A', fit: 9, prob: 7, score: 6.3 }));
    expect(lines[0].text).toMatch(/Strong domain match/);
    expect(lines[0].tone).toBe('good');
  });

  it('falls back to "from the job description" when the title has no domain term but fit is high', () => {
    const lines = explainScore(role({ role: 'Senior Product Manager', fit: 7.5 }));
    expect(lines[0].text).toMatch(/job description/);
    expect(lines[0].tone).toBe('neutral');
  });

  it('marks below-target seniority and on-site as negatives', () => {
    const lines = explainScore(role({ role: 'Product Manager, Operations', location: 'New York, NY', fit: 5, score: 3.5 }));
    const texts = lines.map((l) => l.text).join(' | ');
    expect(texts).toMatch(/Below target seniority/);
    expect(texts).toMatch(/On-site — penalized/);
    expect(lines.some((l) => l.tone === 'bad')).toBe(true);
  });

  it('always explains the tier via expected value', () => {
    const lines = explainScore(role({ tier: 'B', fit: 7, prob: 7, score: 4.9 }));
    expect(lines[lines.length - 1].text).toMatch(/Possible match — expected value 4\.9/);
  });
});

describe('remoteBadge', () => {
  it('maps location to a posture badge', () => {
    expect(remoteBadge('Remote, United States')).toEqual({ label: 'Remote', tone: 'good' });
    expect(remoteBadge('Hybrid - SF')).toEqual({ label: 'Hybrid', tone: 'neutral' });
    expect(remoteBadge('New York, NY')).toEqual({ label: 'On-site', tone: 'bad' });
  });
  it('returns null for an unknown location', () => {
    expect(remoteBadge('')).toBeNull();
    expect(remoteBadge(undefined)).toBeNull();
    expect(remoteBadge('   ')).toBeNull();
  });
});
