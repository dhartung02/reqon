# Reqon Product Roadmap v3 — Multi-User First

*Surface strategy, parity gaps, and a multi-user-first execution plan. This revision supersedes the
surface-only plan: per the owner's direction, **multi-user logins + data separation is near-term and
sequenced first** (Sprint 0 / PR 0) so we don't build single-tenant features that need a retrofit.
Lives in the repo so it tracks with the code during the build.*

## Decisions Locked (v3)

1. **Per-user data separation via a namespaced store** (`data/<userId>/…`) with a single
   tenant-resolver middleware enforcing isolation. **Confirmed.**
2. **API keys are per-user by default** — each user supplies their own OpenAI/aggregator keys so
   **AI cost is pushed to that user**. An **admin can grant a specific user permission to use the
   server's shared key account** (with per-user usage caps + accounting either way). **Confirmed.**
3. **Security is a first-class requirement** — hashed passwords, per-user sessions, one-place tenant
   isolation, no cross-tenant token/data access, isolation tests. **Confirmed.**
4. **Multi-user is near-term and goes first** — build the tenant-scoped store + auth before P1+
   feature expansion to avoid wasted cycles. **Confirmed.**

## Purpose

This roadmap organizes Reqon’s next improvements by priority and by surface/screen so development can proceed systematically across:

- Server / API
- Web Board
- Mobile Web View (`/m`)
- Native iOS/iPad App
- Chrome Extension
- Scout / Gmail / AI background workflows
- Documentation / Setup

The key product strategy:

> The web board is the de-facto reference surface. The iOS/iPad app should become the mobile parity target, with unique apply-side power. The `/m` mobile web view should remain a lightweight check-in surface. The Chrome extension should remain focused on browser/page-context workflows: capture, AI score/map-fields, fillability, autofill, and mark-applied.

Do **not** chase full parity across every surface. That would create duplicate effort and product confusion.

---

# 1. Product Surface Strategy

## 1.1 Web Board

### Role

Primary source-of-truth reference surface.

### Product Intent

The web board is the full command center for:

- Pipeline management
- Role detail
- Settings
- Source/scout configuration
- Source health
- Analytics
- Candidate profile
- AI configuration
- Data safety
- Notifications
- System health
- Workflow rules
- Decision support
- CV builder
- Saved answers library
- AI score/tailor workflows

### Roadmap Principle

Anything related to configuration, source-of-truth data, analytics, profile, system health, workflow rules, and administrative control should land here first.

---

## 1.2 Native iOS/iPad App

### Role

Primary mobile experience and mobile parity target.

### Product Intent

The native app should be the mobile command center for:

- Today/action queue
- Pipeline review
- Role detail
- Apply assist
- In-app browser
- CV builder
- Saved answers
- Profile-lite management
- Analytics summary
- Sync/offline usage
- Interview prep
- Notifications feed

### Roadmap Principle

The app should approach web board parity where it helps mobile decision-making, but it does not need every admin/configuration capability.

---

## 1.3 Mobile Web View `/m`

### Role

Lightweight mobile check-in surface.

### Product Intent

`/m` should remain intentionally lightweight:

- Read-only or near-read-only
- Quick pipeline check
- Quick search/filter
- Quick open posting
- Basic status visibility
- Possibly quick-add if already stable
- Possibly mark-applied if already safe

### Roadmap Principle

Do **not** chase full board parity on `/m`. Document it as a lightweight phone view. Use the native app as the real mobile product.

---

## 1.4 Chrome Extension

### Role

Apply-side companion and page-context tool.

### Product Intent

The extension should lead where browser page context matters:

- Clip job postings
- Detect known/tracked roles
- Show fit/EV/status overlay
- Detect fillability/apply mode
- Fill factual application fields
- Insert saved answers
- AI score/tailor/map-fields on the active page
- Mark applied
- Queue offline actions
- Capture salary/location/apply-mode details from job pages

### Roadmap Principle

Keep the extension focused. Do not turn it into the full CRM. Its job is to operate where the board/app cannot: inside the job posting and application flow.

---

## 1.5 Identity & Multi-User (cross-cutting)

### Role

Not a surface — a foundational capability every surface depends on.

### Product Intent

Reqon should support multiple users on one shared server/backend, each with a fully separate board, profile, settings, analytics, and automation. A user logs in (web/`/m`/app/extension) and sees only their own data; another user on the same deployment sees only theirs. See **P0.6 — User Logins and Data Separation**.

### Roadmap Principle

Identity and per-user data isolation are foundational. If multi-user is in scope, the tenant-scoped store and auth must land **before** broad feature expansion, because every surface, sync path, token, and background job has to be user-aware. Enforce isolation in one shared resolver, never per-endpoint. Single-user deployments must keep working unchanged.

---

# 2. Current Capability Assessment

## 2.0 Parity Matrix (snapshot)

Legend: ✓ full · ◑ partial · ✗ none · — n/a (backend/not applicable)

| Capability | Server | Web | Mobile | App | Ext |
|---|:--:|:--:|:--:|:--:|:--:|
| Pipeline browse (tabs/search/sort/filters) | ✓ | ✓ | ◑ | ✓ | ◑ |
| Edit tracking fields | ✓ | ✓ | ✗ ro | ◑ | ◑ |
| Add / capture | ✓ | ✓ (＋import) | ◑ quick | ◑ manual | ✓ clip |
| Run scout / source health | ✓ | ✓ | ◑ run | ◑ (＋on-device) | ✗ |
| AI draft (cover/screening) | ✓ | ✓ | ✗ | ✓ | ✓ |
| AI score / tailor / autofill (map-fields) | ✓ | ✗ | ✗ | ✗ | ✓ |
| Interview guides | ✓ | ✓ | ✗ | ✗ | ✓ |
| Apply-assist (form fill) | — | ✗ | ✗ | ✓ | ✓ |
| Fillability detect (apply-mode probe) | ✓ | ✓ | ✗ | ◑ | ✗ |
| Analytics (funnel/dist/lenses/velocity) | — | ✓ | ✗ (3 KPIs) | ◑ | ◑ mini |
| Candidate profile edit | ✓ | ✓ | ✗ | ◑ | ✗ |
| CV builder (docx/pdf, tailor) | ✓ | ✗ | ✗ | ✓ | ✗ |
| Saved-answers library | ✓ | ✗ | ✗ | ✓ | ◑ |
| Settings: sources / matching / workflow | ✓ | ✓ | ✗ | ◑ | ✗ |
| Settings: AI (model/cost) | ✓ | ✓ | ✗ | ✗ | ◑ view |
| Settings: digest & notifications (6 ch/SMS) | ✓ | ✓ | ✗ | ◑ Gmail | ✗ |
| Settings: data safety / advanced | ✓ | ✓ | ✗ | ◑ pairing | ◑ url/token |
| In-app notification feed / bell | ✓ | ✓ | ✗ | ✗ | ◑ toast |
| Sync / QR pairing | ✓ | ✓ | ✗ | ✓ | ◑ |
| Help / user guide | ✓ | ✓ | ✗ | ◑ scoring | ✗ |
| **Multi-user / per-user data** | ✗ | ✗ | ✗ | ✗ | ✗ |

Top gaps this plan closes, in order: **multi-user (all surfaces, currently ✗ everywhere)** → web AI-score/CV/saved-answers parity → app analytics/profile/notifications catch-up → extension apply-side polish.

## 2.1 Overall Assessment

The web board is the de-facto reference surface. It is slightly ahead of the app and mobile surfaces, especially after recent additions.

The iOS app is approximately 65% of the web board, but it has unique apply-side power.

The `/m` mobile web view is by far the largest parity gap because it is essentially a read-only check-in screen.

The Chrome extension is correctly scoped and leads on one important area: AI score/autofill/map-fields in the browser context.

Recent web-only additions widened surface gaps:

- Notifications engine
- Fillability probe
- Salary-fit
- Analytics distributions
- Environment inventory
- Model dropdown
- Source redesign
- Workflow chips

These should selectively flow into the app, but not necessarily into `/m`.

