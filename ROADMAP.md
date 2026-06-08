# Job Pipeline CRM — Roadmap & Execution Plan

Working backlog and build plan for the next 10 changes. **This is a handoff doc: the
implementation will be done by Claude Code, not in this session.** Each phase is written
to be executed independently and safely.

Owner: the candidate. Canonical project: `/Users/plex/Documents/job-pipeline-crm`.

---

## Non-negotiable operating rules (apply to EVERY phase)

1. **All settings live in the website.** Every knob — scout filters, tier thresholds,
   min-fit, blockers/negative keywords, remote-only, AI model + budget (calls/run, TTL,
   JD chars, max tokens), sources on/off, candidate profile, digest schedule, backup
   retention — **must be editable in the Settings UI and persisted server-side.** The
   UI is the source of truth; the server writes through to `boards.json` /
   `watchlist.json` / `.env` / `profile.json`. **Nothing is config-file-only.** Secrets
   (API keys) are also set from Settings (written to `.env`, never returned to the
   browser — masked to `keySet` + last 4). Current gaps to close opportunistically:
   `OPENAI_JD_CHARS`, `OPENAI_MAX_TOKENS`, `minDelaySeconds` are still `.env`/JSON-only and
   must get UI controls.

2. **Snapshot before you touch anything.** See "Snapshot protocol" below. Take a labeled
   snapshot before starting each phase, and again before any bulk/data-migrating write.
   Every phase lists its snapshot point and rollback.

3. **Never blind-overwrite tracking edits.** Adds go through the append-only merge
   (`POST /api/reqs/merge`) keyed on `company|role`; field updates go through the
   audit-logged `PATCH /api/reqs/:key`. The board's full-array `PUT /api/reqs` is the one
   risky path — Phase 0 hardens it.

4. **Deterministic core must keep working with the app/LLM off.** The scout finds +
   validates without any API key; AI rescoring/assistant are optional and budgeted.

5. **Build config-driven from day one (open-source discipline).** Do NOT bake
   the candidate-specific constants (name, resume text, scoring rubric specifics, company list)
   into `scout.py` / UI. Read them from profile/settings so Phase 10 is "expose the
   config," not "rip out hardcoding."

6. **Verify every phase before calling it done:** `node -c server.js`; `python3 -m
   py_compile` the changed Python; a headless/jsdom render check for UI; a live
   `--dry-run` for anything hitting external APIs; confirm `data.json` row count is
   unchanged unless the phase intentionally migrates (and then only after a snapshot).
   Server (`server.js`) changes require a restart:
   `launchctl kickstart -k gui/$(id -u)/com.jobcrm.server`. UI/Python changes are
   a browser refresh / next run.

---

## Snapshot protocol (rollback safety)

Two kinds of safety — **code** and **data** — because the project is not yet in Git and
the board can full-save state.

**Code (do this in Phase 0, then per phase):**
```bash
cd /Users/plex/Documents/job-pipeline-crm
git init                      # Phase 0 only, once
git add -A && git commit -m "phase-N: <desc> (pre)"   # before each phase
# ... make changes ...
git commit -am "phase-N: <desc> (done)"               # after, when verified
```
`.gitignore` already excludes `.env`, `__pycache__`, `agent/scout-status.json`. Also add
`data.json`, `backups/`, `logs/`, `node_modules/` before the first commit (data is
snapshotted separately; sample/seed data ships instead).

**Data (before each phase and before any bulk write):**
```bash
cp data.json "backups/data.phaseN-$(date +%Y%m%d-%H%M%S).json"
# or hit the endpoint while the server runs:
curl -X POST localhost:8787/api/backup
```

**Rollback:**
- Code: `git checkout -- <file>` or `git reset --hard <pre-commit>`.
- Data: stop the server, copy the snapshot back over `data.json`, restart.
- Phase 0 adds in-app snapshot/restore so this becomes a button, not a shell step.

---

## Current architecture (context for the implementer)

