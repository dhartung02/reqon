'use strict';

function effectiveAssistDailyCap(plan, configuredCap) {
  const cap = Math.max(0, parseInt(configuredCap, 10) || 0);
  if (plan && (plan.owner || plan.pro || plan.ai)) return 0;
  return cap;
}

module.exports = { effectiveAssistDailyCap };