---

## 2.2 Surprising Asymmetries

### AI score / tailor / autofill lives mainly in the extension

The server exposes AI scoring and map-fields endpoints. The extension uses those capabilities. The web board and app do not yet expose equivalent UI.

This is a high-value parity opportunity, especially for the web board.

---

### CV builder and saved-answers library are app-only

The server has supporting endpoints. The app exposes the workflows. The web board cannot yet build/tailor a CV or manage the saved-answers library.

This is a high-value web parity gap.

---

### Apply-assist form fill belongs in app + extension only

The board should not try to directly fill external pages.

Apply-assist form fill correctly belongs in:

- Native app in-app browser
- Chrome extension on real job pages

Do not chase this capability on the web board or `/m`.

---

### `/m` is the largest parity gap by design

`/m` lacks:

- Editing
- Profile
- Settings
- Analytics depth
- AI
- Notifications
- Guides
- Workflow management
- CV builder
- Saved answers

Trying to reach full board parity in `/m` would essentially become a rebuild and would heavily overlap with the native app.

Decision: keep `/m` as lightweight mobile check-in.

---

# 3. Priority Model

## P0 — Foundation / Reliability / Strategic Direction

Fix trust, setup, diagnostics, and surface strategy before adding more functionality.

## P1 — High-Value Parity

Close the most valuable gaps between web, app, and extension.

## P2 — Workflow Intelligence

Make Reqon feel like an operating system that tells the user what changed and what to do next.

## P3 — Scale / Architecture / Strategic Polish

Longer-term hardening and strategic improvements.

---

# 4. P0 — Foundation and Direction

---

## P0.1 — Stabilize Native App Dependency Tree

### Surface

Native App

### Problem

The app setup/documentation must be stable and aligned with the dependency tree. If README says one Expo SDK but the app uses another, setup becomes fragile.

### Goal

Make app setup predictable and demo-safe.

### Requirements

- Audit `app/package.json`.
- Confirm intended Expo SDK.
- Prefer stable Expo Go compatibility unless there is a clear reason not to.
- Align README with actual dependency versions.
- Validate:
  - `cd app && npm install`
  - `npx expo start`
  - iPhone layout
  - iPad portrait layout
  - iPad landscape layout
  - Tests

### Acceptance Criteria

- Fresh clone app install works.
- README and app dependencies match.
- No unexpected canary dependency unless explicitly documented.
- App remains demo-safe.

---

## P0.2 — Declare `/m` as Lightweight Mobile Web

### Surface

Mobile Web `/m`, README, Web Settings

### Problem

The mobile web view is far behind the web board and native app. Trying to make it full parity would duplicate the native app.

### Decision

Keep `/m` as a lightweight phone check-in view.

### Requirements

Update README and `/m` UI copy to clarify:

```text
Mobile web is a lightweight check-in view for quick review. Use the native app for full mobile workflows, offline sync, analytics, profile, CV builder, saved answers, and apply assist.
```

### Keep `/m` Focused On

- Pipeline browse
- Search/filter
- View role details
- Open posting
- View basic status
- Maybe quick-add if already stable
- Maybe mark applied if already safe

### Explicitly Do Not Chase On `/m`

- Full settings
- Full profile editor
- Full analytics
- AI score/tailor
- Saved answers management
- CV builder
- Interview guide generation
- Source configuration
- Backup/restore
- Advanced workflow configuration
- Notification engine parity

### Acceptance Criteria

- `/m` is no longer measured against full board parity.
- README documents the intended role.
- Native app is documented as the real mobile surface.
- `/m` UI copy clarifies its lightweight purpose.

---

## P0.3 — Add Sync Health / System Health Diagnostics

### Surface

Server, Web Board, App, Extension

### Problem

Sync and background automation exist, but failure states are not visible enough.

### Goal

Make system state transparent.

### Server Endpoints

Add:

```http
GET /api/sync/health
GET /api/health/deep
```

### `/api/sync/health` Should Return

```json
{
  "ok": true,
  "serverTime": "...",
  "rowCount": 123,
  "tombstoneCount": 4,
  "lastChangeAt": "...",
  "lastSnapshotAt": "...",
  "authEnabled": true,
  "profileConfigured": true,
  "gmailConfigured": true,
  "aiConfigured": true,
  "lastSync": {
    "at": "...",
    "applied": 3,
    "conflicts": 0,
    "idRemaps": 0
  }
}
```

### `/api/health/deep` Should Check

- Data file exists
- Data parses
- Data is an array
- No duplicate IDs
- Missing IDs
- Missing `updatedAt`
- Invalid statuses
- Invalid tombstones
- Fit/prob validity
- Tier/score consistency
- Backup directory writable
- Profile file parseable
- Boards/watchlist parseable
- `.env` inventory
- AI key configured
- Gmail configured
- Scout runnable
- Logs writable

### Web Board UI

Settings → System Health should show:

- Data health
- Sync health
- Auth/token status
- AI config
- Gmail config
- Scout health
- Backup count
- Last snapshot
- Last error
- Safe repair action

### Native App UI

Settings → Sync Health should show:

- Server URL
- Connected/offline
- Token configured
- Last sync
- Last error
- Rows local
- Rows server
- Pending edits
- Queued scout
- Manual sync
- Reset local cache

### Extension UI

Popup/side panel should show:

- Server connected
- Server origin
- Token status
- Queue count
- Last error
- Retry queued actions
- Clear queued actions

### Acceptance Criteria

- User can tell whether the system is healthy without reading logs.
- Sync failures are visible.
- Queued work is visible.
- Server/app/extension health states are aligned.

---

## P0.4 — Add Data Integrity Checker and Safe Repair

### Surface

Server, Web Board Settings

### Problem

Reqon now has many writers touching the same local store:

- Web board
- App sync
- Extension quick-add
- Scout
- Gmail ingest
- Enrichment
- Restore
- API merge

JSON-file persistence is acceptable for a self-hosted personal CRM, but it needs stronger guardrails.

### Goal

Detect and safely repair common data integrity problems.

### Server Endpoint

```http
GET /api/health/deep
POST /api/maintenance/repair-data
```

### Safe Repair Should Handle

- Add missing IDs
- Add missing `updatedAt`
- Normalize known statuses
- Remove invalid empty rows
- Recompute tier where safe
- Preserve snapshot before repair

### Web UI

Settings → System Health:

- Data health pass/fail
- Number of warnings
- Number of repairable issues
- Repair safe issues button
- Download diagnostic JSON button

### Acceptance Criteria

- Deep health endpoint returns structured warnings/errors.
- Safe repair snapshots data first.
- No destructive repair happens without explicit action.
- Health result is visible in Settings.

---

## P0.5 — Centralize Status Transition Rules

### Surface

Server, Web Board, App, Extension, Gmail Ingest

### Problem

Status changes happen from many entry points and may drift:

- Web board
- Native app
- Chrome extension mark applied
- Gmail ingest
- Server PATCH
- Bulk updates
- Scout/enrichment

### Goal

One shared transition model.

### Requirements

Create shared core helper:

```js
transitionRoleStatus(row, nextStatus, context)
```

Context:

```js
{
  source: "web" | "app" | "extension" | "gmail" | "api",
  now: "...",
  preserveExistingNext: true,
  note: ""
}
```

It should handle:

- Applied date stamping
- Last contact stamping
- Next action defaults
- Interview guide eligibility
- Rejection/archive handling
- Status normalization
- Preservation of existing notes/next action
- Transition timeline event generation if timeline exists

### Acceptance Criteria

- Web, app, extension, and Gmail status changes use shared logic.
- Tests cover major transitions:
  - Not Applied → Applied
  - Applied → Recruiter Screen
  - Applied → Rejected
  - Interview → Offer
  - Any → Archived
- No duplicated mark-applied semantics.

---

## P0.6 — User Logins and Data Separation (Multi-User)

### Surface

Server (core), Web Board, Mobile Web `/m`, Native App, Chrome Extension, Docs

### Problem

