# Reqon Extension Experience Redesign

Date: 2026-07-01
Status: Draft approved in conversation, written for implementation planning
Scope: Chrome extension UX, information architecture, reactive page behavior, and store-safe update strategy

## 1. Goal

Refocus the Reqon extension around smooth execution, trust, and low-friction applying.

The extension should feel like:

- a contextual helper when the user lands on a role or application page
- a guided execution workspace when the user intentionally opens Reqon from the toolbar
- a trustworthy layer that preserves page context instead of shrinking the page or feeling like browser chrome

This redesign does not aim to copy Simplify's language or visual identity. It borrows the useful interaction patterns while taking advantage of Reqon's ability to design a calmer, more modern, more PM-grade workflow.

## 2. Product framing

The extension serves two distinct jobs:

1. Discovery mode
The user finds a role on the web and wants help understanding, tracking, and deciding whether to act.

2. Execution mode
The user already has roles in Reqon and wants a lightweight action surface for applying, continuing, or updating status without opening the full board.

The full web app remains the overview and analytics command center.
The extension becomes the action workspace.

## 3. Problems to solve

Current issues clustered during review and live use:

- state trust is weak
  - closed jobs can still appear in best bets
  - tracked jobs can still present as "Clip this job"
  - AI usage can look punitive or incorrect for higher tiers
- page behavior is inconsistent
  - recognized job pages do not always open or hydrate the assistant in a way that feels obvious
  - manually opened assistant state does not feel reactive enough when the tab becomes a job page
- apply help is not legible enough
  - the user cannot easily see what Reqon filled, missed, or recommends next
  - fit and keyword signals do not explain themselves clearly
- visual model is wrong for the job
  - the current side panel feels squared off and docked, shrinking the site rather than layering above it
- update/release workflow is too heavy
  - full extension replacement is too slow to test and operate

## 4. Design principles

- Preserve the page
  The assistant should layer over the site, not reflow it.

- Lead with state, then action
  The user should first understand tracked state, status, and fit, then decide what to do.

- Keep basic fill and AI fill clearly separated
  The extension must communicate what is deterministic, what is AI-assisted, and what still requires review.

- Favor compact orientation over instant takeover
  Banner first, deeper assistant second.

- Match the user's mindset
  Ready-to-apply work should not be mixed with follow-up management by default.

- Stay within Chrome Web Store rules
  User-visible behavior can be cloud-configured, but extension logic must remain packaged and reviewable.

## 5. Chosen approach

Use a hybrid overlay assistant:

- lightweight in-page banner for recognized role/apply pages
- floating elevated assistant for deeper guided work
- toolbar-open Today workspace for intentional "what should I do now?" sessions
- reactive assistant state that updates in place when an open panel detects a recognized job page

This approach is preferred over:

- a panel-only redesign, which still feels like a utility drawer
- an in-page-only design, which weakens the toolbar-open workflow

## 6. Surface model

### 6.1 Banner mode

Banner mode is the default contextual surface on recognized role/apply pages.

Behavior:

- floats above the page
- does not shrink or reflow page content
- stays compact by default
- acts as the first proof that Reqon understands the page

Default banner content:

- tracked or untracked state
- current application status
- fit summary
- fill availability
- primary CTA
- secondary expand CTA

Examples:

- `Tracked • Not Applied • Fit 6/10 • Fill available`
- `Untracked • Open role • Fit 7/10 • Start guided fill`

Primary CTA behavior:

- untracked role: `Start guided fill`
- tracked role: `Continue application` if apply work is active, otherwise `Review status`

Secondary CTA:

- `Expand`

Banner mode must feel informational first, not aggressive.

### 6.2 Floating assistant

Expanding the banner opens a floating assistant layered above the page.

Visual direction:

- rounded corners
- softer edges than the current side panel
- visible elevation and shadow so it reads as a top layer
- generous spacing
- not squared off top to bottom
- not edge-locked like a hard browser sidecar

The assistant can still be implemented using Chrome side panel infrastructure if needed, but the visual treatment should make it feel like a hovering product surface rather than browser layout.

### 6.3 Toolbar-open home

