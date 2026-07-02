# Extension Experience Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Reqon extension around a hybrid page banner plus floating assistant, a Today-first toolbar workflow, tracked-role-first job context, and a store-safe cloud configuration/update model.

**Architecture:** Keep the Chrome extension as a stable MV3 shell while moving presentation order, feature flags, and assistant composition into a cloud-configured experience model fetched through `bg.js`. Use `content.js` for page detection, banner state, question indexing, and highlight navigation; use `sidepanel.js` as a mode-aware assistant renderer that can switch between Today mode, job mode, and tracked-role mode without reopening.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JS, Node `node:test`, existing Reqon server routes in `server.js`, existing extension service worker/content script/side panel architecture.

---

## File structure

- Modify: `extension/bg.js`
  - Add cached experience-config fetch, richer page-context messaging, manual update-check plumbing, and reactive tab-to-panel refresh broadcasting.
- Modify: `extension/content.js`
  - Replace the current compact overlay with banner mode, question grouping/indexing, scroll/highlight actions, and richer autofill summary payloads.
- Modify: `extension/overlay.css`
  - Restyle the page-layer UI into a floating banner plus elevated assistant treatment.
- Modify: `extension/sidepanel.js`
  - Turn the panel into a mode-aware renderer for Today mode, job mode, and tracked-role mode; hydrate when the active tab becomes a job page.
- Modify: `extension/sidepanel.html`
  - Update the shell markup to support Today mode sections, tracked-role summary, guided apply sections, and a softer elevated visual frame.
- Modify: `extension/ui-lib.js`
  - Centralize derived view models for banner state, Today buckets, autofill summaries, keyword views, and tracked-role priority cards.
- Modify: `extension/popup.html`
  - Add a lightweight “check for update” affordance and optional “open Today” launch wording.
- Modify: `extension/popup.js`
  - Wire the update-check action and keep popup labels aligned with tracked/untracked language.
- Modify: `extension/options.html`
  - Add extension experience diagnostics if needed, including last config fetch / current experience version.
- Modify: `extension/options.js`
  - Surface update-check feedback and possibly config-cache status.
- Modify: `server.js`
  - Add a small extension-experience endpoint that returns versioned config/flags and optional UI ordering metadata, plus any update metadata needed by the extension shell.
- Modify: `tests/assist-usage.test.js`
  - Only if server config logic shares plan/usage presentation behavior.
- Modify: `extension/tests/ui-lib.test.js`
  - Add tests for tracked-role summaries, Today buckets, banner CTA rules, and autofill summary formatting.
- Modify: `extension/tests/lib.test.js`
  - Add tests for question grouping and supported field classification helpers if those stay in `lib.js`.
- Create: `extension/tests/content-banner.test.js`
  - Add isolated tests for banner/view-model behavior extracted from `content.js`.
- Create: `extension/tests/bg-experience.test.js`
  - Add tests for experience config caching, update checks, and event broadcasting extracted from `bg.js`.
- Create: `extension/tests/sidepanel-mode.test.js`
  - Add tests for Today/job/tracked mode rendering helpers extracted from `sidepanel.js`.

## Task 1: Add the cloud-configured experience model

**Files:**
- Modify: `server.js`
- Modify: `extension/bg.js`
- Modify: `extension/options.js`
- Test: `extension/tests/bg-experience.test.js`

- [ ] **Step 1: Write the failing tests for experience-config caching and update checks**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExperienceCache, shouldBroadcastPageContext, normalizeUpdateCheckResult } from '../bg-experience.js';

test('buildExperienceCache reuses fresh config payloads for 60 seconds', () => {
  const now = 1_720_000_000_000;
  const cache = buildExperienceCache({ ttlMs: 60_000, now: () => now });
  cache.set({ version: '2026-07-01', sections: ['today', 'job'] });

  assert.deepStrictEqual(cache.get(), { version: '2026-07-01', sections: ['today', 'job'] });
  assert.equal(cache.isFresh(), true);
});

