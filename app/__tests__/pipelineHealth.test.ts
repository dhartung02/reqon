import { pipelineHealth } from '../src/pipelineHealth';
import type { Role } from '../src/model';

const role = (p: Partial<Role>): Role => ({
  id: p.id || Math.random().toString(36).slice(2),
  role: p.role || 'PM', company: p.company || 'Acme', status: p.status || 'Not Applied',
  tier: p.tier || 'C', score: p.score ?? 0, fit: p.fit ?? 0, prob: p.prob ?? 0, age: '', ...p,
});

describe('pipelineHealth (app analytics, P1.6)', () => {
  it('healthy pipeline → Good with apply recommendation', () => {
    const rows: Role[] = [];
    for (let i = 0; i < 5; i++) rows.push(role({ status: 'Not Applied', tier: 'A', conf: 'verified', score: 7.2 }));
    rows.push(role({ status: 'Applied', applied: new Date().toISOString().slice(0, 10) }));
    const h = pipelineHealth(rows);
    expect(h.band).toBe('Good');
    expect(h.metrics.applyReady).toBeGreaterThanOrEqual(5);
    expect(h.recommendations.some((r) => /Apply to your top/.test(r))).toBe(true);
  });

  it('empty pipeline → At risk, recommends finding new jobs', () => {
    const h = pipelineHealth([]);
    expect(h.band).toBe('At risk');
    expect(h.recommendations.some((r) => /find new jobs/i.test(r))).toBe(true);
  });

  it('computes response rate from applied total', () => {
    const today = new Date().toISOString().slice(0, 10);
    const h = pipelineHealth([
      role({ status: 'Panel', applied: today }),
      role({ status: 'Applied', applied: today }),
    ]);
    expect(h.metrics.appliedTotal).toBe(2);
    expect(h.metrics.responseRate).toBe(50);
  });
});
