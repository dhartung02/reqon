# Roadmap v2 — Job Pipeline CRM → Multi-Surface Command Center

*Last updated: 2026-06-10. Companion docs: [PRODUCT-POSITIONING.md](PRODUCT-POSITIONING.md)
(market thesis) · [WORKPLAN.md](WORKPLAN.md) (execution plan for Claude Code).*

> **Roadmap v1 (2026-06-08) is fully shipped** — data safety, scout filtering, lifecycle
> tabs, hygiene lanes, apply-mode, candidate profile + narratives, AI assistant, digest,
> analytics, source health/dedupe/discovery, and the v1.0.0 open-source release, plus the
> v6 UX redesign, Today command center, lead-enrichment worker, req-ID dedupe, and scoped
> auth. See git history (`af9bee9..6728d94`) for v1. This document is the next arc.

---

## 1. Vision & end state

Today the CRM is **locked to the desktop**: discovery, tracking, and applying all assume the
Mac. Applying from a phone is effectively impossible, and keeping the CRM current during a
multi-application session is manual bookkeeping. Desktop autofill (Simplify) is clunky and
limited, and has **no mobile counterpart at all** — that gap is the opportunity.

**End state — three surfaces, one system of record, backend optional:**

```
                ┌────────────────────────────────────┐
                │   SERVER (Mac, OPTIONAL peer)       │
                │   scout (real cron) · enrichment ·  │
                │   scoring · desktop board ·         │
                │   ChatGPT/bookmarklet ingest ·      │
                │   /api/sync · APNs push             │
                └─────────▲──────────────▲────────────┘
            localhost API │              │ sync + push
        ┌─────────────────┴──┐     ┌─────┴──────────────────────┐
        │  CHROME EXTENSION   │     │   iOS APP (local-first)    │
        │  = desktop "hands"  │     │   = mobile hands + brain   │
        │  clip · fit overlay │     │   full on-device engine ·  │
        │  STATUS WRITE-BACK  │     │   share-ext capture ·      │
        │  (form-fill stays   │     │   WKWebView enrich + fill ·│
        │   with Simplify)    │     │   STATUS WRITE-BACK ·      │
        └─────────────────────┘     │   APNs push · local notifs │
                                    │   on-device scout (BG)     │
                                    └────────────────────────────┘
```

- **iOS app is local-first.** A complete engine on-device: store, scoring, dedupe,
  enrichment, capture, apply-assist, notifications. Fully functional with **zero backend**.
- **Server is an optional peer.** When reachable it adds guaranteed-schedule scouting,
  push notifications, the desktop board, and ChatGPT/bookmarklet ingestion. When absent,
  the app degrades gracefully (best-effort background scout + local notifications).
  Neither side is "the master" — they converge through sync.
- **Chrome extension stays deliberately thin**: clip + fit overlay + status write-back.
  Desktop form-fill remains Simplify's job (per PRODUCT-POSITIONING.md §10 — don't rebuild
  the autofill compatibility matrix where a specialist already exists). Mobile form-fill is
  ours to build, because nobody fills that gap.
- **The #1 unlock on every surface is STATUS WRITE-BACK**: the act of applying updates the
  CRM (status → Applied + date stamp + log) in the same motion. That — not autofill — is
  what makes "apply effectively anywhere and the CRM stays current" true.

## 2. Core principles (inviolable)

1. **Local-first, privacy-first.** Data lives on the user's devices. No third-party cloud
   holds the store. Sync is device↔device via the user's own server.
2. **Never auto-submit.** Fill factual fields only → highlight every filled field → human
   reviews and submits. No exceptions, ever.
3. **Never fill sensitive fields.** Hard denylist: passwords, SSN/government IDs,
   EEO/demographics/disability/veteran status, consent/attestation checkboxes, salary
   (unless explicitly configured).
4. **No LinkedIn scraping or automation.** Board APIs + email ingest only. Zero ToS exposure.
5. **Append-only merge + req-ID dedupe everywhere.** New rows append; tracking edits are
   never overwritten; distinct same-title postings coexist (posting-id aware).
6. **Non-destructive by default.** Snapshots before mutation; tombstones, not hard deletes;
   shrink-guard on full writes.
7. **Honest scoring, the user's voice.** Conservative fit/prob with visible caveats; AI
   drafts sound like the candidate (plain, PM-altitude, no filler) — never "ChatGPT-polished."
8. **All settings live in the UI** (carried from v1): every knob editable in-product and
   persisted server-/app-side; nothing config-file-only; secrets masked.

## 3. Primary use cases