test('normalizeUpdateCheckResult surfaces human-safe update states', () => {
  assert.deepStrictEqual(normalizeUpdateCheckResult('update_available'), {
    ok: true,
    status: 'update_available',
    message: 'Reqon update available. Chrome will install it when the extension is idle.'
  });
  assert.deepStrictEqual(normalizeUpdateCheckResult('no_update'), {
    ok: true,
    status: 'no_update',
    message: 'Reqon is already up to date.'
  });
});

test('shouldBroadcastPageContext only emits when the active job context meaningfully changes', () => {
  const prev = { mode: 'today', pageKey: '' };
  const next = { mode: 'job', pageKey: 'reddit|senior-group-product-manager' };

  assert.equal(shouldBroadcastPageContext(prev, next), true);
  assert.equal(shouldBroadcastPageContext(next, next), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test extension/tests/bg-experience.test.js
```

Expected:

```text
ERR_MODULE_NOT_FOUND
```

- [ ] **Step 3: Add a small background helper module for config caching and update-state normalization**

```js
// extension/bg-experience.js
function buildExperienceCache({ ttlMs = 60_000, now = () => Date.now() } = {}) {
  let payload = null;
  let at = 0;
  return {
    get() { return payload; },
    set(next) { payload = next; at = now(); },
    isFresh() { return !!payload && (now() - at) < ttlMs; },
    clear() { payload = null; at = 0; }
  };
}

function shouldBroadcastPageContext(prev, next) {
  return !prev || !next || prev.mode !== next.mode || prev.pageKey !== next.pageKey;
}

function normalizeUpdateCheckResult(status) {
  if (status === 'update_available') {
    return { ok: true, status, message: 'Reqon update available. Chrome will install it when the extension is idle.' };
  }
  if (status === 'throttled') {
    return { ok: false, status, message: 'Chrome throttled the update check. Try again in a little while.' };
  }
  return { ok: true, status: 'no_update', message: 'Reqon is already up to date.' };
}

if (typeof module !== 'undefined') module.exports = {
  buildExperienceCache,
  shouldBroadcastPageContext,
  normalizeUpdateCheckResult
};
```

- [ ] **Step 4: Add the server endpoint and background message handlers**

```js
// server.js
app.get('/api/extension/experience', (req, res) => {
  res.json({
    ok: true,
    version: '2026-07-01',
    banner: {
      compactFields: ['tracked', 'status', 'fit', 'fillAvailability'],
      trackedPrimary: 'continue_or_review',
      untrackedPrimary: 'start_guided_fill'
    },
    today: {
      defaultQueue: 'ready_to_apply',
      showSections: ['ready_to_apply', 'in_progress', 'needs_follow_up', 'best_bets', 'pipeline_snapshot']
    },
    jobSections: {
      tracked: ['tracked_summary', 'continue_application', 'review_update', 'keywords', 'autofill', 'captured_details', 'open_board'],
      untracked: ['role_summary', 'track_role', 'fit_keywords', 'fill_availability', 'captured_details', 'open_board']
    },
    updates: {
      mode: 'chrome_web_store',
      canRequestCheck: true
    }
  });
});
```

```js
// extension/bg.js
importScripts('lib.js', 'bg-experience.js');

const experienceCache = buildExperienceCache();

async function getExperience(force) {
  if (!force && experienceCache.isFresh()) return experienceCache.get();
  const payload = await api('/api/extension/experience');
  experienceCache.set(payload);
  return payload;
}

async function requestUpdateCheck() {
  return new Promise((resolve) => {
    chrome.runtime.requestUpdateCheck((status) => {
      resolve(normalizeUpdateCheckResult(status));
    });
  });
}
```

- [ ] **Step 5: Expose the new messages and options diagnostics**

```js
// extension/bg.js inside onMessage
} else if (msg.type === 'experienceConfig') {
  sendResponse(await getExperience(!!msg.force));
} else if (msg.type === 'requestUpdateCheck') {
  sendResponse(await requestUpdateCheck());
}
```

```js
// extension/options.js
async function loadExperienceMeta() {
  const r = await new Promise((res) => chrome.runtime.sendMessage({ type: 'experienceConfig' }, res));
  if (!r || !r.ok) return;
  const meta = document.getElementById('experienceMeta');
  if (meta) meta.textContent = `Experience config ${r.version} loaded from Reqon Cloud.`;
}
```

- [ ] **Step 6: Run the targeted tests**

Run:

```bash
node --test extension/tests/bg-experience.test.js
```

Expected:

```text
# pass 3
```

- [ ] **Step 7: Commit**

```bash
git add server.js extension/bg.js extension/options.js extension/bg-experience.js extension/tests/bg-experience.test.js
git commit -m "feat: add extension experience config and update checks"
```

## Task 2: Replace the compact overlay with banner mode

**Files:**
- Modify: `extension/content.js`
- Modify: `extension/overlay.css`
- Modify: `extension/ui-lib.js`
- Test: `extension/tests/content-banner.test.js`

- [ ] **Step 1: Write the failing tests for banner state and CTA rules**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBannerModel, summarizeFillAvailability } from '../ui-lib.js';

test('buildBannerModel prioritizes tracked role summary for tracked pages', () => {
  const model = buildBannerModel({
    row: { company: 'Reddit', role: 'Senior Group Product Manager', status: 'Applied', fit: 6 },
    pageState: { recognized: true, fillable: true }
  });

  assert.equal(model.mode, 'tracked');
  assert.equal(model.primaryCta, 'Continue application');
  assert.match(model.summaryText, /Tracked/);
  assert.match(model.summaryText, /Applied/);
});

test('buildBannerModel leads with guided fill for untracked pages', () => {
  const model = buildBannerModel({
    row: null,
    pageState: { recognized: true, fillable: true, fit: 7 }
  });

  assert.equal(model.mode, 'untracked');
  assert.equal(model.primaryCta, 'Start guided fill');
});

test('summarizeFillAvailability explains deterministic and AI assisted counts', () => {
  assert.equal(
    summarizeFillAvailability({ total: 18, direct: 8, ai: 3, remaining: 7 }),
    'Filled 11 of 18 fields: 8 direct, 3 AI-assisted, 7 still need review.'
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test extension/tests/content-banner.test.js
```

Expected:

```text
TypeError: buildBannerModel is not a function
```

- [ ] **Step 3: Add the banner view-model helpers**

```js
// extension/ui-lib.js
function summarizeFillAvailability({ total = 0, direct = 0, ai = 0, remaining = 0 }) {
  return `Filled ${direct + ai} of ${total} fields: ${direct} direct, ${ai} AI-assisted, ${remaining} still need review.`;
}

function buildBannerModel({ row, pageState }) {
  const tracked = !!row;
  const fillable = !!(pageState && pageState.fillable);
  const fit = tracked ? (row.fit ?? '—') : (pageState && pageState.fit != null ? pageState.fit : '—');
  const status = tracked ? (row.status || 'Not Applied') : 'Open role';
  return {
    mode: tracked ? 'tracked' : 'untracked',
    primaryCta: tracked ? (fillable ? 'Continue application' : 'Review status') : 'Start guided fill',
    secondaryCta: 'Expand',
    summaryText: `${tracked ? 'Tracked' : 'Untracked'} • ${status} • Fit ${fit}/10${fillable ? ' • Fill available' : ''}`
  };
}

module.exports = Object.assign(module.exports || {}, {
  summarizeFillAvailability,
  buildBannerModel
});
```

- [ ] **Step 4: Render the new banner in the content script**

```js
// extension/content.js
function renderBanner(model) {
  const root = ensureOverlayRoot();
  root.innerHTML = `
    <div class="rq-banner" data-mode="${model.mode}">
      <div class="rq-banner-summary">${model.summaryText}</div>
      <div class="rq-banner-actions">
        <button class="rq-btn rq-btn-primary" data-action="primary">${model.primaryCta}</button>
        <button class="rq-btn rq-btn-ghost" data-action="expand">${model.secondaryCta}</button>
      </div>
    </div>
  `;
}
```

```css
/* extension/overlay.css */
.rq-banner {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 2147483000;
  max-width: 380px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(250, 252, 255, 0.96);
  border: 1px solid rgba(13, 26, 38, 0.08);
  box-shadow: 0 16px 48px rgba(13, 26, 38, 0.18);
  backdrop-filter: blur(18px);
}
```

- [ ] **Step 5: Wire the banner to current page lookup and fill summary updates**

```js
// extension/content.js
async function refreshBannerState() {
  const meta = captureMeta();
  const lookup = await send({ type: 'lookup', url: location.href, force: false });
  const model = reqonUiLib.buildBannerModel({
    row: lookup && lookup.row,
    pageState: { recognized: !!meta.job, fillable: detectFillableSurface(), fit: lookup && lookup.row ? lookup.row.fit : null }
  });
  renderBanner(model);
}

function renderFillSummary(res) {
  const summary = reqonUiLib.summarizeFillAvailability({
    total: res.total || (res.factual + res.answered + res.resume + res.remaining || 0),
    direct: (res.factual || 0) + (res.resume || 0),
    ai: res.ai || 0,
    remaining: res.remaining || 0
  });
  setBannerMessage(summary);
}
```

- [ ] **Step 6: Run the targeted tests**

Run:

```bash
node --test extension/tests/content-banner.test.js extension/tests/ui-lib.test.js
```

Expected:

```text
# pass
```

- [ ] **Step 7: Commit**

```bash
git add extension/content.js extension/overlay.css extension/ui-lib.js extension/tests/content-banner.test.js extension/tests/ui-lib.test.js
git commit -m "feat: add page banner mode for extension job pages"
```

## Task 3: Make the assistant reactive and mode-aware

**Files:**
- Modify: `extension/bg.js`
- Modify: `extension/sidepanel.js`
- Modify: `extension/sidepanel.html`
- Test: `extension/tests/sidepanel-mode.test.js`

- [ ] **Step 1: Write the failing tests for Today/job/tracked mode selection**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAssistantMode, buildTrackedRoleCards } from '../sidepanel-mode.js';

test('deriveAssistantMode returns today when no job page is active', () => {
  assert.equal(deriveAssistantMode({ activeTab: { url: 'https://www.google.com/' }, pageContext: null }).mode, 'today');
});

test('deriveAssistantMode returns tracked-job when a matched row is present', () => {
  const mode = deriveAssistantMode({
    activeTab: { url: 'https://job-boards.greenhouse.io/reddit/jobs/7858506' },
    pageContext: { recognized: true, row: { company: 'Reddit', role: 'Senior Group Product Manager', status: 'Applied' } }
  });
  assert.equal(mode.mode, 'tracked-job');
});

test('buildTrackedRoleCards orders tracked summary before continue and review', () => {
  const cards = buildTrackedRoleCards({ status: 'Applied', fit: 6 });
  assert.deepStrictEqual(cards.map((card) => card.id), [
    'tracked-summary',
    'continue-application',
    'review-update'
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test extension/tests/sidepanel-mode.test.js
```

Expected:

```text
ERR_MODULE_NOT_FOUND
```

- [ ] **Step 3: Extract a side panel mode helper**

```js
// extension/sidepanel-mode.js
function deriveAssistantMode({ activeTab, pageContext }) {
  if (!pageContext || !pageContext.recognized) return { mode: 'today' };
  if (pageContext.row) return { mode: 'tracked-job', row: pageContext.row };
  return { mode: 'job', row: null };
}

function buildTrackedRoleCards(row) {
  return [
    { id: 'tracked-summary', title: `Tracked role summary`, status: row.status || 'Not Applied' },
    { id: 'continue-application', title: 'Continue application' },
    { id: 'review-update', title: 'Review and update' }
  ];
}

if (typeof module !== 'undefined') module.exports = { deriveAssistantMode, buildTrackedRoleCards };
```

- [ ] **Step 4: Broadcast page-context changes from the background worker**

```js
// extension/bg.js
let lastPageContext = null;

async function computePageContext(tab) {
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) return { mode: 'today', pageKey: '' };
  const row = matchRow(await getRows(false), tab.url);
  return {
    recognized: isSupportedJobUrl(tab.url),
    row,
    mode: row ? 'tracked-job' : (isSupportedJobUrl(tab.url) ? 'job' : 'today'),
    pageKey: row ? reqKey(row) : tab.url
  };
}

async function broadcastPageContext(tabId, tab) {
  const next = await computePageContext(tab);
  if (!shouldBroadcastPageContext(lastPageContext, next)) return;
  lastPageContext = next;
  chrome.runtime.sendMessage({ type: 'pageContextChanged', context: next });
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  broadcastPageContext(tabId, tab);
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete') broadcastPageContext(tabId, tab);
});
```

- [ ] **Step 5: Rework the side panel into Today/job/tracked render paths**

```js
// extension/sidepanel.js
let pageContext = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'pageContextChanged') {
    pageContext = msg.context;
    refresh();
  }
});

