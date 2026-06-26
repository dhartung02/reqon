# Reqon — test cases

A reusable QA checklist for full regression passes and pre-release verification across all four
surfaces: **server/API**, **web board**, **Chrome extension**, and **companion app**.

> Device-only items (mic, push, share sheet, native dev-build modules) live in
> [DEVICE-TESTING.md](DEVICE-TESTING.md) — this document covers everything verifiable in a browser,
> a terminal, or Expo Go.

## How to use

- Copy the relevant section into a run log (date + build/commit), mark each **Status** `✅ pass`,
  `❌ fail`, `⏭ skip`, or `🔲 not run`, and note the actual result + a bug link on any failure.
- **Priority:** P1 = blocks release (core data integrity, auth, persistence); P2 = important;
  P3 = polish / edge.
- **Always back up first.** Several cases mutate state — run against a scratch copy or
  `POST /api/backup` before starting, and never point a destructive test at the live `data.json`.

## Environment setup

| | Steps |
|---|---|
| **Server** | `cd /Users/plex/Documents/reqon && npm start` (or the launchd service). Board at `http://localhost:8787`. |
| **Scratch data** | To avoid touching live data, run a throwaway instance: `REQON_DATA_DIR=/tmp/reqon-qa PORT=8799 node server.js` and test against `:8799`. |
| **AI cases** | Require `OPENAI_API_KEY` set + AI assistant enabled (Settings). Skip/mark `⏭` if no key. |
| **Multi-user** | Set `MULTIUSER=true`; first run creates the admin. |
| **Extension** | Load `extension/` unpacked in Chrome (chrome://extensions → Developer mode → Load unpacked). |
| **App** | `cd app && npx expo start`; open in Expo Go (or a dev build for native features). Pair to the server via QR or URL + passphrase. |

---

## SRV — server, persistence & data integrity (P1 core)

| ID | Test case | Steps | Expected | Pri |
|---|---|---|---|---|
| SRV-01 | Health check | `GET /api/health` | `200`, `{ok:true}` + row count | P1 |
| SRV-02 | Load all reqs | `GET /api/reqs` | `200`, JSON array of requisitions | P1 |
| SRV-03 | Full save round-trips | Edit a field in the board, wait for debounced `PUT /api/reqs`; reload page | Edit persists across reload (server-side, not browser storage) | P1 |
| SRV-04 | Persistence survives restart | Make an edit → restart server → reload board | Edit still present (written to `data.json`) | P1 |
| SRV-05 | Append-only merge | `POST /api/reqs/merge` with a new + an existing `company+role` | New row appended; existing row's tracking edits **untouched** | P1 |
| SRV-06 | Merge dedupe | Merge the same role twice | Second merge adds nothing (deduped by lowercased `company+role`) | P1 |
| SRV-07 | Shrink guard | `PUT /api/reqs` with a payload dropping >`PUT_GUARD_PCT`% of rows | Save **refused** unless `?allowShrink=1` | P1 |
| SRV-08 | Empty-over-nonempty guard | `PUT` an empty array over a populated store | Refused | P1 |
| SRV-09 | Backup snapshot | `POST /api/backup` | Timestamped file appears in `backups/`; interview guides bundled | P2 |
| SRV-10 | Backup retention | Create > `BACKUP_RETENTION` snapshots | Oldest pruned to the cap | P3 |
| SRV-11 | Excel export | `GET /api/export.xlsx` | Workbook downloads with 2 tabs (Pipeline + Guide & Dashboard); `data.json` unchanged | P2 |
| SRV-12 | Per-row audited update | `PATCH /api/reqs/:key` a field | Row updates; change recorded with actor; `updatedBy` stamped | P2 |
| SRV-13 | Computed EV | Set fit=8, prob=6 on a row | `expectedValue` shows 4.8 (fit×prob/10, not stored) | P2 |
| SRV-14 | LinkedIn company leak guard | Quickadd a role from a LinkedIn page title | Aggregator host never stamped as company (→ `Unknown`); both title shapes parsed | P2 |

---

## BRD — web board, core (P1/P2)

| ID | Test case | Steps | Expected | Pri |
|---|---|---|---|---|
| BRD-01 | Board loads | Open `http://localhost:8787` | Dark command-center board renders; reqs grouped in lanes | P1 |
| BRD-02 | Add a req | Use quickadd / new-row entry | Row added, scored, visible; persists on reload | P1 |
| BRD-03 | Inline salary edit | Edit salary on an expanded card | Saves; reflected after reload | P2 |
| BRD-04 | Inline location edit | Edit location on a card | Saves; reflected after reload | P2 |
| BRD-05 | Status change | Move a row to a new status | Lane/badge updates; persists | P1 |
| BRD-06 | Interview-stage → guide | Set status to Recruiter Screen / Hiring Manager / Panel / Offer | Interview guide auto-generates; `guideAt` set; card links it | P2 |
| BRD-07 | View guide | Open `GET /api/reqs/:key/guide` | Styled HTML guide page (404 if none) | P2 |
| BRD-08 | Tracking strip | Expand a card | Shows source / updatedAt / updatedBy strip | P3 |
| BRD-09 | Notifications bell | Trigger an event (e.g. scout find); open 🔔 | Feed shows item; mark-read clears unread count | P2 |
| BRD-10 | Theme intact | Visual check | Dark theme, Fraunces + Spline Sans fonts, scoring colors preserved | P3 |
| BRD-11 | Help/Guide page | Open `/guide` | Definitions, lanes, apply modes, integrations render | P3 |

---

## DEC — decision layer (P2 features)

| ID | Test case | Steps | Expected | Pri |
|---|---|---|---|---|
| DEC-01 | Action items | `GET /api/action-items` | Deterministic action list; `?surface=` + `?type=` filters narrow it | P2 |
| DEC-02 | Command center | Open the board command center | Surfaces the same action items, grouped/prioritized | P2 |
| DEC-03 | Per-role timeline | `GET /api/reqs/:key/timeline` + open timeline modal | Chronological events from row fields + enrichment log, tagged by actor | P2 |
| DEC-04 | Pipeline health | `GET /api/pipeline-health`; check banner atop Analytics | Health band + main risk + recommended actions | P2 |
| DEC-05 | Source quality | Open the source-quality analytics card | Per-source counts/quality consistent with the pipeline | P2 |
| DEC-06 | Analytics parity | Compare board analytics vs `GET /api/analytics` | Numbers match (no client/server drift, e.g. "applied" count) | P1 |
| DEC-07 | Follow-up recommendation | `GET /api/reqs/:key/followup`; open follow-up modal | Stage-aware recommendation; message draftable via assist `kind:followup` | P2 |
| DEC-08 | Background jobs | `GET /api/jobs`, run a scout/enrich, watch the jobs modal | Job appears with phase/progress; `POST /api/jobs/:id/cancel` cancels | P2 |

---

## AI — assistant & generation (P2; needs OpenAI key)

| ID | Test case | Steps | Expected | Pri |
|---|---|---|---|---|
| AI-01 | Cover draft | `POST /api/assist` `kind:cover` | First-person draft grounded only in narratives; no invented employers/metrics | P2 |
| AI-02 | Screening / answer | `kind:screening` / `kind:answer` | Honest, PM-level answer 120–180 words | P2 |
| AI-03 | Tailor | `kind:tailor` with missing keywords | Per-keyword honest bullet **or** "gap — not supported"; no fabrication | P2 |
| AI-04 | Structured score | `POST /api/assist/score` | Returns fit/prob/tier/rationale via function calling | P2 |
| AI-05 | Field map autofill | `POST /api/assist/map-fields` | Factual values only | P2 |
| AI-06 | Draft summary | `POST /api/profile/draft-summary` | Grounded professional summary from résumé/profile | P2 |
| AI-07 | Narrative suggest | `POST /api/profile/narratives/suggest` | 4–6 grounded suggestions; `[bracketed prompts]` where a metric is unknown; never invents | P2 |
| AI-08 | Narrative polish | `POST /api/profile/narratives/polish` | 60–110-word body; preserves real metrics, drops unfilled brackets | P2 |
| AI-09 | Transcribe (voice) | `POST /api/transcribe` with a clip | Returns transcript text; key stays server-side *(audio happy-path is device-only)* | P2 |
| AI-10 | Daily cap | Exceed `ASSIST_DAILY_CALLS` | `429` with a clear cap message | P2 |
| AI-11 | Monthly token cap | Exceed `ASSIST_MONTHLY_TOKENS` | AI calls blocked with raise-the-cap message | P3 |
| AI-12 | Disabled / no key | Disable assistant or unset key, call any AI route | `403`/`400` with actionable message; no crash | P1 |
| AI-13 | Usage accounting | `GET /api/assist/usage` after calls | Call/token counts increment; $ estimate if `OPENAI_PRICE_PER_1M` set | P3 |
| AI-14 | Grounding guard | Call cover/answer with an empty narrative library | States facts are missing rather than fabricating | P1 |

---

## APM — apply-mode fillability (P2)

| ID | Test case | Steps | Expected | Pri |
|---|---|---|---|---|
| APM-01 | Deterministic probe | `POST /api/applymode/probe` with a Greenhouse/Ashby/Lever URL | Resolves `fillable`; host→mode learned/persisted | P2 |
| APM-02 | Gated portal | Probe a Workday/iCIMS URL | Resolves gated/manual; not flagged fillable | P2 |
| APM-03 | "🔎 detect" button | Click detect on a card with an unknown host | Probes; asks before spending AI; remembers verdict | P2 |
| APM-04 | AI fallback | Inconclusive probe → confirm AI classify | `POST /api/applymode/probe-ai` classifies + persists | P3 |
| APM-05 | White-labeled board | Detect a custom-domain board that is really Greenhouse/Ashby | Resolves `fillable` | P3 |

---

## SCT — scout (P2)

| ID | Test case | Steps | Expected | Pri |
|---|---|---|---|---|
| SCT-01 | Dry run | `python3 agent/scout.py --dry-run` | Lists matches; **no** writes to `data.json` | P1 |
| SCT-02 | Live merge | `python3 agent/scout.py` | New senior-PM/domain/remote roles scored + merged append-only; logged to `found-log.md` | P2 |
| SCT-03 | Remote-only filter | Run with onsite roles in the board APIs | Onsite roles skipped/penalized unless `--include-onsite` | P2 |
| SCT-04 | Min-fit gate | `--min-fit N` | Roles below N excluded | P3 |
| SCT-05 | Salary fit nudge | Set `minSalary` + `salaryTarget` in Settings; run | Fit nudged per the band; unknown comp never penalized | P3 |
| SCT-06 | Dedupe vs Applied | Scout a near-dupe of an already-Applied role | Not re-added (spot-check title normalization) | P2 |
| SCT-07 | Scoring fidelity | Inspect scored rows | Fit/prob/tier follow `agent/scoring-criteria.md`; web-found default `boardonly`/`unverified` | P2 |

---

## AUTH — auth & multi-user (P1; `MULTIUSER=true`)

| ID | Test case | Steps | Expected | Pri |
|---|---|---|---|---|
| AUTH-01 | First-run admin | Boot fresh multi-user | First account created as admin | P1 |
| AUTH-02 | Login required | Hit board/API off-localhost without auth | Passphrase/login required; `401` from API | P1 |
| AUTH-03 | Tenant isolation | Log in as two users, each adds reqs | Each sees only their own data (namespaced) | P1 |
| AUTH-04 | `GET /api/me` | Call while logged in | Returns identity; `impersonatedBy` when impersonating | P2 |
| AUTH-05 | Admin overview | Open Admin console | Users + usage + server stats | P2 |
| AUTH-06 | Per-user cap | Admin sets a token cap; user exceeds | AI blocked for that user only | P2 |
| AUTH-07 | Impersonate | Admin impersonates a user, then stops | `crm_imp` cookie set/cleared; actions audited to `admin-audit.jsonl` | P2 |
| AUTH-08 | Restore a user's data | Admin restore op | Target user's data restored from snapshot | P2 |
| AUTH-09 | Force scout (admin) | Admin triggers a user's scout/digest/gmail | Runs for that user; audited | P3 |
| AUTH-10 | Owner/legacy path | Run with `MULTIUSER` unset | Single-owner behavior unchanged (non-breaking) | P1 |

---

## EXT — Chrome extension (P2)

| ID | Test case | Steps | Expected | Pri |
|---|---|---|---|---|
| EXT-01 | Clip a role | On a job posting, use the extension to capture | Role added to the board via merge path | P2 |
| EXT-02 | Rich capture | Clip a posting with description/comp | Captured fields populate (company, role, link, notes) | P2 |
| EXT-03 | Fillability hint | Overlay on a known ATS | Shows fillable/gated hint | P3 |
| EXT-04 | Note/tag/priority at clip | Add note + tag + priority while clipping | Persisted on the new row | P3 |
| EXT-05 | Autofill summary | Trigger autofill on a fillable form | Summary of filled fields shown; demographics/passwords/submit skipped | P2 |
| EXT-06 | Queue visibility | Open the popup with queued clips | Queue listed with status | P3 |
| EXT-07 | Auth to server | Clip with the passphrase/`INGEST_TOKEN` set | Authorized; unauthorized clip rejected | P2 |

---

## APP — companion app (P2; Expo Go unless noted)

| ID | Test case | Steps | Expected | Pri |
|---|---|---|---|---|
| APP-01 | Pair via QR | Settings → scan board QR | Connects without typing URL/passphrase | P2 |
| APP-02 | Pair via code | Enter URL + passphrase manually | Connects | P2 |
| APP-03 | Today action queue | Open Today | Count cards on top, action list below; tap a role | P2 |
| APP-04 | Role detail sheet | Tap a Today role | Opens in a swipe-dismiss sheet; swipe returns fast | P2 |
| APP-05 | AI re-score | Re-score a role in detail | New fit/prob/tier persists | P2 |
| APP-06 | Interview guide | Open a guide in-app | Renders natively from `guide.json` (poll-based, no timeout) | P2 |
| APP-07 | Analytics | Open Analytics | Mirrors server `/api/analytics`; falls back to local offline | P2 |
| APP-08 | Pipeline health | Check health card | Matches `/api/pipeline-health` | P3 |
| APP-09 | Notifications bell | Open bell from NavRail | Feed + unread count; mark-read works | P2 |
| APP-10 | Profile fields | Edit basics/links/education/work; Save | Persists local + server (two-way sync) | P2 |
| APP-11 | Résumé upload | Upload a résumé | Parses; profile + keywords refresh | P2 |
| APP-12 | Draft summary | Tap Draft from résumé | Grounded summary fills; review then Save | P3 |
| APP-13 | Narrative builder | Profile → Build from résumé | Suggestions → elaborate → ✨ Polish → Add → Save persists | P2 |
| APP-14 | Voice narrative | 🎤 Speak it / Dictate *(dev build)* | See [DEVICE-TESTING.md](DEVICE-TESTING.md) | P2 |
| APP-15 | Offline-first | Edit offline, then reconnect | Two-way sync reconciles; no data loss | P1 |
| APP-16 | Slow-link resilience | Throttle the connection | Read calls fast-fail at the timeout; readable errors, no hang | P2 |
| APP-17 | iPad landscape | Rotate on iPad *(device)* | Master-detail + open-row highlight; SectionList pipeline | P2 |
| APP-18 | Gmail ingest panel | Settings → App Password → Test dry-run → Run *(device)* | Dry-run summary, then live ingest reflects on board | P3 |

---

## DEP — deployment / Render split (P2)

| ID | Test case | Steps | Expected | Pri |
|---|---|---|---|---|
| DEP-01 | Role: api | `REQON_ROLE=api`, hit `/api/*` + `/health` | API serves; UI/static disabled | P2 |
| DEP-02 | Role: cloud | `REQON_ROLE=cloud`, load the UI | UI served; `/api/*` reverse-proxied to the api service | P2 |
| DEP-03 | Role: all | `REQON_ROLE=all` (default) | Single-process serves both | P1 |
| DEP-04 | CORS allowlist | Request from an allowed vs disallowed origin | Credentialed CORS only for `CORS_ALLOWED_ORIGINS`; others blocked | P2 |
| DEP-05 | Data dir bootstrap | Fresh `DATA_DIR` on boot | Creates `agent/`/`backups/`; no ENOENT crash | P2 |
| DEP-06 | Health endpoint | `GET /health` on each service | `200` for the Render health check | P2 |

---

## REG — cross-cutting regression (run every pass)

| ID | Test case | Expected | Pri |
|---|---|---|---|
| REG-01 | No browser storage | Grep UI: no `localStorage`/`window.storage` reintroduced — persistence is server-side only | P1 |
| REG-02 | Secrets server-side | No API key/secret ever sent to the client or logged in cleartext | P1 |
| REG-03 | No fabricated data | AI never invents salaries, links, employers, metrics, quotes, names | P1 |
| REG-04 | `data.json` is source of truth | Excel never read back as state; no blind file overwrite outside the merge path | P1 |
| REG-05 | App typecheck + tests | `cd app && npx tsc --noEmit && npm test` | P1 |
| REG-06 | Server syntax | `node -c server.js` clean | P1 |
| REG-07 | found-log append-only | Scout appends dated entries, never rewrites history | P2 |
