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

  function buildKeywordInsightModel({ matched = [], missing = [] } = {}) {
    return {
      matched: Array.from(new Set((matched || []).filter(Boolean))),
      missing: Array.from(new Set((missing || []).filter(Boolean))),
      hasGaps: Array.isArray(missing) && missing.filter(Boolean).length > 0,
    };
  }

  function explainFitGap({ fit, keywordCoverage, reasons = [] } = {}) {
    const parts = Array.isArray(reasons) ? reasons.filter(Boolean) : [];
    const because = parts.length
      ? parts.join(', ')
      : 'Reqon also weighs domain alignment, seniority, and remote fit alongside the keywords on the page';
    return `Fit ${fit}/10 with ${keywordCoverage}% keyword coverage because ${because}.`;
  }

  function buildUpdateCheckViewModel(result) {
    if (result && result.status === 'update_available') return { tone: 'ok', label: 'Update ready when Chrome goes idle' };
    if (result && result.status === 'throttled') return { tone: 'warn', label: 'Update check throttled' };
    return { tone: 'neutral', label: 'Reqon is up to date' };
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

  function ev(row) {
    return Math.round(((+row.fit || 0) * (+row.prob || 0) / 10) * 10) / 10;
  }

  function tierRank(tier) {
    return ({ A: 0, B: 1, C: 2 }[String(tier || 'C').toUpperCase()] ?? 3);
  }

  function compareReadyRows(a, b) {
    const tierDelta = tierRank(a && a.tier) - tierRank(b && b.tier);
    if (tierDelta) return tierDelta;
    const evDelta = ev(b || {}) - ev(a || {});
    if (evDelta) return evDelta;
    const fitDelta = (+b.fit || 0) - (+a.fit || 0);
    if (fitDelta) return fitDelta;
    return String((a && a.company) || '').localeCompare(String((b && b.company) || ''));
  }

  function compareByDate(field) {
    return (a, b) => {
      const at = Date.parse(a && a[field]);
      const bt = Date.parse(b && b[field]);
      const av = Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
      const bv = Number.isNaN(bt) ? Number.POSITIVE_INFINITY : bt;
      if (av !== bv) return av - bv;
      return compareReadyRows(a || {}, b || {});
    };
  }

  function isInProgressStatus(status) {
    return /^(Applied|Recruiter Screen|Hiring Manager|Panel|Offer)$/.test(String(status || ''));
  }

  function isClosedStatus(status) {
    return /^(Rejected|Archived)$/.test(String(status || ''));
  }

  function buildTodayBuckets(rows) {
    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
    const readyToApply = list.filter(isBestBetRow).sort(compareReadyRows);
    const inProgress = list.filter((row) => isInProgressStatus(row && row.status)).sort(compareByDate('followup'));
    const needsFollowUp = list
      .filter((row) => row && row.followup && !isClosedStatus(row.status))
      .sort(compareByDate('followup'));

    return {
      defaultSection: { id: 'ready-to-apply', title: 'Ready to apply' },
      readyToApply,
      inProgress,
      needsFollowUp,
    };
  }

  return {
    popupHeadingForRow,
    isBestBetRow,
    buildAiUsageViewModel,
    summarizeFillAvailability,
    buildKeywordInsightModel,
    buildUpdateCheckViewModel,
    explainFitGap,
    buildBannerModel,
    buildTodayBuckets,
  };
}));