When the user clicks the Reqon browser button on a non-job page, the extension should open into a Today workspace.

Default home:

- `Today > Ready to apply`

Supporting sections:

- tier filters
- show more
- quick actions
- separate entry points to `In progress`
- separate entry points to `Needs follow up`
- lighter pipeline snapshot
- clear `Open board` escape hatch

This preserves the spirit of the current extension while focusing it on immediate action.

## 7. Mode model

### 7.1 Today mode

Used when:

- the extension is opened intentionally from the toolbar
- the current tab is not a recognized job/apply page

Default first list:

- `Ready to apply`

Rationale:

- application work is a different mindset from follow-up work
- in-progress and follow-up items should not dilute the default action queue

Today mode sections:

1. Ready to apply
2. Quick links to in-progress and follow-up work
3. Recommended next actions
4. Best bets
5. Pipeline snapshot
6. Open board

### 7.2 Job mode

Used when the current tab is a recognized role/apply page.

Entry points:

- automatic detection
- manual expansion from banner
- already-open assistant reacting to current tab state

The job page should gain:

- banner mode
- assistant sections relevant to that role and page
- autofill and guided apply actions
- fit and keyword explanation

### 7.3 Tracked role mode

Used when the recognized page maps to a role already on the Reqon board.

Top section order:

1. Tracked role summary with status
2. Continue application
3. Review and update

Rationale:

- for tracked roles, context and workflow state come before raw fill

### 7.4 Reactive open-panel behavior

If the assistant is already open and the user lands on a recognized job/apply page, the content must update in place.

Expected hydration:

- role summary
- tracked/untracked state
- status
- fit/score
- keyword analysis
- autofill actions

If the user leaves the job page:

- return gracefully to Today mode or a neutral state
- do not leave the panel looking broken or stale

## 8. Information architecture on job pages

### 8.1 Tracked roles

Section order:

1. Tracked role summary
2. Continue application
3. Review and update
4. Keyword match and missing terms
5. Autofill progress and AI actions
6. Captured job and profile details
7. Open board

### 8.2 Untracked roles

Section order:

1. Role summary
2. Track this role
3. Fit and keyword analysis
4. Fill availability and guided fill
5. Edit captured details
6. Open board

## 9. Guided apply content model

The assistant should behave more like a guided application surface than a generic utility panel.

### 9.1 Question grouping

Group visible questions into:

- common questions
- unique questions
- open-ended questions

Each group should support:

- field count
- completion count
- quick jump to field
- per-field status

### 9.2 Jump-to-field behavior

Selecting a question in the assistant should:

- scroll to the field
- visually highlight the field briefly
- preserve the user's sense of location

This is especially important for long Greenhouse and Ashby applications.

### 9.3 Autofill reporting

After fill actions, Reqon should explain what happened in user language.

Required summary pattern:

- total fillable fields found
- number filled deterministically
- number filled with AI help
- number still left for manual review

Example:

- `Filled 11 of 18 fields: 8 direct, 3 AI-assisted, 7 still need review.`

### 9.4 Cover letter handling

When a cover letter field is detected:

- surface a clear recommendation that the user may want an AI draft
- allow draft generation in context
- preserve user review before use
- if technically feasible, support saving/exporting and attachment flow later

### 9.5 Assets and profile snapshot

Show the key assets and inputs the extension is relying on:

- current resume selection / attachment state
- profile summary
- key captured details used for autofill

The user must be able to edit or correct captured information.

## 10. Fit and keyword explanation model

### 10.1 Keyword analysis

Current keyword coverage is too sparse and too one-sided.

The redesign should show:

- matched JD terms
- missing JD terms
- stronger explanation of what the score means

Keyword coverage should be explicitly framed as one input, not the whole fit score.

### 10.2 Fit vs keyword score

The assistant should explain why a role can have:

- a moderate or low keyword score
- but a stronger or weaker overall fit score

Fit explanation should consider:

- domain alignment
- seniority match
- remote/location alignment
- probable interviewability
- resume/JD overlap

This explanation should reduce the "17% match but fit 6" confusion.

