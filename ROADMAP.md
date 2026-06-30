# Reqon Product Roadmap (Master)

*The single source-of-truth roadmap. Surface strategy, parity gaps, and a multi-user-first execution
plan, **now consolidated** — the earlier v2 roadmap (vision, inviolable principles, primary use cases,
phased delivery, risks) has been merged in below and retired, so there is one document to work from.
Per the owner's direction, **multi-user logins + data separation is near-term and sequenced first**
(Sprint 0 / PR 0) so we don't build single-tenant features that need a retrofit. Lives in the repo so
it tracks with the code during the build.*

> **Status legend:** ~~struck-through headings~~ marked **✅ DONE** are shipped/integrated. Items
> tagged *pending device pass* are code-complete but not yet verified on a physical device. Plain
> (un-struck) headings are not yet started. Last status sweep: **2026-06-30**.

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

## Inviolable Principles

*Carried forward from the v2 roadmap — the product invariants every PR is reviewed against. These
predate the multi-user/cloud pivot; principle 8 replaces v2's original "local-first, no third-party
cloud" rule, which the product has since deliberately reversed (Reqon now runs multi-user on
`cloud.reqon.app`).*

1. **Never auto-submit.** Fill factual fields only → highlight every filled field → the human reviews
   and submits. No exceptions, ever.
2. **Never fill sensitive fields.** Hard denylist: passwords, SSN/government IDs,
   EEO/demographics/disability/veteran status, consent/attestation checkboxes, salary (unless
   explicitly configured).
3. **No LinkedIn scraping or automation.** Board APIs + email ingest only. Zero ToS exposure
   (no Glassdoor/Blind scraping either — retrieval goes through compliant search/board APIs).
4. **Append-only merge + req-ID dedupe everywhere.** New rows append; tracking edits are never
   overwritten; distinct same-title postings coexist (posting-id aware).
5. **Non-destructive by default.** Snapshots before mutation; tombstones, not hard deletes;
   shrink-guard on full writes.
6. **Honest scoring, the user's voice.** Conservative fit/prob with visible caveats; AI drafts sound
   like the candidate (plain, PM-altitude, no filler) — never "ChatGPT-polished." **Never fabricate**
   salaries, links, numbers, quotes, or names.
7. **All settings live in the UI.** Every knob editable in-product and persisted server-/app-side;
   nothing config-file-only; secrets masked (write-only set/last4 status).
