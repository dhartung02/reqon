function recognizedJobPage(url) {
  if (!url || typeof detectATS !== 'function') return false;
  return detectATS(url).applyMode !== 'Unknown';
}

function deriveAssistantMode({ activeTab, pageContext }) {
  const tabUrl = activeTab && activeTab.url ? String(activeTab.url) : '';
  const context = pageContext && (!pageContext.url || pageContext.url === tabUrl) ? pageContext : null;
  if (context && context.recognized) {
    if (context.row) return { mode: 'tracked-job', row: context.row, recognized: true };
    return { mode: 'job', row: null, recognized: true };
  }
  if (recognizedJobPage(tabUrl)) return { mode: 'job', row: null, recognized: true };
  return { mode: 'today', row: null, recognized: false };
}

function buildTrackedRoleCards(row) {
  const status = row && row.status ? row.status : 'Not Applied';
  const fit = row && row.fit != null ? row.fit : '—';
  return [
    { id: 'tracked-summary', title: 'Tracked role summary', detail: `Status ${status} · Fit ${fit}` },
    { id: 'continue-application', title: 'Continue application', detail: 'Use autofill and resume-match helpers on this posting.' },
    { id: 'review-update', title: 'Review and update', detail: 'Check status, notes, and follow-up timing before moving on.' },
  ];
}

const api = { deriveAssistantMode, buildTrackedRoleCards };

if (typeof module !== 'undefined') module.exports = api;
if (typeof self !== 'undefined') self.reqonSidepanelMode = api;
