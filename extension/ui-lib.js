(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined') module.exports = api;
  if (root) root.reqonUiLib = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function popupHeadingForRow(row) {
    return row ? 'Tracked on your board' : 'Clip this job';
  }

  function isBestBetRow(row) {
    if (!row) return false;
    if (String(row.status || '') !== 'Not Applied') return false;
    if (String(row.conf || '') !== 'verified') return false;
    return !['closed', 'lead', 'unknown'].includes(String(row.reqCheck || ''));
  }

  function buildAiUsageViewModel(usage) {
    const u = usage || {};
    const today = u.today || {};
    const plan = u.plan || {};
    const tierLabel = u.tierLabel || (plan.owner ? 'Owner' : plan.pro ? 'Local Pro' : plan.ai ? 'AI' : 'your plan');
    const calls = today.calls || 0;
    const cap = today.cap || 0;
    const unlimited = !cap;
    if (unlimited) {
      return {
        unlimited: true,
        countText: `${calls} used today`,
        helperText: `Unlimited on your ${tierLabel} plan. Usage is shown for transparency only.`,
        pct: 0,
        tone: '',
      };
    }
    const pct = Math.min(100, Math.round((calls / cap) * 100));
    return {
      unlimited: false,
      countText: `${calls} / ${cap}`,
      helperText: 'Each AI draft, score, autofill, or match counts as one request.',
      pct,
      tone: pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '',
    };
  }

  return { popupHeadingForRow, isBestBetRow, buildAiUsageViewModel };
}));
