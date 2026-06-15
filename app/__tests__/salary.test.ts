import { parseMaxSalary, belowSalaryFloor } from '../src/scout/salary';

describe('parseMaxSalary', () => {
  it('returns null when no salary present', () => {
    expect(parseMaxSalary('Great PM role, remote, equity.')).toBeNull();
    expect(parseMaxSalary('')).toBeNull();
    expect(parseMaxSalary(undefined)).toBeNull();
  });

  it('parses $NNN,NNN figures', () => {
    expect(parseMaxSalary('Base salary $185,000 plus bonus')).toBe(185000);
  });

  it('parses $NNNk shorthand', () => {
    expect(parseMaxSalary('Comp: $180k base')).toBe(180000);
  });

  it('returns the top of a posted range', () => {
    expect(parseMaxSalary('$150,000 – $200,000 USD')).toBe(200000);
    expect(parseMaxSalary('$150k to $210k')).toBe(210000);
  });

  it('ignores small numbers (hourly / other noise)', () => {
    expect(parseMaxSalary('15 days PTO, 401k match')).toBeNull();
  });
});

describe('belowSalaryFloor', () => {
  it('keeps everything when no floor set', () => {
    expect(belowSalaryFloor('$120,000', 0)).toBe(false);
  });

  it('keeps roles with unknown salary', () => {
    expect(belowSalaryFloor('Remote PM, equity', 200000)).toBe(false);
  });

  it('skips a role clearly below the floor', () => {
    expect(belowSalaryFloor('$150,000 base', 200000)).toBe(true);
  });

  it('keeps a role at or above the floor', () => {
    expect(belowSalaryFloor('$220,000 base', 200000)).toBe(false);
    expect(belowSalaryFloor('$150k–$210k', 200000)).toBe(false);
  });
});
