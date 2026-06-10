# WORKPLAN — Executing Roadmap v2

*Handoff doc for Claude Code sessions. Read [ROADMAP.md](ROADMAP.md) first for the why;
this file is the how. Last updated: 2026-06-10. No code has been written against this
plan yet — Work Package 0 is the starting point.*

---

## Operating rules (carried from Roadmap v1 — apply to EVERY work package)

1. **Snapshot before you touch data.** `curl -X POST localhost:8787/api/backup` (or
   `cp data.json backups/data.<label>-$(date +%Y%m%d-%H%M%S).json`). Code safety = git
   branch per WP.
2. **Never blind-overwrite tracking edits.** Adds via append-only merge; field updates via
   audit-logged paths; respect the req-ID dedupe (`sameReq`/`postingId`).
3. **All new knobs get Settings UI.** Nothing config-file-only. Secrets to `.env`, masked
   in the UI (`keySet` + last4 pattern). **No inline comments on `.env` secret lines** —
   the loader takes everything after `=`.
4. **Deterministic core works with AI off.** OpenAI/APNs/etc. are optional and gated on
   their keys being present (the SMTP/Slack pattern).
5. **Verify every WP before done:** `node --check server.js`; restart via
   `launchctl kickstart -k gui/$(id -u)/com.jobcrm.server`; live-check on
   http://localhost:8787; UI verification via the preview server on **port 8788**
   (`.claude/launch.json` → name `board`; never occupy 8787). Confirm `data.json` row
   count unchanged unless the WP intentionally migrates (snapshot first).
6. **Git:** feature branch per WP off `main`; PR per WP (`gh pr create`); commit messages
   follow the existing style. `.env`, `data.json`, `agent/profile.json`, scout state files
   are gitignored — keep it that way.
7. **Hard guardrails (never violate):** no auto-submit; no filling passwords/SSN/EEO/
   consent/salary-unless-configured; no LinkedIn scraping; tombstones not hard deletes.

## Environment facts (so a fresh session can act)

- Project: `/Users/plex/Documents/job-pipeline-crm` · server `server.js` (Express, port
  8787, launchd `com.jobcrm.server`, own `.env` loader) · board `public/index.html`
  (single file, vanilla JS) · mobile `mobile.html` (`/m`) · scout under `agent/` (Python,
  stdlib) · store `data.json`.
- Auth today: `APP_TOKEN` (full, loopback bypasses), `INGEST_TOKEN` (scoped:
  `POST /api/reqs/merge` + `/api/reqs/quickadd` only). Header `X-CRM-Token`.
- Key existing pieces to reuse: `reqKey`, `postingId`, `sameReq`, `computeEnrichFields`,
  `applyEnrichedRow`, `backgroundEnrich`, `snapshotData`, `logChange`/`logEnrichment`,
  `setEnvVars`, `openaiChat`, settings payload + drawer UI, scout status/push points
  (`scout-status.json`, scout-exit hook), digest scheduler (cron-like minute tick).
- Canonical scoring spec: `agent/scoring-criteria.md`. Positioning: `PRODUCT-POSITIONING.md`.

---

## WP-0 — Server: sync + push foundation  *(this repo · start here)*

Branch: `feat/sync-foundation`. Implements ROADMAP Phase 0 (FR-SRV-1…5).

**Tasks**
1. **Row identity** — in `server.js`:
   - `ensureRowIdentity(rows)`: assign `id` (`crypto.randomUUID()`) and `updatedAt` where
     missing; call on store read; write back + snapshot if anything was backfilled
     (one-time migration, log it).
   - `touch(row)` helper sets `updatedAt = new Date().toISOString()`; call it in **every**
     mutation path: `PUT /api/reqs` (diff against current to touch only changed rows),
     merge, quickadd, `PATCH /api/reqs/:key`, enrichment apply (worker + background),
     applymode backfill, restore (preserve original timestamps — restore is not an edit).
   - Board client (`public/index.html` `upd()`): stamp `updatedAt` on edited rows before
     the debounced PUT so per-row LWW has honest client timestamps.
2. **Tombstones** — `delRow` (board) and any delete path set
   `{deleted:true, updatedAt}` instead of splicing. Board render, lanes, Today counts,
   analytics, exports (xlsx + CSV), and scout dedupe all skip `deleted` rows.
   Maintenance: `POST /api/maintenance/purge-tombstones` (full-auth, snapshot first,
   confirm count in response). Settings → Data safety gets a purge button + tombstone count.
