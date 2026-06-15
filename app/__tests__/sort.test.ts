import { sortRoles, type Role } from '../src/model';

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
