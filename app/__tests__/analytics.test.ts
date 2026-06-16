import { pipelineMetrics, FUNNEL_STAGES } from '../src/analytics';
import type { Role, Status } from '../src/model';

const role = (status: Status, tier: Role['tier'] = 'B'): Role =>
  ({ id: Math.random().toString(), role: 'PM', company: 'Co', status, tier, score: 5, fit: 7, prob: 7, age: '' } as Role);

describe('pipelineMetrics', () => {
  it('zeroes cleanly with no roles', () => {
    const m = pipelineMetrics([]);
    expect(m.total).toBe(0);
    expect(m.everApplied).toBe(0);
    expect(m.respRate).toBe(0);
    expect(m.interviewToOffer).toBe(0);
    expect(m.funnel.map((s) => s.count)).toEqual([0, 0, 0, 0, 0]);
  });

  it('counts lanes, offers and tiers', () => {
    const roles = [
      role('Not Applied', 'A'),
      role('Applied', 'A'),
      role('Recruiter Screen', 'B'),
      role('Panel', 'B'),
      role('Offer', 'A'),
      role('Rejected', 'C'),
    ];
    const m = pipelineMetrics(roles);
    expect(m.open).toBe(1);
    expect(m.applied).toBe(1);
    expect(m.interviewing).toBe(3); // Recruiter Screen + Panel + Offer
    expect(m.offers).toBe(1);
    expect(m.rejected).toBe(1);
    expect(m.tiers).toEqual({ A: 3, B: 2, C: 1 });
  });

  it('computes conversion rates over ever-applied', () => {
    // everApplied = applied(1) + interviewing(2) + closed(1) = 4; advanced = 2; offers = 1
    const roles = [role('Applied'), role('Recruiter Screen'), role('Offer'), role('Rejected')];
    const m = pipelineMetrics(roles);
    expect(m.everApplied).toBe(4);
    expect(m.advanced).toBe(2);
    expect(m.respRate).toBe(50); // 2/4
    expect(m.interviewToOffer).toBe(50); // 1/2
    expect(m.offerRate).toBe(25); // 1/4
  });

  it('funnel is a snapshot in stage order', () => {
    const roles = [role('Applied'), role('Applied'), role('Hiring Manager')];
    const m = pipelineMetrics(roles);
    expect(m.funnel.map((s) => s.status)).toEqual(FUNNEL_STAGES);
    expect(m.funnel.find((s) => s.status === 'Applied')!.count).toBe(2);
    expect(m.funnel.find((s) => s.status === 'Hiring Manager')!.count).toBe(1);
  });
});
