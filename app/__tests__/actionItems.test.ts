import { computeActions, groupActions } from '../src/actionItems';
import type { Role } from '../src/model';

// Minimal Role factory for the pure action-item logic (P2.3).
const role = (p: Partial<Role>): Role => ({
  id: p.id || Math.random().toString(36).slice(2),
  role: p.role || 'PM', company: p.company || 'Acme', status: p.status || 'Not Applied',
  tier: p.tier || 'C', score: p.score ?? 0, fit: p.fit ?? 0, prob: p.prob ?? 0, age: '',
  ...p,
});
const types = (a: ReturnType<typeof computeActions>) => a.map((x) => x.type);

describe('computeActions (app Today action queue, P2.3)', () => {
  it('flags apply_next for a strong verified unapplied role', () => {
    const a = computeActions([role({ id: '1', status: 'Not Applied', tier: 'A', conf: 'verified', score: 8, fit: 9, prob: 7 })]);
    const ap = a.filter((x) => x.type === 'apply_next');
    expect(ap).toHaveLength(1);
    expect(ap[0].priority).toBeGreaterThan(60);
  });

  it('raises review actions for interview + offer stages, offer ranked higher', () => {
    const a = computeActions([
      role({ id: '1', status: 'Panel' }),
      role({ id: '2', status: 'Offer' }),
    ]);
    expect(types(a)).toContain('review_interview');
    expect(types(a)).toContain('review_offer');
    const off = a.find((x) => x.type === 'review_offer')!;
    const intv = a.find((x) => x.type === 'review_interview')!;
    expect(off.priority).toBeGreaterThan(intv.priority);
  });

  it('flags needs_scoring + verify_role for an unscored lead', () => {
    const a = computeActions([role({ id: '1', status: 'Not Applied', fit: 0, prob: 0, conf: 'unverified', reqCheck: 'lead' })]);
    expect(types(a)).toContain('needs_scoring');
    expect(types(a)).toContain('verify_role');
  });

  it('detects duplicates once per company+role group', () => {
    const a = computeActions([
      role({ id: '1', company: 'Acme', role: 'Senior PM', status: 'Not Applied' }),
      role({ id: '2', company: 'ACME', role: 'senior pm', status: 'Not Applied' }),
    ]);
    expect(a.filter((x) => x.type === 'duplicate_review')).toHaveLength(1);
  });

  it('sorts by priority desc and groups into non-empty sections', () => {
    const a = computeActions([
      role({ id: '1', status: 'Offer' }),
      role({ id: '2', status: 'Not Applied', tier: 'A', conf: 'verified', score: 8, fit: 9, prob: 7 }),
    ]);
    for (let i = 1; i < a.length; i++) expect(a[i - 1].priority).toBeGreaterThanOrEqual(a[i].priority);
    const groups = groupActions(a);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });
});