| ID | Use case | Surface(s) |
|----|----------|-----------|
| UC-1 | **Capture anywhere** — see a posting in any app/browser on any device; one action adds it; enrichment fills company/role/location/sector + score automatically | App share-ext, extension, iOS/macOS shortcut, bookmarklet, ChatGPT |
| UC-2 | **Apply on mobile, CRM stays current** — open the posting in the in-app browser; factual fields pre-fill from the on-device profile; finish + submit manually; one tap marks Applied with today's date | App (WKWebView) |
| UC-3 | **Apply on desktop, CRM stays current** — apply in Chrome (Simplify fills); click "Mark applied" in the extension; the board updates instantly | Extension |
| UC-4 | **Morning push triage** — 7am scout runs on the server; phone receives "6 new · 2 follow-ups due"; tap → app opens → synced Today view | Server + app |
| UC-5 | **Serverless operation** — Mac asleep/away: app still captures, enriches, scores, triages, and notifies locally; best-effort background scout; syncs when the server returns | App |
| UC-6 | **Guided personal answers** — per screening question choose Auto / Example / Guided; Guided asks 1–3 tap-questions (which story? which angle?) then drafts in the candidate's voice from the narrative library; refine via reaction chips; save good answers as reusable snippets | App + server + desktop board |
| UC-7 | **Two-device convergence** — apply on the phone at lunch; the desktop board shows Applied that evening. Capture via ChatGPT on desktop; it appears on the phone after sync | All |
| UC-8 | **Fit overlay while browsing** — on a job page, the extension badges fit/prob/EV + status if tracked, or offers one-click clip if not | Extension |
| UC-9 | **Workday/unknown-ATS assist** — in the in-app browser, the field matcher fills what it can confidently identify (autocomplete attrs → ATS adapters → fuzzy → LLM fallback), highlights its work, skips what it can't; user finishes + submits | App (WKWebView) |

## 4. Phased delivery

Every phase ships standalone value; no flag-day migrations. P0–P1 live in this repo;
P2+ adds an Xcode project (separate repo or `ios/` subdirectory — decide at P2 kickoff).

---

### Phase 0 — Sync- & push-ready server (foundation)

**Goal:** make the existing server a capable *optional peer* before any new client exists.
Non-breaking; the desktop board behaves identically.

**Functional requirements**
- **FR-SRV-1 Row identity.** Every row gains `id` (UUID, assigned at creation) and
  `updatedAt` (ISO timestamp). One-time backfill of existing rows on first load
  (snapshotted; row count unchanged). Every mutation path — board PUT, inline `upd`,
  merge, quickadd, enrichment (worker + auto), scout merge, PATCH — sets/bumps `updatedAt`.
- **FR-SRV-2 Soft delete.** `deleted: true` tombstones (with `updatedAt`). Board hides
  tombstones; the Delete action writes a tombstone instead of splicing; exports exclude
  them. Hard purge only via an explicit maintenance action.
- **FR-SRV-3 `POST /api/sync`** (full-auth only): request `{rows: [...], since?: ts}` →
  reconcile by `id`: unknown ids append (still subject to req-ID dedupe), known ids
  **last-writer-wins per row** by `updatedAt`, tombstones propagate. Snapshot before
  write; change-log entry; response `{rows: <merged rows changed since 'since'>, serverTime}`.
- **FR-SRV-4 `POST /api/push/register`** (full-auth): store APNs device tokens
  (multi-device, dedup by token).
- **FR-SRV-5 APNs sender.** Token-based `.p8` auth via `.env`
  (`APNS_KEY_P8_PATH/APNS_KEY_ID/APNS_TEAM_ID/APNS_BUNDLE_ID`); **inert until configured**
  (same gating pattern as SMTP/Slack). Send hooks: scout-run complete (counts + top
  titles in payload), digest schedule, follow-up-due. Connection status row in
  Settings → Advanced.
- **FR-SRV-6 Assistant v2 API** (contract in Phase 5; can land with P5).

**Acceptance criteria**
- [ ] Fresh load of existing `data.json` backfills `id`/`updatedAt` exactly once; row count unchanged; snapshot exists.
- [ ] Two simulated clients (curl) editing different rows both converge via `/api/sync`.
- [ ] Conflicting edits to one row: later `updatedAt` wins; change log records the conflict.
- [ ] A delete on one client tombstones on the other after sync; board and Excel/CSV exports exclude tombstones.
- [ ] `/api/sync` + `/api/push/register` reject the scoped INGEST token (401) and accept the full token.
- [ ] With no APNs key set, push code paths are inert (no log errors).
- [ ] Regression: board save, merge, quickadd + auto-enrich, scout run, restore — all behave exactly as before.