Reqon is currently single-tenant. A single shared `APP_TOKEN` passphrase gates access, and there is one of each store: `data.json`, `profile.json`, `boards.json`, `watchlist.json`, `notifications.json`, `digest-state.json`, `push-tokens.json`, interview guides, and backups. Anyone who can reach the server sees the same board. There is no concept of a user, no per-person data isolation, and no way for two people to share one deployment without seeing each other's pipeline, profile, and settings.

### Use Case

> Dustin logs in and can see/add/work with only his job requisitions, profile, analytics, and settings. Eric logs in and sees a completely separate board with his own requisitions and information. Both work independently against the same server and backend, with zero visibility into each other's data.

### Goal

Introduce first-class user accounts and strict per-user data separation on a shared server/backend, across every surface, without breaking the existing single-user deployment.

### Requirements

**Accounts & auth**

- Add per-user accounts: `{ id, username|email, displayName, passwordHash, role: "admin"|"user", createdAt, disabled, useSharedKey: false }`, stored in a `users.json` (or chosen store). Hash passwords with a strong KDF (scrypt/bcrypt) + per-user salt; never store plaintext. `useSharedKey` lets an admin grant a user access to the server's shared AI key account (decision #2).
- Login page issues a signed, per-user session cookie; logout clears it. Sessions are per-user and never reusable across users.
- First-run bootstrap: if no users exist, create an initial **admin** (from `APP_TOKEN`/env or a setup step) so zero-config local use still works.
- Legacy/local mode: if multi-user is disabled, behavior is identical to today (single implicit owner).

**Data separation (the core)**

- Namespace ALL per-user state by user id. Recommended layout: `data/<userId>/{data.json, profile.json, boards.json, watchlist.json, notifications.json, digest-state.json, mail-state.json, push-tokens.json, interview-guides/, backups/}`.
- A single **tenant-resolver middleware** maps the authenticated session → that user's namespace; every store read/write/snapshot/restore/export is scoped to it. No endpoint may read or mutate another user's data. Enforce isolation in ONE place, not per-endpoint, so a missed filter can't leak.
- **API keys are per-user (decision locked).** Each user stores their own OpenAI/aggregator keys in their namespace, so **AI cost is billed to that user**. An **admin can grant a specific user `useSharedKey: true`**, allowing that user to consume the server's shared key account (the operator funds it). Per-user **usage caps + token accounting** apply in both modes. All other per-user config/content (Gmail, digest, scout, profile) is namespaced per user.
- Scout, Gmail ingest, digest scheduler, enrichment, and AI-usage accounting all run **per-user** (the scheduler iterates active users).

**Per-surface**

- Web board + `/m`: login screen before any data; all data/settings scoped to the session user; a user menu (who am I · log out).
- Native app: pairing/login binds the device to ONE user; the QR/pairing code encodes a **user-scoped** token; sync is per-user.
- Extension: per-user token; clipped roles and mark-applied land in that user's board only.
- Scoped ingest tokens and pairing codes are per-user (regenerating one user's token never affects another's).

**Admin / user management**

- Web Settings → **Users** (admin only): create user, set role, disable/enable, reset password, delete (with explicit data-handling choice), and **grant/revoke shared-key (server-funded AI) access** per user.
- Self-service: change own password + display name.

**Migration & compatibility**

- One-time migration: existing single-store data → a default/owner user namespace; snapshot first; reversible.
- Backward compatible: existing single-user deployments keep working (implicit owner) until multi-user is enabled.

**Security**

- Rate-limit login; signed/expiring sessions; no cross-tenant token acceptance.
- Audit log records the acting user on every mutation.

### Acceptance Criteria

- Two users (e.g., Dustin and Eric) log in to the same server and each see only their own pipeline, profile, settings, analytics, notifications, and scout results.
- No API endpoint, token, pairing code, export, backup, or sync path exposes another user's data — covered by tests asserting User A cannot read/write User B's data via any route or token.
- Existing single-user deployment migrates cleanly to an owner account with no data loss (snapshot first).
- Scout/Gmail/digest run per-user; one user's automation never writes to another's board.
- Extension/app bind to a single user; clips/sync are correctly attributed.
- Admin can manage users from the web board; secrets are never exposed cross-user.
- With multi-user disabled, behavior is identical to today (no regression).

### Sequencing Note

User accounts + data separation is the **most cross-cutting change in this roadmap** — it touches the store layer, auth, every surface, sync, scout, Gmail, digest, backups, and tokens. **If multi-user is a committed near-term goal, do it before the P1+ feature expansion**: retrofitting tenancy after building the action queue, timeline, and jobs system is far more expensive than building those on a tenant-scoped store. **If it's "future/maybe,"** at minimum land the **tenant-ready data-access layer now** (build P3.1 storage abstraction scoped to an implicit owner) so adding users later is additive, not a rewrite. Pairs naturally with **P3.1 (storage abstraction)** and **P3.3 (schema versioning)**.

---

## P0.7 — Admin Console (multi-user operations) — ✅ DONE (2026-06-24)

**Shipped.** Settings → Admin (admin-only nav). `GET /api/admin/overview` returns server stats
(uptime, user count, total rows, shared-key 30d tokens, SMTP/shared-key/Node) + per-user rows
(roles, applied, AI tokens/cost 30d, disk, last scout, key mode, onboarded/disabled). Operations,
all role-gated and audited to `agent/admin-audit.jsonl` (acting admin + target + action):
- **Digest / Scout** — `POST /api/admin/users/:id/run {action}` runs in the target's tenant scope.
- **Caps** — `action:'setCap'` writes `ASSIST_MONTHLY_TOKENS` / `ASSIST_DAILY_CALLS` to the user's
  settings; `openaiChat()` enforces the rolling-30-day monthly token ceiling.
- **Restore** — `GET /api/admin/users/:id/backups` lists their snapshots; `action:'restore'`
  snapshots-first then restores (shared `restoreData()` helper, never blind-overwrites).
- **Impersonate-for-support** — `POST /api/admin/impersonate/:id` swaps the session cookie to the
  target + sets a signed `crm_imp` admin marker; `/api/me` exposes `impersonatedBy`; the board shows
  a return-to-my-account banner; `POST /api/admin/stop-impersonate` restores the admin. Admin routes
  refuse to act while impersonating (session is the non-admin target).
- **Key grants / reset / disable / delete** — landed with P0.6's Users panel.

### Surface

Web Board (admin-only), Server

### Problem

Multi-user (P0.6) ships the building blocks — per-user accounts, data separation, per-user keys with
an admin shared-key grant — and a minimal Settings → Users panel. But operating a shared deployment
needs a real admin console: a single place to see who's on the server, what they're consuming, and
the health of the box.

### Goal