function renderTodayMode(rows) {
  $('page').innerHTML = renderTodayWorkspace(rows);
}

function renderTrackedJobMode(row) {
  const cards = buildTrackedRoleCards(row);
  $('page').innerHTML = `
    <section class="assist-shell assist-shell-floating">
      ${cards.map(renderTrackedCard).join('')}
      <div id="jobKeywordSection"></div>
      <div id="jobAutofillSection"></div>
    </section>
  `;
}
```

```html
<!-- extension/sidepanel.html -->
<body class="reqon-assistant-shell">
  <main id="assistantRoot" class="assist-frame assist-frame-floating">
    <header id="assistantHeader"></header>
    <section id="page"></section>
    <section id="coverage"></section>
    <section id="opp"></section>
  </main>
</body>
```

- [ ] **Step 6: Run the targeted tests**

Run:

```bash
node --test extension/tests/sidepanel-mode.test.js
```

Expected:

```text
# pass 3
```

- [ ] **Step 7: Commit**

```bash
git add extension/bg.js extension/sidepanel.js extension/sidepanel.html extension/sidepanel-mode.js extension/tests/sidepanel-mode.test.js
git commit -m "feat: make extension assistant reactive and mode aware"
```

## Task 4: Build the Today > Ready to apply workspace

**Files:**
- Modify: `extension/sidepanel.js`
- Modify: `extension/ui-lib.js`
- Test: `extension/tests/ui-lib.test.js`

- [ ] **Step 1: Write the failing tests for Today buckets and ready-to-apply ordering**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTodayBuckets } from '../ui-lib.js';

test('buildTodayBuckets leads with ready-to-apply roles and keeps follow-up separate', () => {
  const rows = [
    { company: 'Reddit', role: 'Senior PM', status: 'Not Applied', tier: 'A', conf: 'verified', reqCheck: 'open' },
    { company: 'Yahoo', role: 'Director', status: 'Applied', followup: '2026-07-01', tier: 'A', conf: 'verified' }
  ];

  const buckets = buildTodayBuckets(rows);
  assert.equal(buckets.defaultSection.id, 'ready-to-apply');
  assert.equal(buckets.readyToApply.length, 1);
  assert.equal(buckets.needsFollowUp.length, 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test extension/tests/ui-lib.test.js
```