---

### Phase 1 — Chrome extension (thin desktop companion)

**Goal:** fix the desktop half of "CRM stays current" immediately, with the smallest
possible surface. **Explicit non-goal: form autofill** (Simplify keeps that job).

**Functional requirements**
- **FR-EXT-1** Manifest V3 extension. Options page: server origin (default
  `http://localhost:8787`) + `X-CRM-Token`. Talks **only** to the configured origin.
- **FR-EXT-2 Clip.** On any job page, one click → `POST /api/reqs/quickadd` (URL + page
  title + `source:"chrome-ext"`); server auto-enriches. Toast shows added / duplicate.
- **FR-EXT-3 Fit overlay.** If the current page matches a tracked row (by posting-id,
  else URL), badge fit / prob / EV / tier + current status; if untracked, show Clip.
- **FR-EXT-4 Status write-back.** "Mark applied (today)" on the page → updates the row
  (status, applied, lastcontact, next) with the same semantics as the board's bulk action.
- **FR-EXT-5 Offline queue.** Server unreachable → actions queue in extension storage and
  flush on next success.

**Acceptance criteria**
- [ ] Clip from a greenhouse page → enriched row (correct company via URL slug) on the board within ~5s.
- [ ] Re-clipping the same posting reports duplicate (req-ID dedupe respected).
- [ ] On a tracked posting's page the overlay shows fit/prob/EV + status.
- [ ] "Mark applied" flips the board row to Applied + today's date without touching other fields.
- [ ] With the server down, a clip queues and lands after the server returns.
- [ ] DevTools network audit: zero calls to anything but the configured origin.

---

### Phase 2 — iOS app foundation (local-first engine + sync)

**Goal:** a standalone app that replaces the mobile web view and works with **no backend**.

**Functional requirements**
- **Framework: React Native** (decision locked 2026-06-10) — reuses the JS core instead of a
  Swift re-port (kills logic drift); native Swift shim for the Share Extension + native modules
  for background fetch/push. A shared dependency-free **`core/` module** is the single source of
  the pure logic for server + app + extension.
- **FR-APP-1** RN + a local store (WatermelonDB / op-sqlite) with full schema parity (all tracking
  fields + `id`/`updatedAt`/`deleted`) and identical computed semantics (EV = fit×prob/10,
  tier bands, status enum, lanes).
- **FR-APP-2** Ported pure logic: `postingId` req-ID dedupe, append-merge, scoring/tier
  derivation, hygiene lanes, Today action counts. **`agent/scoring-criteria.md` is the
  canonical spec for both implementations**, enforced by a shared JSON test-vector suite.
- **FR-APP-3** Views: Today command center (action cards + last-scout strip), Open /
  Applied / Interviewing / Closed lists (tier + company grouping, applied-date sorts),
  row detail with all tracking edits + overrides, search/filters.
- **FR-APP-4 Share Extension.** From Safari/any app: Share → "Add to CRM" → editable
  confirm sheet (company/role/notes) → saved locally → on-device enrichment fills fields.
- **FR-APP-5 On-device enrichment.** URLSession fetch + JSON-LD/OG/`<title>`/URL-slug
  parsing (Swift port of `computeEnrichFields`), optional OpenAI scoring (key in Keychain).
- **FR-APP-6 SyncEngine.** Optional server URL + full token in settings (Keychain).
  Pull-push reconcile against `/api/sync` on launch / foregrounding / manual refresh;
  LWW semantics identical to the server; offline queue-and-retry. App is 100% functional
  with sync unconfigured.
- **FR-APP-7 Local notifications** (serverless): follow-up due, N leads need verification.
- **FR-APP-8 Data safety.** Local snapshots before destructive ops; CSV/JSON export via
  share sheet.

**Acceptance criteria**
- [ ] Airplane mode: capture (share ext), edit, score, browse Today/lists — all functional.
- [ ] Share-ext capture of a greenhouse URL self-enriches to the correct company/role/score on-device.
- [ ] With sync configured: phone edit appears on the desktop board and vice versa; deletes propagate as tombstones.
- [ ] Same-title, different-req-id postings captured on phone and desktop both survive sync (no false merge).
- [ ] Follow-up-due local notification fires per hygiene thresholds with the server off.
- [ ] Divergent stores (7 simulated offline days) converge with zero data loss (seeded test).
- [ ] Shared test vectors pass in both JS and Swift (scoring, dedupe, postingId, LWW).

---

### Phase 3 — Push notifications (server → app)

**Goal:** the always-on Mac proactively drives the phone. APNs is **outbound-only from
the Mac — no inbound tunnel/TLS required** for push itself.