3. **`POST /api/sync`** (full-auth; reject INGEST token — keep it out of `INGEST_PATHS`):
   - Body `{rows: [], since?: iso}`. For each incoming row by `id`: unknown → append
     (run `sameReq` dedupe against non-identical rows first; on dup, keep server row and
     report the mapping so the client can re-id); known → compare `updatedAt`, newer wins
     whole-row (LWW); tombstones propagate both ways.
   - Snapshot before write; `logChange({action:'sync', applied, sentBack, conflicts})`.
   - Respond `{ok, rows: <server rows with updatedAt > since (all if no since)>,
     serverTime, idRemaps?}`.
4. **Push scaffolding**:
   - `POST /api/push/register` (full-auth): `{token, platform:'ios'}` → upsert into
     `agent/push-tokens.json`.
   - `sendPush(payload)` using token-based APNs (JWT via `.p8`; env:
     `APNS_KEY_P8_PATH`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`,
     `APNS_ENV=sandbox|production`). Prefer zero-dep (Node `http2` + `crypto` ES256 JWT);
     a small dep (`apns2`) acceptable if justified. **Inert when env unset.**
   - Hooks: scout child-exit success → push `"Scout: {added} new · {top titles}"`;
     digest scheduler → digest summary; follow-up-due check (piggyback the digest minute
     tick) → counts. Event-key in payload (`runId`/date) for client-side dedupe.
   - Settings → Advanced: APNs connection-status row (configured / not).
5. **Shared test vectors** — `tests/vectors/*.json`: fixtures for `postingId`, `sameReq`,
   tier derivation, EV, LWW outcomes, tombstone merge. `tests/run-vectors.js` asserts them
   (plain Node, `node tests/run-vectors.js` exits non-zero on failure). These same files
   will be consumed by the Swift port in WP-2.

**Verification / acceptance** — ROADMAP Phase 0 checklist, plus:
```bash
node --check server.js && node tests/run-vectors.js
# two-client convergence sim:
curl -s -X POST localhost:8787/api/sync -H 'Content-Type: application/json' -d '{"rows":[]}'   # full pull
# edit row A locally / row B via board, sync, assert both converge; conflict case: same row, later ts wins
```
Regression: board save / merge / quickadd+auto-enrich / scout dry-run / restore unchanged.

**Definition of done:** all Phase-0 ACs checked, vectors green, PR open, no change to
desktop UX beyond the tombstone-aware delete + purge control.

---

## WP-1 — Chrome extension (thin companion)  *(this repo: `extension/`)*

Branch: `feat/chrome-extension`. Implements ROADMAP Phase 1 (FR-EXT-1…5).
Depends on: nothing in WP-0 (uses existing quickadd/PATCH APIs) — can run in parallel.

**Structure**
```
extension/
  manifest.json        # MV3; permissions: storage, activeTab, scripting; host perms: configured origin
  options.html/.js     # server origin + token (chrome.storage.sync), test-connection button
  background.js        # service worker: API client, offline queue (storage), badge state
  content.js           # page-side: read URL/title; render overlay/badge + Mark-applied UI
  overlay.css
```

**Tasks**
1. API client w/ `X-CRM-Token`; test-connection = `GET /api/health`.
2. Clip: toolbar click or overlay button → `POST /api/reqs/quickadd`
   `{url, title, source:'chrome-ext'}` → toast added/duplicate (server auto-enriches).
3. Tracked-row lookup: `GET /api/reqs` cached briefly in the worker; match by
   `postingId(link)` (port the JS helper), else exact URL. Overlay badge: fit/prob/EV/tier
   + status; untracked → Clip affordance.
4. Mark applied: `PATCH /api/reqs/:key` with the board's bulk-apply semantics
   (status Applied, applied=today if blank, lastcontact=today, next default). *(Note:
   PATCH is full-auth — the extension holds the full token; it's the user's own browser.)*
5. Offline queue: failed POST/PATCH persisted and flushed on alarm/next action.
6. README in `extension/` covering load-unpacked install + configuration.

**Acceptance** — ROADMAP Phase 1 checklist. Manual test matrix: greenhouse, Ashby, Lever,
LinkedIn job page, simplify.jobs. DevTools audit: only configured-origin calls.

---

## WP-2 — iOS app foundation  *(new Xcode project)*

Branch/repo: decide at kickoff — recommend a **separate repo** (`job-pipeline-ios`) to
keep this repo's open-source surface clean; copy `tests/vectors/` in (or submodule).
Implements ROADMAP Phase 2 (FR-APP-1…8). Requires: WP-0 merged; Apple Developer account;
Mac with Xcode (Claude Code can scaffold the project, build/test via `xcodebuild`).

**Decisions to confirm at kickoff (ask the user):**
- Separate repo vs `ios/` subdir · SwiftData vs GRDB/SQLite · min iOS version (17
  suggested) · bundle id (needed for APNs) · app name.

**Milestones (each independently verifiable)**
1. **M1 Core engine:** models (full schema + `id`/`updatedAt`/`deleted`), pure-logic port
  (postingId/sameReq/EV/tier/lanes/Today counts), **vector tests green in Swift** (XCTest
  reading the shared JSON vectors).
2. **M2 UI shell:** Today + lists (tier/company grouping, sorts) + row detail with all
   tracking edits; seeded sample store.
3. **M3 Capture:** Share Extension → confirm sheet → save; on-device enrichment
   (URLSession port of `computeEnrichFields`, incl. URL-slug company + JSON-LD/OG/title);
   optional OpenAI scoring (Keychain key).
4. **M4 Sync:** SyncEngine vs `/api/sync` (configurable URL+token; launch/foreground/
   manual; LWW; offline queue; idRemap handling). ATS exception for the configured host
   documented.
5. **M5 Local notifications + export:** follow-up-due / needs-verify notifs; CSV/JSON
   share-sheet export; local snapshots.

**Acceptance** — ROADMAP Phase 2 checklist (airplane-mode suite, convergence test with a
seeded divergent store against a dev server instance on :8788).

---

## WP-3 — Push  *(server hooks exist from WP-0; app side)*

Implements ROADMAP Phase 3. App: registration → `/api/push/register`; notification tap →
Today + sync; `content-available` background sync handler; event-key dedupe vs local
notifications. Server: enable with real APNs `.p8` + bundle id; test via a manual
`POST /api/push/test` (full-auth, added in this WP) before relying on scout hooks.
Acceptance per ROADMAP Phase 3.

## WP-4 — In-app browser: enrich + apply-assist  *(app)*

Implements ROADMAP Phase 4 (FR-WV-1…7). Build order: WKWebView screen + persistent cookie
store → `scrapeJobPosting()` injection (reuse the bookmarklet/enrichment heuristics; JSON
message bridge) → fill engine tiers 1→4 (ship value at each tier; LLM fallback last) →
per-ATS adapters (greenhouse/Ashby/Lever first; Workday PII block + widget simulation +
MutationObserver after) → highlight + fill-summary UI → hard denylist enforcement in the
injection layer (single choke point) → one-tap Mark applied. Test matrix = the ATSs in
`data.json` links. Acceptance per ROADMAP Phase 4 — **wrong-fill ≈ 0; skip-not-guess.**

## WP-5 — Assistant v2  *(server + board + app)*

Implements ROADMAP Phase 5 (FR-AI-1…7). Server: extend `/api/assist` with
`{mode, narrativeId, angle, answers[], roughDraft, priorDraft, reaction}` →
`{draft, variants?, followupQuestions?}`; prompt assembly adds style exemplars (saved
snippets) + the tone guardrail; **save-as-snippet** writes back to the profile narrative
library (new `kind:'snippet'`, tagged by question type). Board: mode selector + guided
flow + reaction chips in the assist modal. App: same contract; direct-OpenAI fallback
when serverless. Keep v1 budget caps + audit logging. Acceptance per ROADMAP Phase 5.

## WP-6 — On-device scout  *(app)*

Implements ROADMAP Phase 6. Swift port of board polling vs `boards.json` config (synced
or in-app edited); BGTaskScheduler + manual run; parity sample test vs Python scout on
identical config; event-key notification dedupe with push. Acceptance per ROADMAP Phase 6.

---

## Sequencing & status

| WP | Scope | Depends on | Status |
|----|-------|-----------|--------|
| WP-0 | Server sync/push foundation | — | **next up** |
| WP-1 | Chrome extension | — (parallel-safe) | pending |
| WP-2 | iOS app foundation | WP-0 | pending |
| WP-3 | Push | WP-0, WP-2 | pending |
| WP-4 | In-app browser fill | WP-2 | pending |
| WP-5 | Assistant v2 | WP-2 (app UI); server part anytime | pending |
| WP-6 | On-device scout | WP-2 | pending |

**Kickoff prompt for a fresh Claude Code session:**
> Read CLAUDE.md, ROADMAP.md, and WORKPLAN.md. Execute WP-<N> on a feature branch:
> follow the operating rules (snapshot, settings-in-UI, guardrails), satisfy every
> acceptance criterion for the matching ROADMAP phase, verify per the WP's verification
> section, and open a PR. Do not start the next WP without confirmation.
