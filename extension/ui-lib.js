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

  function summarizeFillAvailability({ total = 0, direct = 0, ai = 0, remaining = 0 }) {
    const filled = Math.max(0, direct + ai);
    return `Filled ${filled} of ${total} fields: ${direct} direct, ${ai} AI-assisted, ${remaining} still need review.`;
  }

  function buildBannerModel({ row, pageState }) {
    const state = pageState || {};
    const tracked = !!row;
    const fillable = !!state.fillable;
    const recognized = !!state.recognized;
    const fitValue = tracked ? row.fit : state.fit;
    const fit = fitValue == null || fitValue === '' ? '—' : String(fitValue);
    const status = tracked ? (row.status || 'Not Applied') : (recognized ? 'Open role' : 'Page not recognized');
    let primaryCta = 'Review job';
    if (tracked) primaryCta = fillable ? 'Continue application' : 'Review status';
    else if (recognized && fillable) primaryCta = 'Start guided fill';
    const fillLabel = fillable ? 'Fill available' : (recognized ? 'Review needed' : 'Job page not detected');
    return {
      mode: tracked ? 'tracked' : 'untracked',
      primaryCta,
      secondaryCta: tracked ? 'Open board' : 'Track role',
      summaryText: `${tracked ? 'Tracked' : 'Untracked'} • ${status} • Fit ${fit}/10 • ${fillLabel}`,
      fitText: `Fit ${fit}/10`,
      statusText: status,
      fillText: fillLabel,
    };
  }

  return {
    popupHeadingForRow,
    isBestBetRow,
    buildAiUsageViewModel,
    summarizeFillAvailability,
    buildBannerModel,
  };
}));