**Functional requirements**
- **FR-PUSH-1** App registers for remote notifications → token to `/api/push/register`.
- **FR-PUSH-2** Server pushes on: scout-run complete ("Scout: 6 new · top: …"), morning
  digest, follow-up-due. **Payload carries the summary** so the alert is useful even when
  the server isn't reachable for the follow-up sync.
- **FR-PUSH-3** Tap → app opens Today and triggers a sync when reachable. Optional silent
  `content-available` push attempts a background sync (best-effort; OS-throttled).
- **FR-PUSH-4** Graceful degradation: without APNs configured, local notifications cover
  the same events; when both are possible, event-key dedupe prevents double alerts.

**Acceptance criteria**
- [ ] Scout run on the Mac → notification on the phone over cellular (off-LAN) with counts.
- [ ] Tap opens Today; new rows appear after sync when the server is reachable.
- [ ] Removing the APNs key reverts cleanly to local-notification behavior; no duplicate alerts in mixed mode.

---

### Phase 4 — In-app browser: enrichment + apply-assist (the mobile "hands")

**Goal:** make mobile applying genuinely workable — the capability gap no product fills
(Simplify has no mobile surface). This is the app's headline feature.

**Functional requirements**
- **FR-WV-1** `WKWebView` browser opens a row's link in-app; **persistent cookie store**
  (Workday-style logins survive across sessions).
- **FR-WV-2 DOM enrichment.** Injected `scrapeJobPosting()` reads the **rendered** page —
  works on JS-only SPAs that server-side curl cannot read — and updates row columns
  (company/role/location/salary/remote/JD) + rescores. Auto-run on load + manual button.
- **FR-WV-3 Apply-fill, tiered field matcher** (per-field confidence, fill only above
  threshold):
  1. `autocomplete` attribute (deterministic, exact mapping);
  2. per-ATS adapters — greenhouse/Ashby/Lever field names; Workday `data-automation-id`
     for the PII block, with simulated interaction for custom widgets (click-open, type,
     dispatch events, select option) and a `MutationObserver` to re-run on wizard steps;
  3. fuzzy synonym match on label/name/placeholder/aria-label (normalized token overlap);
  4. LLM fallback for unknown labels: `{label, name, placeholder, nearbyText}` + profile
     schema → `field | none` + confidence (batched; a few tokens per field).
- **FR-WV-4 Transparency.** Every filled field is visually highlighted; a fill summary
  lists filled / skipped / low-confidence. Fill values come only from the on-device profile.
- **FR-WV-5 Hard denylist** (never filled at any confidence): password, SSN/IDs,
  EEO/demographics/disability/veteran, consent/attestations, salary unless explicitly
  configured. **Never click Submit.** Skip-not-guess: a miss is cheap, a wrong fill is not.
- **FR-WV-6** Free-text questions route to the AI assistant (Phase 5), never blind-filled.
- **FR-WV-7 One-tap "Mark applied"** in the browser chrome → status + date + log locally
  → syncs. (The UC-2 payoff.)

**Acceptance criteria**
- [ ] Greenhouse/Ashby/Lever application: name/email/phone/LinkedIn/location filled correctly + highlighted; denylist untouched; Submit untouched.
- [ ] Workday (after one in-app login): standard PII block fills; custom widgets fill via simulated interaction or are cleanly skipped and listed.
- [ ] A JS-rendered posting that server enrichment failed on ("no metadata") is fully enriched via WKWebView scrape.
- [ ] Wrong-fill rate ≈ 0 across the test matrix (low confidence ⇒ skip).
- [ ] Full loop: open → fill → human submit → one tap → row Applied + dated → visible on the desktop board after sync.

---

### Phase 5 — AI draft assistant v2 (personal voice)

**Goal:** drafts that sound like the candidate, with a chosen level of involvement per
question — from "let AI run with it" to "interview me first."

**Functional requirements**
- **FR-AI-1 Three modes per question:** **Auto** (one-shot, today's behavior — fine for
  boilerplate), **Example** (2 short scaffold variants from different angles to react to),
  **Guided** (elicit, then draft — default for cover notes / "why us" / behavioral).
- **FR-AI-2 Guided elicitation is tap-first:** pick the anchor story from the **narrative
  library**; pick an angle (Impact / Technical / Leadership / Culture-fit); one optional
  free-text "what should land" (a metric, a hook).
- **FR-AI-3 Voice fidelity:** prompts include style exemplars (the user's saved past
  answers); hard tone guardrail — plain, PM-altitude, honest, no filler adverbs, never
  corporate-ify or inflate.