## 11. Visual direction

Reqon should take inspiration from good industry patterns without copying Simplify's style or wording.

Desired feel:

- modern
- polished
- calm
- trustworthy
- layered
- less boxy
- less like browser UI chrome

Avoid:

- dense utility-drawer look
- hard-edged full-height panels
- excessive warning/red states for normal paid-plan usage
- language that sounds derivative of competitor copy

## 12. Update and release strategy

### 12.1 Product requirement

The extension needs a faster update path than full manual replacement/reinstall.

Desired outcome:

- users can update in place
- Chrome can auto-update the extension
- Reqon can tune large parts of the experience remotely without a full package swap

### 12.2 Chrome Web Store reality

Manifest V3 does not allow remotely hosted extension logic in the general case.

Implications:

- service worker logic must remain packaged
- core assistant logic must remain packaged
- remote payloads must be data/configuration, not arbitrary downloaded code

Therefore, "full OTA" should mean:

- almost all user-visible behavior is cloud-configurable
- real code changes still ship via Chrome Web Store updates

### 12.3 Stable shell + cloud-configured experience

Extension shell responsibilities:

- permissions
- auth/session bridge
- tab detection
- page classification
- local cache
- message passing
- secure rendering host
- file attachment hooks
- telemetry
- update check hook
- last-known-good fallback behavior

Reqon Cloud responsibilities:

- banner/panel composition
- section ordering
- feature flags
- copy/content
- autofill mappings and recipes
- prompt selection
- fit explanation presentation
- keyword display rules
- rollout settings
- experiments

### 12.4 Server load expectation

This approach should not require the server to host the entire panel UI on every open.

Expected request pattern:

- lightweight config/manifest fetch
- normal API calls for board/profile/assist state
- occasional cached assets/data

This is a small control-plane load, not full remote UI hosting.

### 12.5 Update UX

Support:

- Chrome automatic updates through the Web Store
- optional in-extension `Check for update` action
- graceful handling when an update is pending but the extension is still active

Users should never need to reinstall to receive normal updates.

## 13. Technical implementation boundaries

Anchor points in the current codebase:

- `extension/content.js`
  - page detection
  - overlay/banner behavior
  - field scanning
  - fill execution
- `extension/sidepanel.js`
  - current action workspace
  - best bets / board-synced lists
  - keyword and AI actions
- `extension/bg.js`
  - server I/O
  - cache
  - queueing
  - assist endpoints
- `extension/ui-lib.js`
  - derived display logic worth expanding

Expected new design direction:

- content script owns banner + page-aware assistant coordination
- assistant renderer becomes mode-aware rather than one long static side panel
- Today workspace reuses existing board/action primitives instead of building a second mini board
- cloud configuration is consumed through `bg.js` and cached locally

## 14. Non-goals for this phase

- full analytics parity with Simplify
- a complete Simplify tracker import/sync feature
- a full resume/asset management system
- arbitrary remotely executed extension code
- redesigning the full web board alongside the extension

These can become roadmap items after the core extension experience is stabilized.

## 15. Open roadmap items captured from this design pass

- Simplify-style tracker sync or import path for migration
- analytics comparison against Simplify tracker/insights
- richer profile skill extraction and curation workflow
- deeper cover-letter generation/export/attach flow

## 16. Recommended implementation sequence

1. Introduce mode model and reactive assistant state
2. Build banner mode and floating assistant shell
3. Rework toolbar-open home into Today > Ready to apply
4. Add tracked role summary and reordered job-mode sections
5. Improve question grouping, jump-to-field, and autofill reporting
6. Strengthen keyword and fit explanations
7. Add cloud configuration layer and update check UX
8. Polish visuals and motion

## 17. Success criteria

- users immediately understand whether Reqon recognizes the current page
- tracked roles present as tracked, with status-first context
- the assistant updates in place when the open tab becomes a job page
- the page no longer feels visibly shrunken by the assistant
- the extension home feels like an action workspace, not a tiny analytics board
- autofill outcomes are explicitly and credibly explained
- keyword and fit signals feel understandable
- normal release updates no longer require reinstalling the extension