Expected:

```text
TypeError: buildTodayBuckets is not a function
```

- [ ] **Step 3: Add Today bucket helpers**

```js
// extension/ui-lib.js
function buildTodayBuckets(rows) {
  const readyToApply = rows.filter((row) => isBestBetRow(row));
  const inProgress = rows.filter((row) => /^(Applied|Recruiter Screen|Hiring Manager|Panel|Offer)$/.test(row.status || ''));
  const needsFollowUp = rows.filter((row) => !!row.followup);
  return {
    defaultSection: { id: 'ready-to-apply', title: 'Ready to apply' },
    readyToApply,
    inProgress,
    needsFollowUp
  };
}

module.exports = Object.assign(module.exports || {}, { buildTodayBuckets });
```

- [ ] **Step 4: Render the Today workspace with ready-to-apply first**

```js
// extension/sidepanel.js
function renderTodayWorkspace(rows) {
  const buckets = reqonUiLib.buildTodayBuckets(rows);
  return `
    <section class="today-home">
      <div class="sect-title">Today</div>
      <div class="today-section">
        <div class="today-head">
          <h2>Ready to apply</h2>
          <div class="today-filters">${renderTierFilters()}</div>
        </div>
        ${renderReadyList(buckets.readyToApply)}
      </div>
      <div class="today-links">
        <button data-nav="in-progress">In progress</button>
        <button data-nav="needs-follow-up">Needs follow up</button>
      </div>
      ${renderBestBets(lastRows)}
      ${renderPipelineSnapshot(rows)}
    </section>
  `;
}
```