8. **Privacy & tenant isolation (supersedes v2's local-only rule).** Per-user data separation via a
   namespaced store with one-place tenant-resolver enforcement; hashed passwords; per-user sessions;
   per-user API keys by default; no cross-tenant data/token access. PII stays in the authenticated
   store and never enters anonymized aggregates except as non-identifying metrics (see §15.11).

---

## Primary Use Cases

*Carried forward from the v2 roadmap. The capture/apply/sync loop these describe is now substantially
shipped; they remain the canonical framing for what Reqon is for.*

| ID | Use case | Surface(s) |
|----|----------|-----------|
| UC-1 | **Capture anywhere** — see a posting in any app/browser on any device; one action adds it; enrichment fills company/role/location/sector + score automatically | App share-ext, extension, iOS/macOS shortcut, bookmarklet, ChatGPT |
| UC-2 | **Apply on mobile, CRM stays current** — open the posting in the in-app browser; factual fields pre-fill from the on-device profile; finish + submit manually; one tap marks Applied with today's date | App (WKWebView) |
| UC-3 | **Apply on desktop, CRM stays current** — apply in Chrome (Simplify fills); click "Mark applied" in the extension; the board updates instantly | Extension |
| UC-4 | **Morning push triage** — 7am scout runs on the server; phone receives "6 new · 2 follow-ups due"; tap → app opens → synced Today view | Server + app |
| UC-5 | **Serverless operation** — Mac asleep/away: app still captures, enriches, scores, triages, and notifies locally; best-effort background scout; syncs when the server returns | App |
| UC-6 | **Guided personal answers** — per screening question choose Auto / Example / Guided; Guided asks 1–3 tap-questions then drafts in the candidate's voice from the narrative library; refine via reaction chips; save good answers as reusable snippets | App + server + desktop board |
| UC-7 | **Two-device convergence** — apply on the phone at lunch; the desktop board shows Applied that evening. Capture via ChatGPT on desktop; it appears on the phone after sync | All |
| UC-8 | **Fit overlay while browsing** — on a job page, the extension badges fit/prob/EV + status if tracked, or offers one-click clip if not | Extension |
| UC-9 | **Workday/unknown-ATS assist** — in the in-app browser, the field matcher fills what it can confidently identify (autocomplete attrs → ATS adapters → fuzzy → LLM fallback), highlights its work, skips what it can't; user finishes + submits | App (WKWebView) |

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

## P4 — Strategic Network Effects (foundational, long-horizon)

Build proprietary data assets and discovery capabilities that compound over time and become a
defensible moat. **Explicitly post-MVP** — these do not block or alter current MVP priorities.
See [§15 Strategic Initiative: Reqon Intelligence Network](#15-strategic-initiative-reqon-intelligence-network).

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

## ~~P0.6 — User Logins and Data Separation (Multi-User)~~ — ✅ DONE (2026-06-26)

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

## ~~P0.7 — Admin Console (multi-user operations)~~ — ✅ DONE (2026-06-24)

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

## ~~P1.1 — Add AI Score / Tailor / Map-Fields UI to Web Board~~ — ✅ DONE (2026-06-24)

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

## ~~P1.2 — Add CV Builder UI to Web Board~~ — ✅ DONE (2026-06-24)

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

## ~~P1.3 — Add Saved-Answers Library UI to Web Board~~ — ✅ DONE (2026-06-24)

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

## ~~P1.4 — Add Interview Guide Viewing to App Role Detail~~ — ✅ DONE (2026-06-24, pending device pass)

**Shipped (code + jest; needs device pass).** New server route `GET /api/reqs/:key/guide.json` returns
the stored guide markdown (or `exists:false`) as authed JSON — so the app renders it natively instead
of fighting WebView auth on the styled HTML page. App: `fetchGuide`/`generateGuide`/`reqKey` in
`sync/assist.ts`, a `GuideModal` with a lightweight markdown renderer (headings/bullets/paragraphs) +
Generate-when-missing + Share, and an **Interview prep guide · AI** button on RoleDetail for
interview-stage rows. tsc clean, 71 jest tests green; `guide.json` verified live. *Device pass:* open
on an interview-stage role, generate, confirm rendering.

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

## ~~P1.5 — Add AI Score / Map-Fields to App Apply Assist~~ — ✅ DONE (2026-06-24, pending device pass)

**Shipped (code + jest; needs device pass).** `requestScore` in `sync/assist.ts` calls
`/api/assist/score`; a `ScoreModal` shows current → suggested fit/prob/tier + the rationale, and
**Apply** persists fit/prob (tier + EV re-derive locally, and two-way sync pushes it up). A
**Re-score · AI** action sits in RoleDetail's "Why this score" header. `EditablePatch`/`updateRole`
extended to carry fit/prob. tsc clean, 71 jest green; score endpoint verified live (fit 8 · prob 7 ·
tier A). *Device pass:* re-score a role, apply, confirm the card updates.

**Deferred — map-fields autofill in the app:** that needs JS injection into the in-app apply WebView
(the extension's content-script domain). The app's apply flow opens the posting; desktop fill stays
with the extension / Simplify. Revisit if an in-WebView fill proves worth the complexity.

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

## ~~P1.6 — Expand App Analytics~~ — ✅ DONE (2026-06-24, pending device pass)

**Shipped (code + jest; needs device pass).** Added a **Pipeline health** banner atop the app
Analytics screen — band (Good/Fair/At risk) + score, main risk, metric chips (apply-ready · applied
7d · response · interviewing · follow-ups due · aging 14d+), and recommendations — via a pure
`src/pipelineHealth.ts` port (offline, reuses `today.ts` helpers; mirrors web P2.6). 3 new jest tests
(74 total green), tsc clean. *Device pass:* confirm the banner renders above the KPIs.

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

**✅ DONE (2026-06-24, pending device pass).** Seniority/role-title/keyword/negative-keyword/salary
terms already live in the app's **Search criteria** screen; applicant info + links + education + work +
EEO in **Profile**; saved answers in **Saved answers**. This filled the real gaps: a **Professional
summary** field (with an **AI draft** button → `/api/profile/draft-summary`) and **Sector preferences**,
both added to ProfileScreen and synced (`Profile.summary`/`sectors` round-trip through `pushProfile`/
`fromServer`). tsc clean, 74 jest green. *Deferred:* a full narrative-snippet editor (the web has one;
the app's Saved-answers library is the closest analog) — revisit if needed. *Device pass:* edit summary,
AI-draft, save, confirm round-trip.

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

## ~~P1.8 — Mirror Web Notifications Bell in App~~ — ✅ DONE (2026-06-24, pending device pass)

**Shipped (code + jest; needs device pass).** A 🔔 bell in the app brand bar (with an unread badge)
opens a `NotificationsModal` that reads the server's `/api/notifications` feed (the same digest/scout/
mail feed the web bell shows) and marks items read via `/api/notifications/read` — `sync/notifications.ts`.
The unread badge refreshes when a server is configured + after each sync. The modal states that native
push is EAS-build dependent while this in-app feed works in Expo Go now. tsc clean, 74 jest green;
endpoint verified live. *Device pass:* confirm the bell + feed render and mark-read works.

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

## ~~P1.9 — Add App Settings Catch-Up~~ — ✅ DONE (2026-06-24, pending device pass)

**Shipped (code + jest; needs device pass).** SettingsModal already had server URL/passphrase, QR +
board pairing, sync now/test, theme, the Gmail-ingest panel, scout-mode picker, and nav to
profile/search/rules/answers/CV. This added a read-only **Server status** block (via
`sync/serverStatus.ts` → `/api/settings`): AI model + enabled/key state, salary target + floor,
sources enabled count, digest on/channels, remote-only — refreshed on open and after Sync. tsc clean,
74 jest green; `/api/settings` fields verified live (gpt-5.4-mini · $250K · 12 sources · digest on).
*Device pass:* open Settings, confirm the status block populates. Notification-channel editing stays
server-side by design (the app surfaces status + has the in-app feed from P1.8).

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

## ~~P1.10 — Improve Extension Clip Capture~~ — ✅ DONE (2026-06-24)

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

## ~~P1.11 — Add Apply-Mode / Fillability Hint on Page Overlay~~ — ✅ DONE (2026-06-24)

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

## ~~P1.12 — Add Custom Note / Tag at Clip~~ — ✅ DONE (2026-06-24)

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

## ~~P1.13 — Add Autofill Summary~~ — ✅ DONE (2026-06-24)

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

## ~~P1.14 — Add Queue Visibility~~ — ✅ DONE (2026-06-24)

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

## ~~P2.1 — Create Unified Action Item Model~~ — ✅ DONE (2026-06-24)

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

## ~~P2.2 — Web “What Changed” Command Center~~ — ✅ DONE (2026-06-24)

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

## ~~P2.3 — App Today Uses Unified Action Queue~~ — ✅ DONE (2026-06-24, pending device pass)

**Shipped (code + jest; needs an on-device visual pass).** `app/src/actionItems.ts` ports the unified
action model to the app (pure, offline — derived from the locally-synced rows; reuses the `today.ts`
predicates), with `computeActions` + `groupActions` into the same sections as the web command center
(Needs review · Follow-ups due · Apply next · Lead inbox · Duplicates). The Today screen now renders a
prioritized action list (severity dot · company — role · reason) above the count cards; tapping an item
opens its role detail (`onOpenRole` → `setSelectedId`). 5 new jest tests (71 total green), tsc clean.
*Device pass:* confirm layout on the M4 iPad (portrait + landscape).

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

## ~~P2.5 — Per-Role Timeline~~ — ✅ DONE (2026-06-24)

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

## ~~P2.6 — Pipeline Health Score~~ — ✅ DONE (2026-06-24)

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

## ~~P2.7 — Source Quality Analytics~~ — ✅ DONE (2026-06-24)

**Shipped.** The existing Insights/Source-ATS tables already covered roles/applied/response/reject by
source; this added a dedicated **Source quality** card on the Analytics tab with the missing
decision metrics per source: **A/B rate, applied rate, response rate, interview rate, closed/
unavailable rate, and duplicate count** (rows sharing a company+role). Plus a **manual-capture
conversion** insight (how roles you clipped/added perform vs scouted). Interview/response use current
status (a floor, consistent with the funnel caveat). Verified live on the 191-row board (linkedin
41 roles · 76% A/B · 11% resp · 16 dups; manual: 12 roles, 0% conversion). No console errors.

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

## ~~P2.8 — Follow-Up Recommendation Engine~~ — ✅ DONE (2026-06-24)

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

## ~~P2.9 — Unified Background Job System~~ — ✅ DONE (2026-06-24)

**Shipped.** `lib/jobs.js` is a tenant-scoped job registry (`jobs.json` ring of the most recent 50)
with `create / phase / progress / finish / fail / cancel / onCancel / list / get / counts`. The
long-running operations now register jobs: **scout** (with a real cancel that kills the child),
**enrichment** (auto-enrich on capture), **gmail_ingest**, **interview_guide**, **digest**, and
**backup** — each goes running → succeeded/failed with a result/error, observable without logs. API:
`GET /api/jobs` (`?type=` / `?active=1`), `GET /api/jobs/:id`, `POST /api/jobs/:id/cancel`, and
`POST /api/jobs` to dispatch scout/digest/backup. Web: a **Background jobs** modal (overflow menu)
lists running + recent jobs with status dots, phase/progress, result, and a Cancel button for running
ones; auto-refreshes every 4s while open. Verified live (scout job → succeeded with added/matches/
refreshed summary; backups; cancel endpoint). The existing scout-status display is unchanged
(additive). Jobs isolate per user (tenant-scoped store).

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

---

# 15. Strategic Initiative: Reqon Intelligence Network

> **Status: Long-horizon strategic initiative. NOT MVP. Do not pull work forward into the current
> MVP sequence (see [MVP-WORKPLAN.md](MVP-WORKPLAN.md) / [MVP-READINESS.md](MVP-READINESS.md)).**
> This is a foundational, multi-quarter platform direction that turns Reqon from a *tracker of jobs
> the user already found* into the **intelligence layer for a user's career**. It is captured here so
> the long-term architecture decisions made during MVP don't foreclose it — not as committed near-term
> scope.

## 15.0 Why this is the largest competitive advantage on the roadmap

Most job-search tools compete on **automating applications** — submit more, faster. That race has no
moat: anyone can spray applications, and the value to the user is shallow. Reqon's durable advantage
is the opposite bet:

> **Don't help users apply to more jobs. Help them apply to the *right* jobs, with intelligence no
> competitor can replicate.**

Two capabilities, built together, create that moat:

1. **Company Intelligence & Opportunity Discovery** — Reqon continuously monitors companies, career
   sites, ATS platforms, and hiring activity to surface high-quality opportunities *automatically*.
   The target morning experience: **"Open Reqon and see the best opportunities you didn't know
   existed."**
2. **Reqon Signals Platform** — every user action (applied, screened, interviewed, offered, ghosted)
   is market intelligence. Anonymized and aggregated **with consent**, this becomes one of the richest
   proprietary datasets on real-world hiring behavior available.

**The network effect:** every user who tracks a pipeline contributes signals; more signals produce
better aggregate intelligence; better intelligence attracts more users. The dataset is **proprietary
and accumulates over time** — a late competitor cannot buy or scrape their way to it. This is the
classic data-moat flywheel, and it is extremely difficult to replicate once Reqon has a head start.

### Relationship to what already ships

This initiative **generalizes assets Reqon already has**, rather than starting from zero:

| Existing asset | Becomes the seed for |
|---|---|
| `agent/scout.py` (Greenhouse/Ashby/Lever board polling) | The **ATS Scout Framework** (§15.2) — one scout per ATS |
| `agent/boards.json` (company→ATS slug map) | The **Company Database** (§15.1) — first-class Company entity |
| `agent/req_resolver.py` (slug-probe + auto-append) | **Career Page Discovery** (§15.3) |
| P2.5 Per-Role Timeline | **Signal Timeline** (§15.10) |
| Tracking fields (`status`, `applied`, `interview`, rejection stage/reason) | **Signal emission** (§15.9) — status transitions *are* signals |
| Extension clip capture (P1.10–P1.12) | **Extension auto-capture into the Company Database** (§15.8) |
| `core/entitlements.js` (`ai` tier) | Gating surface for **Signals / Intelligence** as premium value |
| P0.6 Multi-User + tenant isolation | **Precondition** for anonymous aggregation at scale (§15.11) |

---

# 15.A — Part 1: Company Intelligence & Opportunity Discovery

## 15.1 — Company as a First-Class Entity (Company Database)

### Surface

Server (new `companies` store) · Web Board · App · Extension

### Goal

Promote "company" from a string field on a requisition to a first-class entity with its own record,
lifecycle, and monitoring schedule. Requisitions reference a `companyId`; the company record owns
discovery, ATS configuration, and intelligence.

### Fields (initial → future)

**Identity & profile:** Company Name · Website · Industry · Company Size · Headquarters ·
Remote Policy · Public/Private · Funding Stage *(if applicable)* · Tech Stack *(future)*

**Hiring surface:** Careers URL · ATS Provider · ATS Board URL · ATS Identifier / Slug ·
Hiring Velocity · Active Jobs · Historical Jobs

**Relationships:** Recruiter Contacts *(→ §15.7)* · Hiring Managers *(future)* · Followed by User

**Bookkeeping:** Last Checked · Last Updated · Notes · Tags

### Requirements

- New tenant-scoped `companies` store; `boards.json` migrates in as seed company records.
- Requisitions gain `companyId`; legacy `company` string resolves to / creates a company record
  (append-only, dedupe on normalized name + domain — consistent with the existing merge rule).
- Read API: `GET /api/companies`, `GET /api/companies/:id`, `GET /api/companies/:id/jobs`.
- Company detail surfaces on web first, then app; extension links a clipped job to its company.

### Acceptance Criteria

- Every requisition resolves to exactly one company record; no orphaned company strings.
- Company records dedupe correctly across manual entry, scout, and extension capture.
- Existing pipeline behavior is unchanged when companies are ignored (fail-open).

---

## 15.2 — ATS Scout Framework (per-platform scouts)

### Surface

Server / background workers (`agent/`)

### Goal

Generalize the single `scout.py` into a **pluggable per-ATS scout framework**. Each ATS adapter can:
discover companies · monitor career pages · detect **new / removed / modified** jobs · capture job
metadata · detect **hiring spikes**.

### Supported platforms (sequenced)

**Priority 1 — public board APIs, fillable, highest ROI (extends today's coverage):**
Greenhouse · Ashby · Lever · Workable · Recruitee · SmartRecruiters

**Priority 2 — larger/gated; monitoring value even where autofill isn't possible:**
Workday · iCIMS · Jobvite · BambooHR · JazzHR · Oracle Taleo · ADP · UKG · Paylocity · Pinpoint

> **Honesty note (carry the existing ATS playbook forward):** P1 platforms expose clean public board
> APIs and are *fillable*. Several P2 platforms (Workday, iCIMS, Taleo) are account-gated and may only
> support **monitoring**, not autofill. Scope each adapter to *monitor + detect*; autofill stays
> governed by the existing apply-mode/fillability rules. Never scrape where it violates ToS — go
> through compliant board APIs.

### Per-ATS adapter contract

```
adapter.discoverCompanies()      // optional — find boards on this ATS
adapter.listJobs(company)        // current open reqs + metadata
adapter.diff(previous, current)  // → {added, removed, modified}
adapter.detectSpike(history)     // hiring-velocity signal
```

### Requirements

- Shared diff/dedupe/scoring core; adapters only handle fetch + normalize.
- Persist per-company snapshot history to compute added/removed/modified and velocity.
- All merges remain **append-only** by `company + role`; never overwrite user tracking edits.
- Each adapter is independently testable with fixture payloads (pure functions, like `req_resolver`).

### Acceptance Criteria

- P1 adapters detect added/removed/modified jobs against a stored snapshot.
- A new ATS can be added without touching the diff/scoring core.
- Removed/modified detection feeds Negative Signals (§15.9) and notifications (§15.4).

---

## 15.3 — Career Page Discovery

### Surface

Server / background workers · Extension

### Goal

Given only a company website, automatically find the careers page, detect the ATS, store the
ATS endpoint, and schedule monitoring — so adding a target company is one input, not manual research.

### Requirements

- Probe common patterns: `/careers`, `/jobs`, `/careers/openings`, plus ATS hosts
  (`boards.greenhouse.io/...`, `jobs.ashbyhq.com/...`, `jobs.lever.co/...`, Workable, Recruitee,
  SmartRecruiters, …).
- Reuse and extend `req_resolver.py`'s slug-probe + auto-append logic.
- On success: store ATS type + endpoint + slug on the company record and enroll it in monitoring.
- Inconclusive → flag for the user (and offer the existing AI-classification fallback, opt-in).

### Acceptance Criteria

- A company website resolves to ATS + board endpoint for the common cases above.
- Discovered boards auto-enroll in the scout schedule (the directory grows itself).
- Public board APIs only; no scraping of gated portals.

---

## 15.4 — Target Company Watchlists

### Surface

Web Board · App · Server

### Goal

Let users curate the universe Reqon watches on their behalf and choose how aggressively.

### Requirements

- Per-company user actions: **Follow · Favorite · Mute · Categorize · Assign priority**.
- Per-company preferences: salary expectations · preferred roles · preferred locations
  (overlay the global Settings → Matching defaults).
- Notify on: **new matching job · role closed · hiring spike** — and (future) **leadership change ·
  funding event**.
- Notifications route through the existing dispatcher (`dispatchNotify` / digest channels); no new
  delivery plumbing.

### Acceptance Criteria

- Followed companies are checked on schedule; muted companies are never surfaced.
- Per-company preferences override globals when set.
- Watchlist events appear in the notifications bell + digest.

---

## 15.5 — Opportunity Scout (background discovery service)

### Surface

Server / background workers (registered in the P2.9 unified job system)

### Goal

A daily background service over followed companies that surfaces **only** roles matching user
preferences — the engine behind "the best opportunities you didn't know existed."

### Requirements

- Daily pass over followed companies: discover **new / removed / updated** roles, hiring trends,
  remote-policy changes, location expansion.
- Score against user preferences + `scoring-criteria.md`; recommend only matches above threshold.
- Register as a job type in the P2.9 background-job registry (observable, cancellable).
- Append-only merge into the pipeline; surfaces in Today / "What changed" (P2.2/P2.3).

### Acceptance Criteria

- Recommendations respect per-user preferences and remote-only constraints.
- Run is observable and cancellable like other background jobs.
- No duplicate roles created against existing pipeline rows.

---

## 15.6 — Company Intelligence Pages

### Surface

Web Board (primary) · App (read)

### Goal

A rich per-company view aggregating everything Reqon knows. Built incrementally; later sections
(time-to-fill, pipeline stats) depend on the Signals dataset (§15.B).

### Contents (incremental)

Open roles · Hiring velocity · Average time-to-fill\* · Interview pipeline statistics\* ·
Historical openings · Known recruiters · Known hiring managers · Employee referrals · User notes ·
Past applications · Past interviews · Offer history · Signal history

\* *Aggregate metrics depend on §15.B Signals + sufficient anonymized volume.*

### Acceptance Criteria

- Company page renders from owned data (roles, notes, the user's own history) with no aggregate
  dependency.
- Aggregate sections render only when the Signals dataset has sufficient volume, else show a clear
  "not enough data yet" state — never a fabricated number.

---

## 15.7 — Recruiter Database (first-class Recruiter entity)

### Surface

Server (new `recruiters` store) · Web Board · App · Extension

### Goal

Promote recruiters to first-class records linked to companies and jobs, so relationship history is
durable and surfaceable.

### Fields

Name · Company · Title · LinkedIn · Email *(when known)* · Phone *(optional)* · Notes ·
Relationship strength · Messages · Associated jobs · Signals · History

### Requirements

- Tenant-scoped `recruiters` store; link to company + requisition.
- Recruiter contacts captured via extension (§15.8) and manual entry resolve/dedupe to one record.
- **PII guardrail:** recruiter contact data is personal — stays in the authenticated store, never
  enters anonymized aggregates (§15.11) except as non-identifying responsiveness metrics.

### Acceptance Criteria

- Recruiter records link cleanly to companies and roles; dedupe on name + company.
- Relationship strength + message history are editable and persist across surfaces.

---

## 15.8 — Browser Extension Auto-Capture into the Company Database

### Surface

Extension

### Goal

Whenever the extension visits a career page, automatically capture structured data and populate the
Company Database — turning ordinary browsing into directory growth.

### Capture

Company · ATS · Job · Location · Salary · Recruiter · Career URL · Job URL · Posting ID

### Requirements

- Extend the existing clip pipeline (P1.10–P1.12) to also upsert a company record + ATS config.
- Confirm-before-write UI (consistent with current clip confirmation), never silent.
- Feeds Career Page Discovery (§15.3) — a visited unknown board becomes a monitored company.

### Acceptance Criteria

- Visiting a supported career page offers a one-click "add company + monitor."
- Captured company resolves/dedupes against existing records.

---

# 15.B — Part 2: Reqon Signals Platform

## 15.9 — Signals Data Model & Taxonomy

### Surface

Server (new `signals` store, tenant-scoped) · all tracking surfaces

### Goal

Treat **every major hiring event as a Signal**. Most signals are emitted automatically from existing
status transitions and tracking-field edits; the rest are lightweight user confirmations.

### Positive / lifecycle signals

Application Submitted · Application Viewed *(future)* · Recruiter Outreach · Recruiter Response ·
Recruiter Screen · Hiring Manager Screen · Technical Interview · Panel Interview · Final Interview ·
Assessment · Reference Check · Offer Received · Offer Accepted · Offer Declined · Salary Negotiation ·
Counter Offer · Internal Referral · Referral Requested · Referral Completed · Recruiter Follow-up ·
Interview Rescheduled

### Negative signals *(the differentiator — see §15.14)*

Rejected · Ghosted · Application Withdrawn · Offer Rescinded · Job Closed · Job Removed ·
Position Filled · **Company ghosted after recruiter screen** · **Job reposted after final interview** ·
**Salary lower than advertised** · **Interview process exceeded stated timeline** ·
**Recruiter stopped responding** · **Position canceled** · **Role filled internally**

### Signal metadata

Timestamp · Company · Job · Department · Location · Role Level · Salary *(when known)* · Source ·
Recruiter · Hiring Manager · Application Age · Previous Signal · Next Signal · Outcome · Confidence ·
**AI-Generated vs User-Confirmed**

### Requirements

- Emit signals from existing status transitions (centralized rules, P0.5) — applying *is* a signal,
  a rejection-stage edit *is* a signal — so the dataset populates with **zero extra user effort**.
- Every signal records provenance (`aiGenerated` vs `userConfirmed`) and a confidence score; AI-inferred
  signals are flagged and never silently treated as ground truth.
- Append-only event log per requisition; signals never mutate, only get superseded.

### Acceptance Criteria

- Status changes that already happen today emit the corresponding signal automatically.
- Signal provenance + confidence are always recorded; AI vs confirmed is distinguishable downstream.
- No signal carries PII into any aggregate path.

---

## 15.10 — Signal Timeline (per-application history)

### Surface

Web Board · App (extends P2.5 timeline)

### Goal

Render each application as a visual chain of signals — the pipeline history a user can read at a glance.

```
Applied → Recruiter Screen → Hiring Manager → Panel → Offer → Accepted
```

### Requirements

- Extend the existing P2.5 per-role timeline to render signal events (positive and negative).
- Show gaps/stalls (e.g., "14 days since Recruiter Screen, no next signal") to drive follow-ups.

### Acceptance Criteria

- Every application shows an ordered, accurate signal chain.
- Negative signals (ghosted, reposted, rescinded) render distinctly from progression.

---

## 15.11 — Anonymous Aggregation & Consent

### Surface

Server · Settings (consent) · **depends on P0.6 multi-user**

### Goal

With explicit user consent, anonymize and aggregate signals into market-level metrics. **This is the
moat** — and it is also the highest-trust-stakes feature in the product.

### Requirements

- **Opt-in, revocable consent** in Settings; default off. No aggregation without it.
- Strip all PII before aggregation: no names, emails, recruiter identities, or free-text notes —
  **aggregate metrics only**. Enforced in one place, with tests, like tenant isolation (P0.6).
- k-anonymity / minimum-cohort thresholds: never expose a metric derived from too few data points
  (prevents re-identification and fabricated-looking precision).
- Aggregation runs server-side over the tenant-isolated stores; raw per-user signals never leave the
  user's tenant.

### Acceptance Criteria

- Aggregation is impossible without active consent; revoking consent removes the user's contribution.
- No aggregate can be traced to an individual; cohort-size floors are enforced and tested.
- Privacy guarantees are documented and verifiable.

---

## 15.12 — Aggregate Intelligence (metrics layer)

### Surface

Server · Web Board

### Goal

Compute the market-level metrics the consented dataset makes possible.

### Metrics

Average recruiter response time · Average interview duration · Offer rate · Interview rate ·
Rejection rate · Time to hire · Hiring velocity · Offer acceptance rate · **Ghost rate** ·
Application success rate · Recruiter responsiveness · Hiring manager responsiveness ·
Interview stages by company / role / seniority · Remote hiring trends · Salary trends · Seasonality

### Acceptance Criteria

- Each metric respects the cohort-size floor and shows confidence/sample size.
- Metrics recompute incrementally as new consented signals arrive.

---

## 15.13 — Company & Role Insights (the user-facing payoff)

### Surface

Web Board (Company page §15.6 + new Role Insights) · App (read)

### Goal

Surface the aggregate metrics where they change decisions.

### Company insights (illustrative format — values come from real aggregates, never invented)

```
Example Co
  Average recruiter response: 9 days
  Principal PM interview rate: 8%
  Offer rate: 1.2%
  Average interview process: 6 stages
  Average hiring duration: 42 days
  Hiring velocity: High
```

### Role insights (e.g., "Principal Product Manager")

Average recruiter response · Average interview count · Average salary · Offer rate ·
Top hiring companies · Fastest hiring companies · Slowest hiring companies

### Acceptance Criteria

- Insights render only above the cohort threshold; otherwise an explicit "not enough data yet" state.
- **Never fabricate numbers, quotes, or names** — every figure traces to aggregated signals with a
  visible sample size.

---

## 15.14 — Trust & Transparency Metrics (productized Negative Signals)

### Surface

Web Board · App

### Goal

Turn negative signals (§15.9) into **company trust & transparency metrics** — the kind of proprietary
intelligence competitors cannot replicate, and a candidate signature feature. Example:

> *"This company responds to applicants within 5 days 82% of the time, but has a higher-than-average
> ghost rate after final interviews."*

### Derived metrics

Responsiveness rate (by stage) · Ghost rate (overall + after final interview) · Repost-after-final
rate · Offer-rescind rate · Salary-accuracy (advertised vs offered) · Process-timeline adherence ·
Internal-fill rate.

### Requirements

- Strictly aggregate + cohort-floored (§15.11) — never name an individual recruiter as a ghoster.
- Frame as transparency, not defamation: report rates with sample sizes, no editorializing.

### Acceptance Criteria

- Trust metrics appear on company pages above the cohort floor, with sample size + as-of date.
- Negative signals never expose individuals; only company-level rates.

---

## 15.15 — AI Over the Signals Dataset

### Surface

Server (AI layer) · Web Board · App

### Goal

Let the AI assistant answer market-intelligence questions grounded in the aggregate dataset — the
"career intelligence layer" payoff.

### Target questions

- "What companies are interviewing Principal PMs the fastest?"
- "What companies have the highest recruiter response rates?"
- "What companies frequently ghost candidates?"
- "Where am I statistically most likely to receive an offer?"
- "What companies are increasing hiring?"
- "Which recruiters respond most often?" *(aggregate responsiveness, not individual call-outs)*
- "What interview stage do most people fail at for this company?"

### Requirements

- AI answers are **grounded in the aggregate metrics layer (§15.12)** — function-calling/retrieval
  over computed aggregates, not free generation. No invented statistics.
- Respect cohort floors; answer "not enough data yet" rather than guess.
- Gated behind the `ai` entitlement tier.

### Acceptance Criteria

- Every quantitative claim in an AI answer traces to a real aggregate with a sample size.
- Insufficient-data questions return an honest "not enough data" rather than a fabricated figure.

---

## 15.16 — Product Philosophy (north star for this initiative)

These capabilities differentiate Reqon from products focused solely on **automating applications**.
Rather than submitting more applications, Reqon becomes **the intelligence layer for a user's career** —
helping them discover better opportunities, understand hiring markets, make better decisions, and
continuously learn from aggregated hiring data. The proprietary, consented dataset is the moat; the
discovery experience is the daily hook; trust & transparency metrics are the signature.

---

## 15.17 — Implementation Phases & Sequencing

Sequenced so that **each phase delivers standalone user value before the network effect kicks in**,
and so dependencies (multi-user, consent, timeline, centralized status rules) land in the right order.

| Phase | Theme | Epics | Hard dependencies | Network effect? |
|---|---|---|---|---|
| **SI-Phase 1** | Company foundation | 15.1 Company entity · 15.2 ATS Scout Framework (P1 platforms) · 15.3 Career Discovery | Generalizes existing `scout.py` / `boards.json` / `req_resolver.py` | No — single-user value |
| **SI-Phase 2** | Discovery experience | 15.4 Watchlists · 15.5 Opportunity Scout · 15.8 Extension auto-capture | P2.9 job registry · notification dispatcher · Phase 1 | No — single-user value |
| **SI-Phase 3** | Relationship + company depth | 15.6 Company pages (owned-data sections) · 15.7 Recruiter DB | Phase 1 | No |
| **SI-Phase 4** | Signals capture | 15.9 Signals model · 15.10 Signal Timeline | **P0.5 centralized status rules** · P2.5 timeline | No — but seeds the dataset |
| **SI-Phase 5** | Aggregation foundation | 15.11 Anonymous aggregation + consent · 15.12 Metrics layer | **P0.6 multi-user + tenant isolation** · sufficient user volume | **Yes — moat begins** |
| **SI-Phase 6** | Intelligence payoff | 15.13 Company/Role insights · 15.14 Trust & Transparency · 15.15 AI over signals · 15.6 aggregate sections · 15.2 P2 ATS platforms | Phase 5 + data volume · `ai` entitlement | **Yes — compounding** |

### Critical-path dependencies

- **P0.6 Multi-User (tenant isolation)** is a hard precondition for aggregation (§15.11): there is no
  cross-user dataset without many isolated users. **Do not** build aggregation single-tenant.
- **P0.5 Centralized status-transition rules** must land before Signals (§15.9) so signal emission has
  one authoritative source of truth and round-trips across all surfaces.
- **P2.5 Timeline** and **P2.9 background-job registry** are reused (not rebuilt) by §15.10 and §15.5.
- **Consent + PII stripping (§15.11)** gates everything in Part 2's aggregate layer — it is the trust
  foundation, built and tested *before* the first aggregate metric ships.

### Network-effects / moat callout

Phases 1–4 are valuable to a single user and earn adoption. Phases 5–6 convert that adoption into a
**self-reinforcing data moat**: more users → more consented signals → richer aggregate intelligence →
stronger discovery + trust metrics → more users. Because the dataset is **proprietary, consented, and
accumulated over real hiring outcomes**, it cannot be bought, scraped, or fast-followed — the
competitive advantage **compounds with time and scale** rather than eroding.

### Guardrails carried from existing conventions

- Append-only merge by `company + role`; never overwrite user tracking edits.
- Never fabricate salaries, links, numbers, quotes, or names — unknowns stay unknown; aggregates show
  sample size and respect cohort floors.
- PII stays in the authenticated, tenant-isolated store; only non-identifying aggregates leave it.
- Compliant board APIs only — no Glassdoor/Blind/LinkedIn scraping (ToS).
- New automation is observable (background-job registry) and fail-open (absence of company/signal data
  never breaks the core pipeline).

---

# 16. Risks & Mitigations

*Carried forward from the v2 roadmap. Still-operative product/engineering risks; the clock-skew note
is updated for the multi-user model (single user per tenant, so per-row LWW remains acceptable).*

| Risk | Mitigation |
|---|---|
| Core logic drift across consumers | React Native lets the app **import `core/crm-core.js` verbatim** (no Swift re-port); `scoring-criteria.md` is the canonical spec; one shared JSON test-vector suite runs against that single module |
| Workday/ATS DOM drift breaks fill | Tiered matcher degrades to skip-not-wrong; adapters only for ATSs actually used; fill summary makes gaps visible |
| iOS background limits undercut scout/sync | Server push is the primary scheduler; BG tasks are best-effort by design; honest "last ran" UX |
| LWW clock skew | Single user per tenant, so per-row LWW is acceptable; sync logs both timestamps for audit |
| Scope creep toward auto-apply | The Inviolable Principles are hard rules; every PR is reviewed against them |
| Solo-maintainer bandwidth | Each phase ships standalone value; stop-anywhere roadmap; the highest-pain item alone justifies its phase |
| Cross-tenant data leakage (multi-user) | One-place tenant-resolver enforcement; isolation tests (User A cannot reach User B); PII never enters aggregates except as non-identifying metrics |
| Aggregate data re-identification (§15.11) | Opt-in consent, PII stripped before aggregation, k-anonymity / cohort-size floors, enforced in one place with tests |

---

# 17. Execution History — v1/v2 Workplan (consolidated)

*Migrated here from the retired `WORKPLAN.md` (the v2 execution companion) so the full build history
lives in this one document. Work packages **WP-0…WP-6** executed Roadmap Phases 0–6. ~~Struck-through~~
headings are shipped/merged to `main`. The procedural operating rules from the old workplan now live in
§14 (Claude Development Rules) + the Inviolable Principles above; this section preserves the per-WP
record, the shipped-feature ledger, and the remaining dev-build-gated work. Original last update:
2026-06-23.*

## 17.1 Work packages (WP-0…WP-6)

| WP | Scope | Depends on | Status |
|----|-------|-----------|--------|
| WP-0 | Server sync/push foundation | — | ✅ shipped |
| WP-1 | Chrome extension | — (parallel-safe) | ✅ shipped |
| WP-2 | iOS app foundation | WP-0 | ✅ shipped (Expo Go) |
| WP-3 | Push | WP-0, WP-2 | ◑ server done; **device side needs dev build** |
| WP-4 | In-app browser fill | WP-2 | ✅ shipped |
| WP-5 | Assistant v2 | WP-2 (app UI); server part anytime | ✅ shipped |
| WP-6 | On-device scout | WP-2 | ✅ shipped (multi-ATS GH/Ashby/Lever) |

### ~~WP-0 — Server: sync + push foundation~~ — ✅ shipped

Roadmap Phase 0 (FR-SRV-1…5): row identity (`id`/`updatedAt` backfill + `touch()` on every mutation
path), tombstone soft-delete (+ `POST /api/maintenance/purge-tombstones`), `POST /api/sync` (full-auth,
per-row LWW, tombstone propagation, id-remap), push scaffolding (`POST /api/push/register` + token-based
APNs sender, inert when unset), and the shared `tests/vectors/*.json` suite proving server == app ==
extension off one `core/crm-core.js`.

### ~~WP-1 — Chrome extension (thin companion)~~ — ✅ shipped

Roadmap Phase 1 (FR-EXT-1…5): MV3 extension (`extension/`) — clip via `POST /api/reqs/quickadd`,
tracked-row fit/prob/EV/tier overlay, mark-applied via `PATCH`, offline queue, configured-origin-only.

### ~~WP-2 — Reqon iOS app foundation (React Native / Expo)~~ — ✅ shipped (Expo Go)

Roadmap Phase 2 (FR-APP-1…8). **Stack locked: React Native (Expo)** so the app imports
`core/crm-core.js` verbatim (no Swift re-port). Monorepo `app/` workspace, expo-sqlite store, bundle id
`com.reqon.app`. Milestones M0 (shared-core extraction) → M5 shipped in Expo Go. **M3 native Share
Extension + M5 local notifications remain dev-build-gated** (see §17.3).

### WP-3 — Push (server → app)

Roadmap Phase 3. **Server side shipped** (APNs sender + `/api/push/register` from WP-0, inert until a
real `.p8`/bundle id is configured). **App-side registration, notification-tap → Today + sync, and
`content-available` background sync are dev-build-gated** (Expo Go can't register for remote push).

### ~~WP-4 — In-app browser: enrich + apply-assist~~ — ✅ shipped

Roadmap Phase 4 (FR-WV-1…7): WKWebView + persistent cookies → `scrapeJobPosting()` injection → tiered
fill engine (autocomplete → ATS adapters → fuzzy → LLM fallback) → highlight + fill-summary → hard
denylist at a single choke point → one-tap mark-applied. Wrong-fill ≈ 0; skip-not-guess.

### ~~WP-5 — Assistant v2 (personal voice)~~ — ✅ shipped

Roadmap Phase 5 (FR-AI-1…7): `/api/assist` extended with `{mode, narrativeId, angle, answers[],
roughDraft, priorDraft, reaction}`; Auto/Example/Guided modes; style-exemplar prompting + tone
guardrail; save-as-snippet writes back to the narrative library. Board modal + app contract; v1 budget
caps + audit logging retained.

### ~~WP-6 — On-device scout~~ — ✅ shipped (multi-ATS GH/Ashby/Lever)

Roadmap Phase 6: JS/TS port of board polling vs `boards.json`, scoring via `core/crm-core.js`,
background-fetch + manual run, parity-tested against the Python scout, event-key notification dedupe.

## 17.2 Shipped beyond the original roadmap (WP-0…6 era)

> All of the following are **merged to `main`**, `tsc` clean, with broad test coverage on the pure
> logic (app jest + Python `unittest` + core/extension vector runners).

**App / Settings parity & UX** — full Settings parity (multi-entry profile + résumé upload→parse;
search criteria; A/B/C tier + follow-up + assist-toggle synced overrides); Light/Dark/System theming;
triage (pipeline filters, salary-band sort, score rationale, bulk actions); analytics funnel; saved-
answers library; **Build CV** (server-generated .docx + PDF, AI-or-deterministic, per-role tailoring);
apply-assist factual fill; **iPad command center** (NavRail + master-detail, all-orientation,
virtualized SectionList); open-original-listing everywhere; accessibility pass; **QR / pairing-code**
device setup; **Gmail response ingest** (`mail_ingest.py` — auto-set rejections / flag positives via
audited PATCH, app- or `.env`-configurable); résumé-parser fix + unified scout dedup.

**AI + extension expansion** — OpenAI **Responses API** migration (function calling + built-in tools,
auto-fallback to chat); `/api/assist` `tailor` kind + `/api/assist/score` + `/api/assist/map-fields` +
usage monitor; file-search/web-search grounding; **interview prep guides** (auto-built on interview
stage, served + backed up); mail-ingest interview auto-advance; **Reqon Clip** extension side-panel
(analytics, JD keyword coverage, AI autofill/draft/score, usage monitor; broadened boards); read-only
**MCP server** (`mcp/`).

**Board / Settings overhaul (2026-06-23)** — standalone `/guide` page; card record-keeping strip +
inline Salary/Location edit; sources list + health relabel; candidate profile GitHub + AI summary;
multi-select lifecycle chips; model dropdowns from live OpenAI list; read-only env inventory +
HTTPS/Tailscale status; **6-channel notification engine** (in-app bell, file, slack, email, free
carrier SMS, push) with digest-after-first-scout; **salary-fit scoring** (`parse_salary_top`/
`salary_adj`); **apply-mode fillability probe** (`/api/applymode/probe` + opt-in AI); **analytics
distribution layer** (cohort lens → top companies/roles/levels/salary-bands/sector/tier/remote,
velocity, fit-by-outcome — no chart lib).

## 17.3 Open work (dev-build-gated — needs EAS/Xcode, not buildable in Expo Go)

- **Native Share Extension** (FR-APP-4): Safari Share → "Add to CRM" + on-device enrichment.
- **On-device push** (FR-PUSH-1…4): register for remote notifications → existing `/api/push/register`;
  the server APNs sender is built and inert until configured.
- **Local notifications** (FR-APP-7): follow-up-due / leads-to-verify via `expo-notifications`.