A dedicated admin console (separate from a normal user's Settings) for running a multi-user Reqon
deployment.

### Requirements

- **Users:** list all users (role, created, disabled, onboarded, last login); create / disable / delete; reset password.
- **Key grants:** per-user toggle of `useSharedKey` (server-funded AI) + see who's on shared vs own keys.
- **Usage statistics:** per-user AI calls / tokens / estimated cost (today / 7d / 30d), pipeline size, last scout; server-wide totals + which users are near caps; cost attribution (shared-key spend by user).
- **Server statistics:** uptime, rowcount per user, disk used per namespace, backup counts, scheduler/last-run health (scout / digest / Gmail per user), data-integrity status (ties into P0.3/P0.4 health endpoints).
- **Operations:** force a per-user scout/digest, snapshot/restore a user's data, impersonate-for-support (audited), set per-user caps.
- Admin console is gated to `role === 'admin'`; all actions audited with the acting admin.

### Acceptance Criteria

- An admin can answer "who's using this, what is it costing, and is it healthy?" without reading files or logs.
- Per-user usage + shared-key cost attribution are visible.
- All admin actions are role-gated and audited; no admin action can silently corrupt a user's data (snapshot first).

### Note

This is a larger follow-on to P0.6 — schedule after the multi-user foundation lands. The minimal
Settings → Users panel (create/disable/reset/grant) is part of P0.6; this item is the full console
(usage + server stats + operations).

---

# 5. P1 — Fast High-Value Parity Wins

---

## P1.1 — Add AI Score / Tailor / Map-Fields UI to Web Board — ✅ DONE (2026-06-24)

**Shipped.** The board's AI assistant modal (✍ AI draft on each row) now exposes server-side scoring:
- **Re-score & explain fit** → `POST /api/assist/score`; renders a current→suggested card
  (fit/prob/tier) + the AI rationale. *Explain Score is folded into this — the rationale is the
  explanation, so one call serves both rather than two near-identical buttons.*
- **Tailor positioning** → `POST /api/assist {kind:'tailor'}` into the editable draft area.
- **Cover note / Screening draft** — pre-existing, retained.
- **Apply suggested scores** — confirm-gated; writes fit/prob/tier to the row and appends a dated
  `[AI score …]` stamp to notes (reviewable audit trail), then persists. No auto-apply, no submit.
- Shows a "no candidate profile" warning when the profile is empty (drives weak scoring).

**Deferred:** *Map Application Fields* — the board has no live web form to map, so map-fields stays
an extension-only capability (it scans real form-field signatures). Revisit if a board-side
"prefill preview" proves useful. Verified e2e against a live OpenAI key; `data.json` unaffected.

### Surface

Web Board

### Current State

Server supports AI score/map-fields. Extension uses this capability. Web board has no UI for it.

### Why This Matters

This is an easy, high-value parity win because the board is the reference surface and should expose server-side AI scoring.

### Requirements

Add role detail actions:

- AI rescore role
- AI explain score
- AI tailor role positioning
- AI map application fields if job description exists
- AI compare role to candidate profile
- Generate screening draft

### UI Placement

Role Detail → AI Assist section.

### Suggested Buttons

```text
Re-score Fit
Explain Score
Tailor Positioning
Map Application Fields
Generate Screening Draft
```

### Output Should Show

- Current score
- Suggested score
- Explanation
- Confidence
- Risks/gaps
- Suggested positioning
- Fields/answers if map-fields used
- Apply changes button where appropriate

### Guardrails

- Do not auto-overwrite fit/prob unless user confirms.
- Keep AI outputs editable.
- Respect budget/cost settings.
- Show when profile is missing.
- Save output to role history, role notes, or dedicated AI output section.

### Acceptance Criteria

- Web board can use the same AI scoring capabilities as extension.
- User can accept/reject suggested score changes.
- Output is saved or reviewable.
- No auto-submit behavior.

---

## P1.2 — Add CV Builder UI to Web Board — ✅ DONE (2026-06-24)

**Shipped.** Two entry points wire the board to the existing CV endpoints:
- **Overflow menu → CV builder…** — general CV from the candidate profile.
- **Per-row → 📄 Tailored CV** — preloads company/role and the row's notes as the JD; `POST /api/cv`
  with a `tailor` object → AI-tailored summary. Stamps `cvBuiltAt`/`cvTailoredFor` on the row.
- Markdown preview + **Download .docx** (`/api/cv.docx`) + **Open print view (PDF)** (`/api/cv.html`),
  cache-busted to reflect the latest build. Profile-missing warning shown when sparse.
- **Multi-user fix:** the CV cache (`cv-latest.json`) is now tenant-scoped (`P.cvCache`) — one user's
  last-built CV can no longer leak into another user's `.docx`/print download.

Verified e2e: general + tailored generation, real `.docx` stream (Word 2007+, 12.5KB), print-view
HTML. `data.json` unaffected (row-stamp path tested with persist stubbed).

### Surface

Web Board

### Current State

CV builder is app-only even though server supports the workflow.

### Goal

Allow full-size web workflow for generating/tailoring CV assets.

### Requirements

Add Web Board → Tools and Role Detail → Build CV.

Capabilities:

- Build general CV
- Build role-tailored CV from selected role
- Use candidate profile
- Use selected narratives
- Use job description
- Export DOCX
- Export PDF if already supported
- Save generated artifact metadata to role

### UI Placement Options

Preferred: both entry points.

```text
Top nav / Tools → CV Builder
Role Detail → Build Tailored CV
```

### Acceptance Criteria

- Web board can generate the same CV outputs as app.
- Role-specific CV generation preloads company, role, and JD.
- Generated files are downloadable.
- Generated artifact is associated with the role.

---

## P1.3 — Add Saved-Answers Library UI to Web Board — ✅ DONE (2026-06-24)

**Shipped.** Settings → Candidate profile now has a **Saved-answers library** (q/a/tags), mirroring
the narrative-library editor: add / edit / remove rows, persisted via `PUT /api/profile`
(`profile.answers[]`, which the server already parsed). The board is now the source-of-truth
management surface; the AI "✍ AI draft" (`kind:'answer'`) grounds in these. Verified e2e: add → save
→ round-trip (1 answer, id assigned) → remove → save (0). Profile is per-tenant, so answers isolate
per user automatically.

### Surface

Web Board

### Current State

Saved-answers library is app-only / extension-consumed.

### Goal

Make the web board the source-of-truth management surface for saved answers.

### Requirements

Add Settings or Tools → Saved Answers.

Fields:

- Question / prompt
- Answer
- Tags
- Category
- Last used
- Source
- Confidence
- Active/inactive
- Notes

Capabilities:

- Add answer
- Edit answer
- Delete/archive answer
- Search
- Filter by tag/category
- Import from profile/narratives if available
- Export JSON
- Test match against a sample question

### Acceptance Criteria

- User can manage saved answers from web.
- Extension/app consume the same library.
- No need to edit JSON manually.

---

## P1.4 — Add Interview Guide Viewing to App Role Detail

### Surface

Native App

### Current State

Interview guides exist on server/web/extension surfaces, but app role detail does not fully expose them.

### Goal

Make app useful during interview prep.

### Requirements

Role Detail should show:

- Interview guide status
- Last generated date
- View guide
- Refresh/regenerate guide if allowed
- Copy sections
- Open role posting from guide
- Save guide offline if feasible

### Acceptance Criteria

- User can view interview guide on phone/iPad.
- App does not require returning to web for prep.
- Guide output is readable on small screens.

---

## P1.5 — Add AI Score / Map-Fields to App Apply Assist

### Surface

Native App

### Current State

App has apply-side power but lacks some extension-led AI scoring/map-fields functionality.

### Goal

Bring AI score/tailor/map-fields into the native apply flow.

### Requirements

In Role Detail and/or Apply Assist:

- Re-score role
- Explain fit/prob
- Map application fields using JD
- Suggest saved answers
- Tailor positioning
- Generate screening draft

### Acceptance Criteria

- App can do AI-assisted application prep.
- User can review and edit all outputs.
- No auto-submit behavior.

---

## P1.6 — Expand App Analytics

### Surface

Native App / iPad App

### Current State

App analytics are partial: KPIs and funnel-like summary, but not full web analytics.

### Goal

Bring mobile analytics closer to web board parity.

### Required Analytics Sections

- Funnel
- Status distribution
- Tier distribution
- Remote distribution
- Sector distribution
- Salary distribution
- Company distribution
- Role/title distribution
- Level/seniority distribution
- Application velocity
- Fit-by-outcome
- Response rate
- Source quality
- Expected value ranking
- Pipeline health insights

### iPhone UI

Use cards and drill-in sections.

### iPad UI

Use master-detail analytics layout if practical.

### Acceptance Criteria

- App analytics are useful beyond three basic KPIs.
- User can understand pipeline health from mobile.
- Analytics include insights/recommendations, not just charts.

---

## P1.7 — Expand App Profile Fields

### Surface

Native App

### Current State

Web board has richer profile fields. App has partial profile support.

### Goal

Allow the app to view/edit key profile fields used by scoring and AI.

### Fields to Add

- Summary
- AI-drafted summary
- Seniority terms
- Target role terms
- Sector preferences
- Keywords
- Negative keywords
- Desired salary
- Location/remote preference
- Narrative snippets
- Applicant info
- Links
- Saved answer access or link

### Acceptance Criteria

- App can edit the most important profile fields.
- App does not need to expose every advanced setting.
- Changes sync back to server.

---

## P1.8 — Mirror Web Notifications Bell in App

### Surface

Native App

### Current State

Web has notification engine/bell. App does not fully mirror it.

### Goal

Add in-app notification feed.

### Requirements

App notification feed should show:

- New roles
- Follow-up due
- Recruiter reply
- Rejection detected
- Interview/offers needing review
- Enrichment failed
- Scout completed
- Sync issue
- AI budget warning

### Important

This is an in-app feed first. Native push can remain future/EAS-build dependent.

### Acceptance Criteria

- App shows the same notification concepts as web.
- User can dismiss/mark read.
- App makes clear whether native push is enabled or unavailable.

---

## P1.9 — Add App Settings Catch-Up

### Surface

Native App

### Goal

Expose the newest high-value settings added on web.

### Settings to Add

- Notification channels/preferences
- Source visibility
- Salary target
- Scout mode
- AI model view/status
- Sync health
- Pairing status
- Gmail ingest status
- Theme if already app-only

### Acceptance Criteria

- App covers common personal workflow settings.
- Advanced admin settings can remain web-only.

---

# 6. P1 — Extension Focused Improvements

---

## P1.10 — Improve Extension Clip Capture — ✅ DONE (2026-06-24)

**Shipped.** At clip time the content script now reads salary, remote/hybrid/onsite, ATS/source,
apply mode, posting id, and a JD excerpt off the live page (`captureMeta()` in `content.js`, built on
pure, unit-tested helpers in `lib.js`: `detectATS`/`detectRemote`/`extractSalary`/`captureConfidence`).
The clip confirmation panel shows **Captured / Confidence (High·Med·Low) / Detected / Needs review**
before anything is sent; the richer fields flow through `quickadd` (salary/remote/source/notes).
Low-confidence clips read as leads to enrich. 10 lib unit tests pass; payload round-trip verified.

### Surface

Chrome Extension

### Current State

Extension clips roles and can mark applied. Small enhancements would improve captured data quality.

### Requirements

At clip time, attempt to capture:

- Salary
- Location
- Remote/hybrid/onsite
- Company
- Role
- ATS/source
- Apply mode
- Fillability hint
- Job description excerpt
- Posting ID
- Confidence level

### Clip Confirmation UI

Show:

```text
Captured: Company — Role
Confidence: Medium
Detected: Remote, salary range, Greenhouse
Needs review: seniority unclear
```

### Acceptance Criteria

- Clipped leads arrive with richer metadata.
- Low-confidence clips are flagged for Lead Inbox.
- The user understands what was captured.

---

## P1.11 — Add Apply-Mode / Fillability Hint on Page Overlay — ✅ DONE (2026-06-24)

**Shipped.** The overlay shows a fillability line — **Easy Apply / Likely fillable / Partially
fillable / Manual-heavy / External redirect / Unknown** — with the reasons in a tooltip
(`fillabilityHint()` in `lib.js`, fed by a live `formStats()` count of inputs/textareas/file/password
fields). The Fill button is hidden on external-redirect (account-gated) postings where it can't help.
Unit-tested across ATS + form shapes.

### Surface

Chrome Extension

### Goal

Use extension page context to tell the user whether the application is easy, fillable, or manual-heavy.

### Hints

```text
Easy Apply
Standard ATS
Likely fillable
Partially fillable
Manual-heavy
External redirect
Unknown
```

### Requirements

Overlay should show:

- Apply mode
- Fillability estimate
- Fill button only when useful
- Reasons for low fillability
- Map fields action where supported

### Acceptance Criteria

- User can decide whether to apply from the page faster.
- Fillability signal is written back to role if useful.

---

## P1.12 — Add Custom Note / Tag at Clip — ✅ DONE (2026-06-24)

**Shipped.** The clip confirmation panel has optional **note**, **tag**, and **priority** fields.
They're folded into the row's notes (`Note: … / Tags: … / Priority: …`) so they surface on the board
with no schema change. Captured before the row is created — "why I saved this" without opening the
board.

### Surface

Chrome Extension

### Goal

Allow quick context capture while clipping.

### Requirements

After clicking clip:

- Optional note field
- Optional tag
- Optional priority
- Optional source note
- Save with role

### Acceptance Criteria

- User can capture “why I saved this” without opening the board.

---

## P1.13 — Add Autofill Summary — ✅ DONE (2026-06-24)

**Shipped.** After Fill runs, the overlay shows a summary panel: factual fields filled, saved answers
inserted, AI-mapped fields (when smart-fill), and what was deliberately skipped (EEO/consent, file
upload, login) via `skipTally()`. Includes a review reminder and a **Clear highlights** action that
removes the green field outlines (`highlighted[]` tracking). Replaces the old one-line toast.

### Surface

Chrome Extension

### Goal

After the extension fills a form, the user should know exactly what changed.

### Requirements

After Fill runs, show:

- Factual fields filled
- Saved answers inserted
- Fields skipped
- EEO/consent skipped
- File upload skipped
- Review reminder
- Clear highlights action

### Acceptance Criteria

- User understands exactly what the extension changed.
- The fill workflow feels controlled and safe.

---

## P1.14 — Add Queue Visibility — ✅ DONE (2026-06-24)

**Shipped.** The popup shows a **Pending sync** section when the offline queue is non-empty: queued
count, per-item labels (clip / mark-applied), last-retry time, last error, with **Retry now**,
per-item **discard** (✕), and **Clear all**. Backed by new `bg.js` messages
(`queueStatus`/`queueRetry`/`queueDiscard`/`queueClear`) and `queueLastRetry`/`queueLastError`
tracking in `flushQueue()`.

### Surface

Chrome Extension

### Goal

The extension already queues failed writes. Make the queue visible and manageable.

### Requirements

Popup/side panel should show:

- Queued action count
- Queued clips
- Queued mark-applied actions
- Last retry time
- Last error
- Retry now
- Discard action
- Clear all queue

### Acceptance Criteria

- Offline behavior is transparent.
- User can manage queued actions.

---

# 7. P2 — Unified Action Queue and Operating System Layer

---

## P2.1 — Create Unified Action Item Model — ✅ DONE (2026-06-24)

**Shipped.** `lib/action-items.js` (`computeActionItems(rows, ctx)`) is a pure, deterministic
derivation of normalized action items from the live store + config; `GET /api/action-items` exposes
them with `?surface=web|app|extension` and `?type=…` filters, plus severity counts. Types covered
server-side: apply_next, follow_up_due, review_interview/offer/rejection, verify_role, needs_scoring,
enrich_failed, duplicate_review, profile_missing, gmail_setup_needed, ai_budget_warning, scout_error.
(`queued_sync`/`queued_extension_action` stay client-owned — the server can't see chrome.storage.)
Each item carries severity, priority, reason, source, and a cta target. 8 unit tests; verified live
(64 actions on the 191-row board, correctly ranked; filters work). This is the shared model P2.2/P2.3
consume.

### Surface

Server, Web Board, App, Extension

### Problem

Reqon has many fragmented action concepts:

- Today
- Follow-up due
- Needs verify
- Needs enrichment
- Closed req
- Gmail positive review
- Gmail rejection
- Queued scout
- Extension queued action
- Duplicate suspect
- Apply next

### Goal

Create one normalized action system.

### Action Item Shape

```json
{
  "id": "action-roleid-type",
  "type": "apply_next",
  "roleId": "uuid",
  "company": "Company",
  "role": "Role",
  "severity": "high",
  "priority": 90,
  "reason": "Tier A role with high EV and remote match",
  "source": "score",
  "createdAt": "...",
  "dueAt": "...",
  "resolved": false,
  "cta": {
    "label": "Open role",
    "target": "role-detail"
  }
}
```

### Action Types

```text
apply_next
follow_up_due
verify_role
review_rejection
review_interview
review_offer
enrich_failed
needs_scoring
duplicate_review
closed_posting
queued_sync
queued_extension_action
queued_scout
profile_missing
gmail_setup_needed
ai_budget_warning
```

### API

```http
GET /api/action-items
GET /api/action-items?surface=web
GET /api/action-items?surface=app
GET /api/action-items?type=follow_up_due
```

### Acceptance Criteria

- Action items are deterministic.
- Web/app/extension consume the same action model.
- Every action has a reason and recommended next step.

---

## P2.2 — Web “What Changed” Command Center — ✅ DONE (2026-06-24)

**Shipped.** A collapsible **⚡ What needs action** panel at the top of the board consumes
`GET /api/action-items?surface=web` and groups items into sections (Needs review · Follow-ups due ·
Apply next · Lead inbox · Duplicates · Rejections processed · Setup & system), sorted by priority
with high/medium/low severity-count pills. Each item shows company — role + the action reason and a
severity dot; clicking opens the role (uses the board's own `tabKeyForStatus` mapping so the right
tab — incl. custom tabs — is selected, all tiers expanded, then scroll + flash). Global items
deep-link into the matching Settings section. Per-item dismiss (session-only, honoring the no-
localStorage rule — deterministic items recompute on reload) + collapse toggle. Verified live on the
191-row board; no console errors.

*Deferred:* "new roles / enriched roles" deltas (change-feed, not actionable items) and client-owned
`queued_sync`/`queued_extension_action` sections — the panel focuses on actionable server-derived items.

### Surface

Web Board

### Goal

Opening the board should immediately answer:

- What changed?
- What matters?
- What needs action?
- What should I do next?

### Sections

- New roles
- Enriched roles
- Lead Inbox
- Rejections processed
- Interviews/offers needing review
- Follow-ups due
- Closed postings
- Sync issues
- Extension queued actions
- Scout/source errors

### UI Behavior

- Collapsible
- Sorted by priority/severity
- Each item links to role detail or settings
- Dismiss/mark reviewed where appropriate

### Acceptance Criteria

- User can understand the state of the job search in under 10 seconds.
- Items link to the relevant role or setting.
- No duplicate competing alert systems.

---

## P2.3 — App Today Uses Unified Action Queue

### Surface

Native App

### Goal

Make Today the mobile action command center.

### Sections

- Apply next
- Follow up
- Review recruiter response
- Verify captured lead
- Needs scoring
- Sync/offline issues

### Acceptance Criteria

- App Today is action-based, not just list-based.
- Pull-to-refresh updates actions.
- Actions link to role detail.

---

## P2.4 — Lead Inbox / Needs Enrichment Lane

### Surface

Web Board, App, Extension

### Goal

Make captured but incomplete roles visible and manageable.

### Include Roles Where

- `reqCheck = lead`
- `needsEnrichment = true`
- fit/prob missing
- conf = unverified
- enrichment failed
- source = manual/chrome/mobile quick-add

### Lead States

```text
Captured
Enriching
Enrichment failed
Needs review
Ready to score
Duplicate suspected
Posting unavailable
```

### Web UI

Add Lead Inbox or hygiene lane with:

- Count of lead inbox items
- Batch run enrichment
- Mark duplicate
- Archive
- Score manually
- Promote to open

### App UI

Show Lead Inbox in Today/action queue.

### Extension UI

After clipping:

- Show “Captured — enrichment pending”
- Show confidence
- Offer “Open in Reqon”

### Acceptance Criteria

- Quick-add leads no longer look like bad Tier C roles.
- User can batch triage captured leads.
- Enrichment failure is visible and actionable.

---

## P2.5 — Per-Role Timeline — ✅ DONE (2026-06-24)

**Shipped.** `GET /api/reqs/:key/timeline` reconstructs a role's history deterministically from its
own timestamped fields (captured/verified/applied/interview/guide/follow-up) + its enrichment-log
entries (score / status / conf changes, enrichment pass-fail, notes) via pure `lib/timeline.js`
(`buildTimeline`, 5 unit tests). Events are newest-first and tagged with an **actor** (you / scout /
ai / auto) so user actions are distinguishable from automation. Web UI: a **📜 Timeline** button on
each role card opens a modal with a rail of dated, icon-tagged events. The enrichment + change logs
are now tenant-scoped (`P.enrichLog` / `P.changeLog`) so timelines never leak across users. Verified
live (Klaviyo → captured / verified / applied) with no console errors.

### Surface

Web Board, App

### Goal

Role detail should explain how a role got here and what happened.

### Timeline Events

- Captured from extension
- Captured from mobile quick-add
- Scout found role
- Merged from source
- Enrichment started
- Enrichment completed
- Score changed
- Marked applied
- Gmail rejection detected
- Interview detected
- Offer detected
- Guide generated
- Follow-up due
- Notes edited
- Sync conflict
- Archived

### API

```http
GET /api/reqs/:id/timeline
```

or:

```http
GET /api/reqs/:key/timeline
```

### Acceptance Criteria

- User can see automation history without raw logs.
- Timeline distinguishes user actions from automated changes.
- Role detail explains why the role is in its current state.

---

# 8. P2 — Analytics and Decision Support

---

## P2.6 — Pipeline Health Score — ✅ DONE (2026-06-24)

**Shipped.** `GET /api/pipeline-health` (pure `lib/pipeline-health.js`, 4 unit tests) turns the live
pipeline into a band (Good / Fair / At risk) + score, the weighted **main risk**, deterministic
**metrics** (apply-ready Tier A/B, applied 7d, response/rejection rate, follow-ups overdue, aging
14d+ apps, avg EV) and **recommendations** mapped to action surfaces. Web: a health banner atop the
Analytics tab with metric chips and clickable recommendations that jump to the relevant view
(run-scout / apply-next / follow-ups / interviewing). Verified live (Fair · 74/100 · "47 apps aging
14+ days, 2% response rate" on the real board); no console errors. Recommendations reuse the action
vocabulary from P2.1.

### Surface

Web Board, App Analytics

### Goal

Analytics should produce recommendations, not just charts.

### Output Example

```text
Pipeline health: Good
Main risk: not enough new Tier A/B roles this week.
Recommended action: run scout and apply to 3 high-EV roles.
```

### Inputs

- Active A/B roles
- Applied last 7 days
- Response rate
- Interview conversion
- Rejection rate
- Follow-ups overdue
- Roles needing review
- Average EV
- Source quality
- Time in stage
- Applications aging without response

### Acceptance Criteria

- Analytics tells the user what to do next.
- Health score is visible on web and app.
- Recommendations link to relevant actions.

---

## P2.7 — Source Quality Analytics

### Surface

Web Board, App Analytics

### Metrics

- Roles found by source
- A/B rate by source
- Applied rate by source
- Response rate by source
- Interview rate by source
- Duplicate rate
- Closed/unavailable rate
- Manual capture conversion

### Acceptance Criteria

- User can decide which sources to enable, disable, or prioritize.
- Analytics support scout/source configuration decisions.

---

## P2.8 — Follow-Up Recommendation Engine — ✅ DONE (2026-06-24)

**Shipped.** `GET /api/reqs/:key/followup` (pure `lib/followup.js`, 5 unit tests) returns a stage-aware
recommendation for applied/interviewing/offer roles: due state (due/soon/scheduled), suggested
channel, timing reason, known contact, and suggested date. The message itself is drafted on demand
via `POST /api/assist {kind:'followup'}` — grounded in narratives, 60–110 words, copy-not-send. Board:
a **💬 Follow-up** button on applicable role cards opens a modal with the recommendation, an AI
**Draft message**, **Copy**, and **Mark sent** (sets last-contact = today, never auto-sends). Follow-up
timing already feeds the unified action queue via P2.1's `follow_up_due`. Verified live (Klaviyo:
Recruiter Screen, 21 days → Due now, real drafted message); no console errors.

### Surface

Web Board, App

### Goal

Make follow-ups easier and less manual.

### Requirements

For applied/interviewing roles, generate:

- Follow-up due state
- Suggested channel
- Suggested message
- Reason for timing
- Recruiter/contact if known
- One-click copy
- Mark sent

### Acceptance Criteria

- Follow-ups become actionable items.
- User can copy/edit, never auto-send.
- Follow-up logic feeds unified action queue.

---

# 9. P2 — Background Jobs and Automation

---

## P2.9 — Unified Background Job System

### Surface

Server, Web Board, App

### Goal

Scout, enrichment, Gmail ingest, guide generation, digest, and AI tasks should share one job/status model.

### Job Types

```text
scout
enrichment
gmail_ingest
interview_guide
ai_assist
digest
backup
data_repair
```

### API

```http
POST /api/jobs
GET /api/jobs
GET /api/jobs/:id
POST /api/jobs/:id/cancel
```

### Job Shape

```json
{
  "id": "job_uuid",
  "type": "scout",
  "status": "queued|running|succeeded|failed|cancelled",
  "phase": "fetching Greenhouse",
  "progress": 42,
  "createdAt": "...",
  "startedAt": "...",
  "finishedAt": "...",
  "result": {},
  "error": ""
}
```

### Acceptance Criteria

- Scout uses job model.
- Enrichment uses job model.
- Gmail ingest uses job model.
- UI shows running/recent jobs.
- Jobs can be observed without reading logs.

---

## P2.10 — AI-Assisted Role Research Packet

### Surface

Web Board, Native App

### Goal

For high-value roles, generate a concise research packet.

### Inputs

- Job description
- Company
- Role
- User profile
- Resume keywords
- Existing narratives
- Product/domain fit

### Output Sections

- Why this role fits
- Likely interview themes
- Gaps to prepare for
- Company/product notes
- Questions to ask
- Suggested positioning
- Relevant user stories
- Follow-up angle

### Acceptance Criteria

- User can generate packet from role detail.
- Output is editable.
- Output is saved to role.
- AI budget respected.

---

## P2.11 — AI Score Explanation / Critic

### Surface

Server, Web Board, App

### Goal

When a role is scored or rescored, provide explanation and critique.

### Output Example

```text
Fit score: 8.4
Why: platform PM, enterprise SaaS, AI workflow, data products.
Risks: healthcare domain, unclear remote policy, title may be below target seniority.
Confidence: medium because salary and reporting line are missing.
Recommended action: apply if remote confirmed.
```

### Acceptance Criteria

- Works with deterministic fallback.
- Does not overwrite scores without user review unless explicitly configured.
- Explanation is stored separately from score.

---

# 10. P3 — Longer-Term Architecture

---

## P3.1 — Storage Abstraction

### Surface

Server

### Goal

Prepare for optional SQLite without forcing migration now.

### Interface

```js
store.readRows()
store.writeRows()
store.patchRow()
store.appendRows()
store.snapshot()
store.restore()
```

### Acceptance Criteria

- JSON behavior remains unchanged.
- Storage logic is isolated.
- SQLite can be added later.
- Existing tests still pass.

---

## P3.2 — Optional SQLite Server Backend

### Surface

Server

### Goal

Improve reliability if JSON-file persistence becomes limiting.

### Requirements

- Keep JSON default
- Add SQLite option behind env/config flag
- Migration utility from JSON to SQLite
- Backup/restore compatibility

### Acceptance Criteria

- Existing users are not forced to migrate.
- SQLite can be tested separately.
- JSON remains default unless explicitly changed.

---

## P3.3 — Schema Versioning

### Surface

Server, App, Extension

### Goal

Protect cross-surface compatibility.

### Requirements

Add row schema version:

```json
{
  "schemaVersion": 2
}
```

Helpers:

```js
migrateRow(row)
migrateStore(rows)
```

### Acceptance Criteria

- Old rows upgrade safely.
- App handles older server rows.
- Extension ignores unknown fields safely.
- Migrations snapshot data first.

---

## P3.4 — Public Demo Mode

### Surface

Web Board, App, README

### Goal

Make Reqon easier to show publicly without exposing personal data.

### Requirements

- Demo seed mode
- Fake profile
- Fake roles
- Fake recruiter events
- Fake analytics
- Reset demo button
- Hide secrets/settings
- Demo screenshots

### Acceptance Criteria

- Public repo is safe and polished for recruiters/interviewers.
- Demo mode does not expose personal data.

---

# 11. Screen-by-Screen Roadmap Summary

---

## 11.1 Web Board

### P0

- System Health
- Sync Health
- Data integrity checker
- Clear `/m` strategy documentation
- Settings health checklist foundation
- **Login + per-user session; user menu (who am I · log out) — P0.6**
- **Settings → Users (admin: create/disable/reset/role)**

### P1

- AI score/tailor/map-fields UI
- CV builder UI
- Saved-answers library UI
- Role detail score explanation
- Settings health checklist completion

### P2

- What Changed command center
- Unified action queue
- Lead Inbox
- Role timeline
- Pipeline health score
- Source quality analytics
- Follow-up recommendations

### P3

- Storage abstraction controls
- Demo mode
- Schema migration visibility

---

## 11.2 Native App / iPad App

### P0

- Dependency stabilization
- Sync Health screen
- Pairing/setup validation
- **Per-user login/pairing — device binds to one user; user-scoped sync token — P0.6**

### P1

- Expanded analytics
- Expanded profile fields
- AI score/map-fields in apply assist
- Interview guide viewing
- Notifications feed
- Newer settings catch-up

### P2

- Today from unified action queue
- Lead Inbox
- Role timeline
- Pipeline health insights
- Offline outbox visibility
- Role research packet

### P3

- Native push notifications
- Advanced admin settings if needed
- Demo mode support

---

## 11.3 Mobile Web `/m`

### P0

- Declare as lightweight check-in
- Update README/UI copy
- **Per-user login before any data is shown — P0.6**

### P1

Keep minimal:

- Search
- Filter
- View details
- Open posting
- Basic status visibility
- Optional quick-add if stable
- Optional mark-applied if safe

### Do Not Prioritize

- Full analytics
- Settings
- AI
- CV builder
- Saved answers
- Profile editor
- Notification engine
- Full parity

---

## 11.4 Chrome Extension

### P0

- Connection/queue visibility
- Safety/permission onboarding
- **Per-user token — clips/mark-applied land in the right user's board — P0.6**

### P1

- Better salary/location capture at clip
- Apply-mode/fillability hint
- Custom note/tag at clip
- Clip confidence meter
- Autofill summary

### P2

- Side panel role detail parity
- Map-fields UX improvements
- Better JD extraction
- Open role in Reqon
- Queue management

### Do Not Prioritize

- Full pipeline management
- Full settings
- Full analytics
- Backup/restore
- Source management

---

## 11.5 Server / API

### P0

- Sync health endpoint
- Deep health endpoint
- Data integrity checker
- Safe data repair
- Status transition helper
- **User accounts + per-user data namespacing (multi-tenant store) — P0.6**
- **Tenant-resolver middleware (one place enforces isolation)**
- **Single-user → owner migration (snapshot first)**

### P1

- AI score/tailor/map-fields support for board/app UI
- CV builder endpoints used by web
- Saved-answer management endpoints used by web
- App profile sync expansion

### P2

- Action item endpoint
- Timeline endpoint
- Job system
- Lead Inbox state model
- Pipeline health calculation

### P3

- Storage abstraction
- SQLite option
- Schema versioning
- Demo mode support

---

# 12. Recommended Execution Order

---

## Sprint 0 — Multi-User Foundation *(only if multi-user is in scope; must precede feature work)*

### Goals

- Land user accounts + strict per-user data separation on the shared backend before features assume a single tenant.
- Avoid an expensive retrofit later (every surface, token, sync path, and background job becomes user-aware here).

### Work Items

1. Tenant-scoped store layer (`data/<userId>/…`) + one tenant-resolver middleware.
2. User accounts + auth (hashed passwords, per-user sessions); first-run admin bootstrap.
3. Per-user scoped ingest tokens + pairing codes.
4. Web/`/m` login; app per-user pairing; extension per-user token.
5. Per-user scout/Gmail/digest execution.
6. Single-user → owner migration (snapshot first); legacy single-user mode preserved.
7. Isolation tests: User A cannot read/write User B's data via any route or token.

### Expected Outcome

Two people (e.g., Dustin and Eric) use one Reqon server with fully separate boards. If multi-user is **not** in scope yet, skip this sprint but still build the storage abstraction (Sprint 7 / P3.1) scoped to an implicit owner so adding users later is additive.

---

## Sprint 1 — Stabilize and Define Surface Roles

### Goals

- Stop widening confusion between web, app, mobile web, and extension.
- Add health visibility.
- Make setup trustworthy.

### Work Items

1. Stabilize app dependencies and README.
2. Declare `/m` lightweight mobile check-in.
3. Add `/api/sync/health`.
4. Add `/api/health/deep`.
5. Add Web Settings → System Health.
6. Add App Settings → Sync Health shell if app work is reasonable.
7. Add Extension popup connection/queue status shell.

### Expected Outcome

Reqon becomes easier to trust and easier to reason about before more functionality lands.

---

## Sprint 2 — Quick Web Parity Wins

### Goals

Close the most surprising high-value gaps on the web board.

### Work Items

1. Add AI score/tailor/map-fields UI to web role detail.
2. Add CV builder to web.
3. Add saved-answers library to web.
4. Add Settings health checklist.

### Expected Outcome

The web board becomes the true reference surface again.

---

## Sprint 3 — App Catch-Up

### Goals

Bring app closer to board parity where mobile value is high.

### Work Items

1. Expand app analytics.
2. Expand app profile fields.
3. Add app interview-guide viewing.
4. Add app AI score/map-fields in Apply Assist.
5. Add app notification feed.
6. Add newer settings catch-up.

### Expected Outcome

The app becomes useful for real mobile management, not just lightweight review.

---

## Sprint 4 — Extension Apply-Side Polish

### Goals

Make the extension more useful where it should lead: page context and application flow.

### Work Items

1. Improve clip capture for salary/location/remote/apply mode.
2. Add clip confidence meter.
3. Add fillability/apply-mode hint.
4. Add autofill summary.
5. Add custom note/tag at clip.
6. Add queue visibility.

### Expected Outcome

The extension feels safe, useful, and intentionally scoped.

---

## Sprint 5 — Operating System Layer

### Goals

Move from many scattered alerts/lists to one action model.

### Work Items

1. Add unified action item model.
2. Add `/api/action-items`.
3. Add Web What Changed panel.
4. Add App Today action queue.
5. Add Lead Inbox.
6. Add role timeline.

### Expected Outcome

Reqon starts telling the user what changed and what to do next.

---

## Sprint 6 — Analytics and Intelligence

### Goals

Make analytics actionable, not just descriptive.

### Work Items

1. Add pipeline health score.
2. Add source quality analytics.
3. Add AI score explanation/critic.
4. Add follow-up recommendation engine.
5. Add role research packet.

### Expected Outcome

Reqon becomes a decision-support system, not just a tracker.

---

## Sprint 7 — Architecture Hardening

### Goals

Prepare for growth and public/demo use.

### Work Items

1. Add storage abstraction.
2. Add schema versioning.
3. Add optional SQLite backend.
4. Add public demo mode.

### Expected Outcome

Reqon becomes more durable, maintainable, and demo-ready.

---

# 13. Highest-Value Immediate PRs

---

## PR 0 — Multi-User Identity & Data Separation *(only if multi-user is in scope)*

### Scope

- Tenant-scoped store (`data/<userId>/…`) + single tenant-resolver middleware.
- User accounts + auth (hashed passwords, per-user sessions, first-run admin).
- Per-user ingest tokens + pairing; web/`/m` login, app per-user pairing, extension per-user token.
- Per-user scout/Gmail/digest; single-user → owner migration (snapshot first); legacy mode preserved.
- Settings → Users (admin); isolation tests (A cannot access B).

### Why First (if pursued)

Multi-tenancy is the one change that, if deferred, forces reworking every other surface and background job later. Building the action queue, timeline, and jobs system on a single-tenant store and then adding users is a rewrite; building them on a tenant-scoped store is not. If multi-user is *not* near-term, skip this PR but land the storage abstraction (PR for P3.1) scoped to an implicit owner.

---

## PR 1 — Surface Strategy + Health Foundation

### Scope

- Update README to define:
  - Web board as reference surface
  - App as real mobile parity target
  - `/m` as lightweight read-only/check-in
  - Extension as apply-side companion
- Add `/api/sync/health`
- Add `/api/health/deep`
- Add Web Settings → System Health
- Add App Settings → Sync Health shell if reasonable
- Add Extension popup connection/queue status shell

### Why First

This gives the product a stable foundation before more features widen surface gaps.

---

## PR 2 — Web AI + CV + Saved Answers Parity

### Scope

- Add AI score/tailor/map-fields UI to web role detail.
- Add web CV builder entry point.
- Add web saved-answers library manager.
- Reuse existing server endpoints where possible.
- Do not build apply-form-fill into the board.

### Why Second

This closes the most surprising parity gaps quickly:

- Extension has AI score/map-fields, but board does not.
- App has CV builder/saved answers, but board does not.
- Web board should be the full reference surface.

---

## PR 3 — App Analytics + Profile Catch-Up

### Scope

- Expand analytics distributions in app.
- Add profile fields needed for scoring/AI.
- Add salary-target setting.
- Add source visibility setting.
- Add app notification feed shell.

### Why Third

The app is the mobile parity target. These are the largest user-visible app gaps.

---

## PR 4 — Extension Capture + Fillability Polish

### Scope

- Capture salary/location/remote/apply mode at clip.
- Show clip confidence.
- Show fillability/apply-mode hint.
- Show autofill summary.
- Allow note/tag at clip.

### Why Fourth

The extension should lead apply-side workflows, and these are natural improvements within its scope.

---

## PR 5 — Unified Action Queue

### Scope

- Add server-generated action item model.
- Add `/api/action-items`.
- Add web What Changed panel.
- Add app Today action queue.
- Add Lead Inbox foundation.

### Why Fifth

This turns Reqon from a set of features into a guided operating system.

---

# 14. Claude Development Rules

## General Product Rules

- Keep `/m` intentionally small.
- Do not chase universal parity.
- Prefer web as reference/source-of-truth.
- Prefer app as mobile parity target.
- Prefer extension as page-context/apply-side tool.
- Move shared logic into core before duplicating behavior.
- Preserve user data.
- Snapshot before repair/migration.
- Do not auto-submit applications.
- AI outputs must be reviewable/editable.
- Offline actions must be visible.
- Automated state changes should leave timeline/audit evidence.
- Once multi-user is enabled, **every** data read/write/sync/export/backup must be scoped to the authenticated user; never trust a client-supplied user id.
- Enforce tenant isolation in one shared resolver/middleware, not per-endpoint.
- A user must never see, infer, or affect another user's data, tokens, or automation.
- Single-user deployments must keep working unchanged (implicit owner) when multi-user is off.

---

## Technical Rules

- Keep changes incremental and testable.
- Prefer shared helpers over copied logic.
- Do not remove existing functionality unless explicitly replacing it.
- Preserve backward compatibility where possible.
- Avoid committing personal data.
- Update README/docs when behavior changes.
- Add tests for shared core behavior.
- Add migration logic for schema changes.
- Use safe defaults.
- Fail visibly, not silently.

---

## PR Checklist

Each PR should include:

```markdown
## Summary

What changed and why.

## User Value

What this improves for the Reqon user.

## Surfaces Changed

- Server
- Web
- App
- Mobile Web
- Extension
- Docs

## Testing

Commands run and results.

## Risk

Any migration, data, auth, sync, or compatibility risks.

## Screenshots

Before/after where relevant.
```

---

## Definition of Done

- Existing tests pass.
- Fresh clone still works.
- No personal data committed.
- README updated if behavior changes.
- UI changes include screenshots.
- Data changes snapshot first.
- Cross-surface behavior is documented.
- No silent failure states added.
- Any new automation is observable.
- Any new AI output is editable/reviewable.
- For multi-user work: cross-tenant isolation is covered by tests (User A cannot read/write User B's data via any route or token), and migration snapshots data first.