- **Server:** `server.js` (Node/Express, port 8787). Routes: `GET/PUT /api/reqs`,
  `POST /api/reqs/merge`, `POST /api/reqs/quickadd`, `GET /api/reqs/needing-enrichment`,
  `PATCH /api/reqs/:key` (audit-logged), `POST /api/scout/run` + `GET /api/scout/status`,
  `GET/PUT /api/settings`, `POST /api/backup`, `GET /api/export.xlsx`, `GET /api/health`.
  Loads `.env` on boot.
- **Board UI:** `public/index.html` (desktop), `mobile.html` (`/m`). Tier accordion,
  multi-select + open-in-tabs + bulk Mark-Applied, source filter, Run-Scout menu,
  Settings modal.
- **Scout:** `agent/scout.py` (find), `agent/scout_run.py` (orchestrator: find / validate /
  both / source-backfill; writes `agent/scout-status.json`), `agent/llm_enrich.py`
  (optional OpenAI rescoring, budget-gated), `agent/sources/` (pluggable adapters +
  `CATALOG`), `agent/boards.json` (companies, `disabledSources`, `minDelaySeconds`),
  `agent/watchlist.json` (`searchTerms`: keywords/titles/minFitToAdd),
  `agent/profile.json` (+ `profile-from-resume.py`), `agent/scout_linkedin.py`.
- **Store:** `data.json` (source of truth). Row fields include: `company, role, sector,
  salary, location, remote, fit, prob, tier, conf, link, notes, status, applied,
  interview, recruiter, referral, resume, cover, followup, lastcontact, next, added,
  reqCheck, reqCheckedOn, needsEnrichment, source, aiHash, aiEnrichedOn`. Computed:
  `expectedValue = fit*prob/10`.
- **Audit logs:** `agent/enrichment-log.jsonl`, `agent/found-log.md`.

---

## Build order (locked)

> Snapshot = labeled `data.json` backup + a git commit before starting.
> UI rule = every new knob gets a Settings control; nothing config-only.

### Phase 0 — Data safety: backup / change-log guardrails  *(do first)*
- **Goal:** every change reversible before more automation lands.
- **Build:** `git init` + commit current state. Auto-snapshot `data.json` before each
  board `PUT` (debounced), with retention (keep last N). Append a board-edit diff to a
  change-log JSONL (extend the existing audit pattern). Add `GET /api/backups` (list),
  `POST /api/restore` (snapshots first, then restores). Harden `PUT /api/reqs` (snapshot
  before overwrite; reject empty/short arrays as likely corruption).
- **Settings UI:** retention count, "Snapshot now", "Restore from snapshot" (list +
  confirm), "Download backup".
- **Snapshot point:** snapshot `data.json` before wiring the new write path.
- **Acceptance:** every save leaves a recoverable snapshot; restore works from the UI;
  retention enforced; a malformed full-save can't wipe the store.
- **Rollback:** git revert; restore latest pre-phase snapshot.

### Phase 0.5 — Run source backfill  *(no new code — run the built feature)*
- **Goal:** populate `source` so analytics (Phase 8) has data; ~52 of 119 rows are
  inferable from their links, the rest stay blank/`other`.
- **Do:** snapshot, then Run-Scout → "Backfill source from links" (`source-backfill` mode,
  no network). Confirm rows show `source`.
- **Acceptance:** `source` populated where link maps to a known ATS.
- **Rollback:** restore the pre-backfill snapshot.

### Phase 1 — Scout filtering & blockers
- **Goal:** stop the scout surfacing noise at the source.
- **Build:** in `scout.py`, enforce min-tier-to-merge (default A/B), skip employment
  types (contract/associate/intern), remote-only (exists), and user **negative
  keywords/blockers** (demote or drop). Store in `boards.json` (`minTierToMerge`,
  `skipEmploymentTypes`) + `watchlist.json` (`negativeKeywords`). Build config-driven.
