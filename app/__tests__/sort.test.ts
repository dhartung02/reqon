import { sortRoles, applyFilters, activeFilterCount, EMPTY_FILTER, type Role } from '../src/model';

const role = (p: Partial<Role>): Role =>
  ({ id: Math.random().toString(), role: 'PM', company: 'Co', status: 'Not Applied', tier: 'B', score: 5, fit: 7, prob: 7, age: '', ...p } as Role);

describe('sortRoles — salary', () => {
  it('orders by top-of-band salary, descending', () => {
    const roles = [
      role({ company: 'Low', salary: '$150,000' }),
      role({ company: 'High', salary: '$220k–$260k' }),
      role({ company: 'Mid', salary: '$190,000' }),
    ];
    expect(sortRoles(roles, 'salary').map((r) => r.company)).toEqual(['High', 'Mid', 'Low']);
  });

  it('sorts roles with no parseable salary last', () => {
    const roles = [
      role({ company: 'None', salary: undefined }),
      role({ company: 'Equity', salary: 'Competitive + equity' }),
      role({ company: 'Paid', salary: '$200,000' }),
    ];
    expect(sortRoles(roles, 'salary')[0].company).toBe('Paid');
    expect(sortRoles(roles, 'salary').slice(1).map((r) => r.company).sort()).toEqual(['Equity', 'None']);
  });

  it('leaves the other sort keys unchanged', () => {
    const roles = [role({ company: 'B', fit: 6 }), role({ company: 'A', fit: 9 })];
    expect(sortRoles(roles, 'company').map((r) => r.company)).toEqual(['A', 'B']);
    expect(sortRoles(roles, 'fit').map((r) => r.fit)).toEqual([9, 6]);
  });
});

describe('applyFilters', () => {
  const roles = [
    role({ company: 'A', tier: 'A', conf: 'verified', location: 'Remote, US' }),
    role({ company: 'B', tier: 'B', conf: 'boardonly', location: 'New York, NY' }),
    role({ company: 'C', tier: 'C', conf: 'unverified', location: 'Remote' }),
    role({ company: 'U', tier: 'B', conf: 'verified', location: undefined }),
  ];

  it('no filters → everything passes', () => {
    expect(applyFilters(roles, EMPTY_FILTER)).toHaveLength(4);
  });
  it('noOnsite drops known on-site but keeps unknown locations', () => {
    const out = applyFilters(roles, { ...EMPTY_FILTER, noOnsite: true }).map((r) => r.company);
    expect(out).toEqual(['A', 'C', 'U']); // B (New York) dropped; U (no location) kept
  });
  it('verifiedOnly keeps only confirmed-live', () => {
    expect(applyFilters(roles, { ...EMPTY_FILTER, verifiedOnly: true }).map((r) => r.company)).toEqual(['A', 'U']);
  });
  it('hideTierC suppresses Tier C', () => {
    expect(applyFilters(roles, { ...EMPTY_FILTER, hideTierC: true }).every((r) => r.tier !== 'C')).toBe(true);
  });
  it('filters compose', () => {
    expect(applyFilters(roles, { noOnsite: true, verifiedOnly: true, hideTierC: true }).map((r) => r.company)).toEqual(['A', 'U']);
  });
  it('activeFilterCount counts enabled toggles', () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeFilterCount({ noOnsite: true, verifiedOnly: true, hideTierC: false })).toBe(2);
  });
});
