// Locks the Today lane predicates (app/src/today.ts) against the web's daily-loop logic.
import { needsVerify, followUpDue, closedReq, isApplyNext, tierANotApplied, todayActionCount, setFollowupDays } from '../src/today';
import type { Role } from '../src/model';

// Minimal Role builder — only the fields the predicates read.
const role = (p: Partial<Role>): Role =>
  ({ id: 'x', role: 'PM', company: 'Co', status: 'Not Applied', tier: 'B', score: 5, fit: 7, prob: 7, age: '', ...p } as Role);

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

describe('today predicates', () => {
  it('needsVerify', () => {
    expect(needsVerify(role({ status: 'Not Applied', conf: 'unverified' }))).toBe(true);
    expect(needsVerify(role({ status: 'Not Applied', reqCheck: 'lead' }))).toBe(true);
    expect(needsVerify(role({ status: 'Applied', conf: 'unverified' }))).toBe(false);
    expect(needsVerify(role({ status: 'Not Applied', conf: 'verified' }))).toBe(false);
  });
  it('followUpDue (7d, active statuses)', () => {
    expect(followUpDue(role({ status: 'Applied', applied: isoDaysAgo(10) }))).toBe(true);
    expect(followUpDue(role({ status: 'Applied', applied: isoDaysAgo(2) }))).toBe(false);
    expect(followUpDue(role({ status: 'Not Applied', applied: isoDaysAgo(10) }))).toBe(false);
    expect(followUpDue(role({ status: 'Applied', lastcontact: isoDaysAgo(1), applied: isoDaysAgo(30) }))).toBe(false);
  });
  it('followUpDue honors a tuned threshold (Tiers & rules), then resets to 7', () => {
    const r = role({ status: 'Applied', applied: isoDaysAgo(5) });
    expect(followUpDue(r)).toBe(false); // 5d < default 7d
    setFollowupDays(3);
    expect(followUpDue(r)).toBe(true); // 5d ≥ 3d
    setFollowupDays(undefined); // back to default for the rest of the suite
    expect(followUpDue(r)).toBe(false);
  });
  it('closedReq / tierANotApplied', () => {
    expect(closedReq(role({ reqCheck: 'closed' }))).toBe(true);
    expect(closedReq(role({ reqCheck: 'open' }))).toBe(false);
    expect(tierANotApplied(role({ tier: 'A', status: 'Not Applied' }))).toBe(true);
    expect(tierANotApplied(role({ tier: 'A', status: 'Applied' }))).toBe(false);
  });
  it('isApplyNext (tier A/B · verified · open · not applied)', () => {
    expect(isApplyNext(role({ tier: 'A', conf: 'verified', reqCheck: 'open', status: 'Not Applied' }))).toBe(true);
    expect(isApplyNext(role({ tier: 'C', conf: 'verified', reqCheck: 'open', status: 'Not Applied' }))).toBe(false);
    expect(isApplyNext(role({ tier: 'A', conf: 'boardonly', reqCheck: 'open', status: 'Not Applied' }))).toBe(false);
    expect(isApplyNext(role({ tier: 'A', conf: 'verified', reqCheck: 'closed', status: 'Not Applied' }))).toBe(false);
  });
  it('todayActionCount = needsVerify + followUpDue + closedReq', () => {
    const roles = [
      role({ status: 'Not Applied', conf: 'unverified' }), // needsVerify
      role({ status: 'Applied', applied: isoDaysAgo(10) }), // followUpDue
      role({ reqCheck: 'closed' }), // closedReq
      role({ tier: 'A', conf: 'verified', reqCheck: 'open' }), // none of the three
    ];
    expect(todayActionCount(roles)).toBe(3);
  });
});