- **Settings UI:** tier threshold, employment-type skips, blockers list (textarea),
  remote-only toggle — all editable, persisted via `PUT /api/settings`.
- **Snapshot:** git commit (no data migration).
- **Acceptance:** dry-run shows contract/associate/onsite dropped and blockers demoted;
  every rule editable in the UI.
- **Rollback:** git revert; settings revert via UI.

### Phase 2 — Board lifecycle tabs + apply-next default queue
- **Goal:** organize by lifecycle; surface "apply these next."
- **Build (UI only):** tabs **Open / Applied / Interviewing / Rejected+Archived**
  (status-driven) in `index.html` + `mobile.html`. Tier accordion lives inside **Open**.
  Open default view = Tier A/B · `conf:verified` · `reqCheck:open` · not-applied,
  EV-sorted (the apply-next queue).
- **Settings UI:** which statuses map to each tab (sensible defaults; editable).
- **Snapshot:** git commit (no data change).
- **Acceptance:** rows route to the right tab by status with counts; Open opens on the
  apply-next queue.
- **Rollback:** git revert.

### Phase 3 — Hygiene lanes
- **Goal:** the core CRM value — don't waste applies, don't drop follow-ups.
- **Build:** within the tabs, lanes/filters: **needs-verify** (not-applied +
  `conf:unverified`/`reqCheck:lead`), **follow-up due** (status Applied/active +
  `applied`/`lastcontact` older than threshold + no movement), **closed-req handling**
  (`reqCheck:closed` surfaced; offer archive — never silent-delete; 403/anti-bot resolves
  to `unknown`, not closed). Keep a human gate.
- **Settings UI:** follow-up threshold (days), verify-lane criteria, closed handling
  (suggest vs. auto-archive; default suggest).
- **Snapshot:** snapshot before any bulk archive action.
- **Acceptance:** lanes populate correctly; thresholds editable in UI; no destructive
  default behavior.
- **Rollback:** restore snapshot; git revert.

### Phase 4 — Apply-mode field
- **Goal:** make the next action explicit per row.
- **Build:** new row field `applyMode` ∈ {fillable, gated, manual, simplify}, inferred
  from source/ATS (Greenhouse/Ashby/Lever → fillable; Workday/iCIMS/custom → gated/manual).
  Backfill by inference (snapshot first). Show on card; add to filters.
- **Settings UI:** editable source→default-apply-mode mapping.
- **Snapshot:** snapshot before the backfill write.
- **Acceptance:** `applyMode` shown + filterable; mapping editable in UI; backfilled.
- **Rollback:** restore snapshot.

### Phase 5 — Candidate profile & settings + narrative-asset library
- **Goal:** make scoring about the candidate (and de-hardcode for open-source).
- **Build:** resume upload (multipart) → run `profile-from-resume.py` → `profile.json`
  (snapshot the old profile first). Surface profile keywords/weights, role/title terms,
  industry & sector preferences, and a **narrative-asset library** (CRUD: the reusable
  story blurbs) — all stored server-side. Scoring reads the profile (already partial).
  Endpoints: `POST /api/profile/resume`, `GET/PUT /api/profile`, narrative CRUD.
- **Settings UI:** resume upload control; editable role terms / industry / sector prefs;
  narrative library editor.
- **Snapshot:** back up `profile.json` before regenerate; git commit.
- **Acceptance:** uploading a resume in the UI updates scoring inputs; narrative items
  editable in UI; **audit confirms no personal constants remain hardcoded in code.**
- **Rollback:** restore `profile.json`; git revert.

### Phase 6 — AI application assistant
- **Goal:** multiply apply velocity with grounded drafts.
- **Build:** per-req "Draft cover note / answer screening Q" using profile + narrative +
  JD (reuse `llm_enrich` HTTP + budget patterns). Output is editable; **never
  auto-submit.** New endpoint `POST /api/assist` (budget-gated, logged).
- **Settings UI:** assistant enable toggle, model (may differ from scoring model), daily
  call cap / token cap.