- [ ] **Step 5: Run the targeted tests**

Run:

```bash
node --test extension/tests/ui-lib.test.js extension/tests/sidepanel-mode.test.js
```

Expected:

```text
# pass
```

- [ ] **Step 6: Commit**

```bash
git add extension/sidepanel.js extension/ui-lib.js extension/tests/ui-lib.test.js
git commit -m "feat: add today ready-to-apply workspace to extension"
```

## Task 5: Add question grouping, jump-to-field, and richer autofill reporting

**Files:**
- Modify: `extension/content.js`
- Modify: `extension/sidepanel.js`
- Modify: `extension/lib.js`
- Test: `extension/tests/lib.test.js`
- Test: `extension/tests/content-banner.test.js`

- [ ] **Step 1: Write the failing tests for question grouping and field classification**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyQuestionField, groupQuestionFields } from '../lib.js';

test('classifyQuestionField distinguishes common, unique, and open-ended prompts', () => {
  assert.equal(classifyQuestionField('First Name', 'input'), 'common');
  assert.equal(classifyQuestionField('Please provide the name of your current company', 'textarea'), 'unique');
  assert.equal(classifyQuestionField('Why are you interested in this role?', 'textarea'), 'open-ended');
});

test('groupQuestionFields returns grouped counts and item metadata', () => {
  const groups = groupQuestionFields([
    { label: 'First Name', kind: 'input' },
    { label: 'Why are you interested in this role?', kind: 'textarea' }
  ]);
  assert.equal(groups.common.items.length, 1);
  assert.equal(groups['open-ended'].items.length, 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test extension/tests/lib.test.js
```

Expected:

```text
TypeError: classifyQuestionField is not a function
```

- [ ] **Step 3: Add grouping helpers to the shared library**

```js
// extension/lib.js
function classifyQuestionField(label, kind) {
  const sig = String(label || '').toLowerCase();
  if (/why|describe|tell us|explain|what makes|share an example/.test(sig)) return 'open-ended';
  if (/first name|last name|email|phone|linkedin|resume|cover letter|sponsorship|work authorization/.test(sig)) return 'common';
  return kind === 'textarea' ? 'unique' : 'common';
}

function groupQuestionFields(fields) {
  const groups = {
    common: { id: 'common', items: [] },
    unique: { id: 'unique', items: [] },
    'open-ended': { id: 'open-ended', items: [] }
  };
  for (const field of fields) {
    const bucket = classifyQuestionField(field.label, field.kind);
    groups[bucket].items.push(field);
  }
  return groups;
}

module.exports = Object.assign(module.exports || {}, { classifyQuestionField, groupQuestionFields });
```

- [ ] **Step 4: Index fields in the content script and support jump/highlight actions**

```js
// extension/content.js
let indexedQuestions = [];

function scanQuestions() {
  indexedQuestions = [...document.querySelectorAll('input, textarea, select')]
    .filter((node) => !SKIP_TYPES.includes((node.type || '').toLowerCase()))
    .map((node, index) => ({
      id: `rq-field-${index}`,
      label: (node.labels && node.labels[0] && node.labels[0].textContent) || node.placeholder || node.name || node.id || 'Untitled field',
      kind: node.tagName === 'TEXTAREA' ? 'textarea' : 'input',
      node
    }));
  return groupQuestionFields(indexedQuestions.map(({ node, ...field }) => field));
}

function jumpToQuestion(id) {
  const target = indexedQuestions.find((field) => field.id === id);
  if (!target) return { ok: false, msg: 'Field not found.' };
  target.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.node.focus();
  target.node.classList.add('rq-field-highlight');
  setTimeout(() => target.node.classList.remove('rq-field-highlight'), 2000);
  return { ok: true };
}
```

- [ ] **Step 5: Connect the side panel to question groups and jump actions**

```js
// extension/sidepanel.js
async function loadQuestionGroups() {
  if (!activeTab || activeTab.id == null) return;
  const groups = await chrome.tabs.sendMessage(activeTab.id, { type: 'questionGroups' });
  if (!groups || !groups.ok) return;
  $('jobAutofillSection').innerHTML = renderQuestionGroups(groups.groups);
  $('jobAutofillSection').querySelectorAll('[data-jump-id]').forEach((btn) => {
    btn.onclick = async () => {
      await chrome.tabs.sendMessage(activeTab.id, { type: 'jumpToQuestion', id: btn.dataset.jumpId });
    };
  });
}
```

- [ ] **Step 6: Run the targeted tests**

Run:

```bash
node --test extension/tests/lib.test.js extension/tests/content-banner.test.js
```

Expected:

```text
# pass
```

- [ ] **Step 7: Commit**

```bash
git add extension/lib.js extension/content.js extension/sidepanel.js extension/tests/lib.test.js extension/tests/content-banner.test.js
git commit -m "feat: add guided question grouping and jump-to-field actions"
```

## Task 6: Improve tracked role summaries, keyword gaps, and fit explanation

**Files:**
- Modify: `extension/sidepanel.js`
- Modify: `extension/ui-lib.js`
- Modify: `server.js`
- Test: `extension/tests/ui-lib.test.js`

- [ ] **Step 1: Write the failing tests for missing-term display and fit explanation**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKeywordInsightModel, explainFitGap } from '../ui-lib.js';

test('buildKeywordInsightModel surfaces both matched and missing terms', () => {
  const model = buildKeywordInsightModel({
    matched: ['product', 'leadership'],
    missing: ['machine learning', 'data science']
  });
  assert.deepStrictEqual(model.matched, ['product', 'leadership']);
  assert.deepStrictEqual(model.missing, ['machine learning', 'data science']);
});

test('explainFitGap summarizes non-keyword inputs into plain language', () => {
  const message = explainFitGap({
    fit: 6,
    keywordCoverage: 17,
    reasons: ['strong domain alignment', 'seniority match', 'limited direct keyword overlap']
  });
  assert.match(message, /domain alignment/);
  assert.match(message, /keyword overlap/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test extension/tests/ui-lib.test.js
```

Expected:

```text
TypeError: buildKeywordInsightModel is not a function
```

- [ ] **Step 3: Add UI helpers and server payload enrichment**

```js
// extension/ui-lib.js
function buildKeywordInsightModel({ matched = [], missing = [] }) {
  return { matched, missing, hasGaps: missing.length > 0 };
}

function explainFitGap({ fit, keywordCoverage, reasons = [] }) {
  return `Fit ${fit}/10 with ${keywordCoverage}% keyword coverage because ${reasons.join(', ')}.`;
}

module.exports = Object.assign(module.exports || {}, {
  buildKeywordInsightModel,
  explainFitGap
});
```

```js
// server.js /api/assist/keywords response
return res.json({
  ok: true,
  matched,
  missing,
  rationale: [
    domainHit ? 'strong domain alignment' : 'weaker domain alignment',
    seniorityHit ? 'seniority match' : 'seniority mismatch',
    missing.length ? 'limited direct keyword overlap' : 'strong keyword overlap'
  ]
});
```

- [ ] **Step 4: Render the richer keyword and fit explanation sections**

```js
// extension/sidepanel.js
function renderKeywordInsights(result, row) {
  const model = reqonUiLib.buildKeywordInsightModel(result);
  const explanation = reqonUiLib.explainFitGap({
    fit: row.fit,
    keywordCoverage: result.coverage || 0,
    reasons: result.rationale || []
  });
  return `
    <div class="kw-block">
      <div class="kw-group"><h3>Matched terms</h3>${renderTagList(model.matched)}</div>
      <div class="kw-group"><h3>Missing terms</h3>${renderTagList(model.missing, 'missing')}</div>
      <p class="muted">${explanation}</p>
    </div>
  `;
}
```

- [ ] **Step 5: Run the targeted tests**

Run:

```bash
node --test extension/tests/ui-lib.test.js
```

Expected:

```text
# pass
```

- [ ] **Step 6: Commit**

```bash
git add extension/sidepanel.js extension/ui-lib.js server.js extension/tests/ui-lib.test.js
git commit -m "feat: add keyword gap and fit explanation views"
```

## Task 7: Wire popup/update affordances and full regression coverage

**Files:**
- Modify: `extension/popup.html`
- Modify: `extension/popup.js`
- Modify: `extension/options.html`
- Modify: `extension/options.js`
- Test: `extension/tests/ui-lib.test.js`
- Test: `extension/tests/bg-experience.test.js`

- [ ] **Step 1: Write the failing tests for update-check labels and popup wording**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUpdateCheckViewModel } from '../ui-lib.js';

test('buildUpdateCheckViewModel maps update statuses to calm user copy', () => {
  assert.deepStrictEqual(buildUpdateCheckViewModel({ status: 'no_update' }), {
    tone: 'neutral',
    label: 'Reqon is up to date'
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test extension/tests/ui-lib.test.js
```

Expected:

```text
TypeError: buildUpdateCheckViewModel is not a function
```

- [ ] **Step 3: Add the UI helper and popup wiring**

```js
// extension/ui-lib.js
function buildUpdateCheckViewModel(result) {
  if (result && result.status === 'update_available') return { tone: 'ok', label: 'Update ready when Chrome goes idle' };
  if (result && result.status === 'throttled') return { tone: 'warn', label: 'Update check throttled' };
  return { tone: 'neutral', label: 'Reqon is up to date' };
}

module.exports = Object.assign(module.exports || {}, { buildUpdateCheckViewModel });
```

```js
// extension/popup.js
document.getElementById('checkUpdateBtn').onclick = async () => {
  const result = await new Promise((res) => chrome.runtime.sendMessage({ type: 'requestUpdateCheck' }, res));
  const vm = reqonUiLib.buildUpdateCheckViewModel(result);
  const node = document.getElementById('updateStatus');
  node.textContent = vm.label;
  node.dataset.tone = vm.tone;
};
```

- [ ] **Step 4: Update popup/options markup**

```html
<!-- extension/popup.html -->
<button id="checkUpdateBtn" class="mini">Check for update</button>
<div id="updateStatus" class="muted"></div>
```

```html
<!-- extension/options.html -->
<div id="experienceMeta" class="muted"></div>
```

- [ ] **Step 5: Run the full extension/server regression suite**

Run:

```bash
node --test extension/tests/*.test.js tests/*.test.js
```

Expected:

```text
# pass
```

- [ ] **Step 6: Commit**

```bash
git add extension/popup.html extension/popup.js extension/options.html extension/options.js extension/ui-lib.js extension/tests/ui-lib.test.js extension/tests/bg-experience.test.js
git commit -m "feat: add extension update affordances and finish redesign regression coverage"
```

## Self-review

### Spec coverage

- Banner mode: covered in Task 2
- Floating/elevated assistant shell: covered in Tasks 2 and 3
- Today > Ready to apply: covered in Task 4
- Tracked role summary ordering: covered in Task 3
- Reactive open-panel updates: covered in Task 3
- Question grouping and jump-to-field: covered in Task 5
- Autofill reporting clarity: covered in Task 2 and Task 5
- Keyword gaps and fit explanation: covered in Task 6
- Cloud-configured experience + update strategy: covered in Task 1 and Task 7

No spec gaps found.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” markers remain.
- Every task includes concrete file paths, code, test commands, and commit commands.

### Type consistency

- `experienceConfig` / `requestUpdateCheck` message names are used consistently.
- `deriveAssistantMode`, `buildTrackedRoleCards`, `buildTodayBuckets`, `classifyQuestionField`, `groupQuestionFields`, `buildKeywordInsightModel`, and `buildUpdateCheckViewModel` are introduced before later tasks consume them.
- `pageContextChanged` is the single background-to-panel event name throughout the plan.