- **FR-AI-4 Rough-in mode:** paste bullets / a messy draft → AI lightly edits without
  polishing the voice out (editor, not ghostwriter).
- **FR-AI-5 Refinement loop:** reaction chips (more concise · lead with story X · less
  salesy · more technical) regenerate with the prior draft as context.
- **FR-AI-6 Save-as-snippet:** accepted answers persist into the narrative library
  (tagged by question type), becoming exemplars + near-instant answers for similar
  questions — personalization compounds.
- **FR-AI-7 API contract:** extend `/api/assist`:
  request `{key, kind, mode, question?, jd?, narrativeId?, angle?, answers?[], roughDraft?,
  priorDraft?, reaction?}` → response `{draft, variants?[], followupQuestions?[], tokens,
  usage}`. Consumed by the desktop board and the app (the app may call OpenAI directly
  with the same prompt assembly when serverless).

**Acceptance criteria**
- [ ] Guided flow on a "why this company" question: ≤3 taps + optional line → a draft that references the chosen narrative's real specifics (numbers, systems).
- [ ] A saved snippet is visibly reused when a similar question recurs.
- [ ] User evaluation: v2 Guided output reads closer to their own writing than v1 Auto output.
- [ ] Refinement chips change the draft as directed without losing the anchor story.
- [ ] Budget/caps and audit logging carry over from v1 assistant.

---

### Phase 6 — On-device scout (full self-sufficiency)

**Goal:** the app discovers roles without the server.

**Functional requirements**
- **FR-SCT-1** Swift port of board polling (greenhouse/Ashby/Lever public APIs) from a
  boards config synced from the server or edited in-app; filter → score → append-merge
  with req-ID dedupe — parity with the Python scout on the same config.
- **FR-SCT-2** `BGTaskScheduler` background refresh (best-effort; honest "last ran X ago"
  UX) + a manual Run Scout button.
- **FR-SCT-3** Local notification on new finds; event-key dedupe with server push
  (Phase 3) so the same run never alerts twice.

**Acceptance criteria**
- [ ] Server off: manual in-app scout run finds/scores/merges correctly — sample parity vs the server scout on identical config.
- [ ] No duplicate notifications when both server push and local scout cover the same finds.

---

## 5. Cross-cutting requirements

- **Auth:** full token for sync/push registration (these are the user's own devices);
  scoped INGEST token remains capture-only; tokens in iOS Keychain / extension storage;
  never in URLs.
- **Transport:** LAN HTTP is acceptable for sync (same trust domain). Off-LAN sync needs
  the documented Cloudflare-tunnel HTTPS option; **push does not** (outbound-only).
  iOS ATS exception scoped to the configured host, or the tunnel for clean HTTPS.
- **Shared law (identity & conflict):** `id` UUID · per-row LWW by `updatedAt` ·
  tombstones · req-ID dedupe (`postingId` from gh_jid / numeric id / Ashby UUID / query
  params). Identical implementations in JS and Swift, proven by one shared JSON
  test-vector suite.
- **Accounts/costs:** Apple Developer ($99/yr) required for the Share Extension + push.
- **Out of scope (hard guardrails):** bulk auto-submit; LinkedIn scraping/automation;
  rebuilding the desktop autofill matrix (Simplify's job); multi-user/cloud SaaS.

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| JS + Swift logic drift | `scoring-criteria.md` as canonical spec + shared JSON test vectors asserted in both languages |
| Workday/ATS DOM drift breaks fill | Tiered matcher degrades to skip-not-wrong; adapters only for ATSs actually used; fill summary makes gaps visible |
| iOS background limits undercut scout/sync | Server push is the primary scheduler; BG tasks are best-effort by design; honest "last ran" UX |
| LWW clock skew | Acceptable single-user; sync logs both timestamps for audit |
| Scope creep toward auto-apply | §2 principles are hard rules; every PR reviewed against them |
| Solo-maintainer bandwidth | Each phase ships standalone value; stop-anywhere roadmap; P1 alone fixes the desktop pain |

## 7. Sequencing

```
P0 server sync/push foundation ──► P1 Chrome extension   (desktop loop fixed)
        │
        └──► P2 iOS app foundation ──► P3 push ──► P4 in-app browser fill
                                            │
                                            └──► P5 assistant v2 ──► P6 on-device scout
```

**Definition of overall success:** see a job anywhere → one action captures it, enriched
and scored → triage from a push or Today on any device → apply on phone or desktop with
factual fields pre-filled and answers in your own voice → the act of applying updates the
CRM → all surfaces agree — with the Mac server optional throughout.