- **Snapshot:** git commit (no data migration).
- **Acceptance:** generates grounded drafts; cost-capped + visible; human edits before use.
- **Rollback:** git revert; toggle off in UI.

### Phase 7 — Morning digest
- **Goal:** push, not pull.
- **Build:** scheduled job composes a digest (new finds, follow-ups due, newly-closed) and
  delivers it. **Architecture note for implementer:** the Express server can't call the
  M365/Slack MCP connectors — deliver via either (a) a scheduled Cowork task that reads the
  CRM API and posts to Slack/email (mirrors the existing scout task), or (b) server-side
  SMTP if creds are provided. Pick one and document it.
- **Settings UI:** digest on/off, time, channel/recipient.
- **Snapshot:** git commit.
- **Acceptance:** configurable in UI; delivers on schedule.
- **Rollback:** disable in UI; git revert.

### Phase 8 — Conversion & source-ROI analytics
- **Goal:** answer "what's actually converting?"
- **Build:** an **Analytics** tab computing (client-side from rows) the funnel
  (Not Applied → Applied → Recruiter Screen → HM → Panel → Offer / Rejected), response
  rate, interview yield, and time-to-response, broken out by **source, sector, tier, ATS.**
  Depends on Phase 0.5 backfill.
- **Settings UI:** date-range / window controls.
- **Snapshot:** none (read-only view).
- **Acceptance:** metrics reconcile with the data; source dimension is populated and
  non-empty.
- **Rollback:** git revert (UI only).

### Phase 9 — Source health/tests + dedupe + discovery
- **Goal:** durability before wider use.
- **Build:** per-source run metadata (last run, count, errors) written by the scout →
  a **Source Health** panel in Settings. A **test suite** (`tests/`) for adapters (mocked
  responses), scoring, `parse_ats`, and dedupe. Improve normalized **dedupe** (fix the
  embellished-vs-official near-dupe gotcha) + company rollup. **Source discovery:** paste a
  careers URL → detect ATS + slug → add to `boards.json` from the UI.
- **Settings UI:** "Add company by URL", source-health panel.
- **Snapshot:** git commit; snapshot before any dedupe merge that rewrites rows.
- **Acceptance:** health panel shows per-source status; tests pass; discovery adds a
  company via the UI; dedupe no longer re-adds near-dupes.
- **Rollback:** restore snapshot; git revert.

### Phase 10 — Open-source packaging
- **Goal:** publishable, generic, no personal data.
- **Build:** de-PII audit (no key/resume/name/rubric specifics in code — all via
  profile/settings/`.env`); anonymized `seed.json`; `README`, `LICENSE` (e.g. MIT),
  `CONTRIBUTING`, screenshots; generalized `install.sh`; confirm `.env.example` current.
  Because of the all-settings-in-UI rule, a fresh user configures everything from the web.
- **Settings UI:** already complete (principle enforced throughout) — verify nothing
  requires hand-editing a file.
- **Snapshot:** final git tag (e.g. `v1.0.0`) before publish.
- **Acceptance:** fresh clone + `npm install` + configure-via-UI runs with zero personal
  data committed.
- **Rollback:** git tag/branch.

---

## Dependencies & sequencing notes
- **Phase 0 precedes everything** (safety net for all later data writes).
- **0.5 backfill must precede Phase 8** (analytics needs `source`).
- **Phase 5 (profile/de-hardcode) gates Phase 10 (open-source)** — keep 1–4 config-driven
  so 5 is "surface config," not "remove hardcoding."
- **Phase 6 depends on Phase 5** (profile + narrative are its inputs).
- Phases 2, 3, 4 are largely independent UI/field work and can interleave.

## Definition of done (per phase)
Snapshot taken → built config-driven → all new knobs in Settings UI → verified
(`node -c`, `py_compile`, headless render, live dry-run) → `data.json` integrity confirmed
→ committed → restart note honored if `server.js` changed.
