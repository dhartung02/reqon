# Reqon — AI-Assisted Job Search CRM

Reqon is a self-hosted, config-driven job-search CRM for managing role discovery, application tracking, recruiter follow-up, screening preparation, and decision support.

It combines structured pipeline workflows, a deterministic multi-ATS scout, optional AI assistance, Gmail response ingest, analytics, and companion experiences across web, iOS/iPad, and Chrome.

The product is designed around one core principle: AI should assist the workflow without taking control from the user. Scoring, recommendations, cover notes, and screening answers are reviewable, editable, budget-capped, and never auto-submitted.

## Why I Built This

Most job searches become scattered across spreadsheets, browser tabs, email threads, saved postings, LinkedIn messages, and personal notes. That creates three problems:

* Good-fit roles are easy to miss.
* Follow-ups and recruiter responses are easy to drop.
* Application decisions become inconsistent and hard to prioritize.

Reqon turns that messy workflow into a structured product system: roles are captured, scored, grouped, researched, tracked, and reviewed through a repeatable pipeline.

## Product Preview

<img src="docs/images/dashboard-overview.png" alt="Reqon Dashboard" width="720">

_The main command-center board groups opportunities by lifecycle stage, fit, priority, hygiene status, and apply-next queue._

<img src="docs/images/opportunity-detail.png" alt="Opportunity Detail" width="720">

_Opportunity detail view with role metadata, scoring, notes, status, follow-up tracking, and decision support._

<img src="docs/images/ai-assist.png" alt="AI Assist" width="720">

_AI assistance is grounded in the candidate profile and narrative library, with editable outputs and human-in-the-loop review._

<img src="docs/images/analytics.png" alt="Analytics" width="720">

_Pipeline analytics — tier mix, status breakdown, applications over time, and expected-value-ranked opportunities to act on next._

<img src="docs/images/chrome-extension.png" alt="Chrome Extension" width="720">

_Reqon Clip browser extension — clip postings, see fit/EV inline, autofill standard fields, draft answers, and a board-synced side panel, all writing back to your self-hosted pipeline._

<img src="docs/images/mobile-companion.png" alt="Mobile Companion" width="300">

_The mobile companion app — your pipeline on the go, synced to the same self-hosted board._

## Core Workflows

* Pipeline management — requisitions grouped into lifecycle tabs: Open, Applied, Interviewing, and Rejected/Archived.
* Apply-next prioritization — EV-sorted queue based on fit, probability, tier, remote status, and domain alignment.
* Hygiene lanes — needs-verify, follow-up-due, and closed-req lanes to reduce wasted applications and missed follow-ups.
* Deterministic scout — polls public ATS board APIs including Greenhouse, Ashby, Lever, Workable, SmartRecruiters, Recruitee, Personio, Teamtailor, and Workday. Works with no API key. Optional **salary-fit scoring**: set a desired minimum + target and the scout weights comp (top-of-range) into overall fit.
* Apply-mode fillability detection — a deterministic page fingerprint (with an opt-in AI fallback) classifies a posting as fillable/gated/manual and remembers the verdict per host, so white-labeled boards on custom domains resolve correctly.
* Candidate profile — résumé upload extracts weighted keywords, applicant info, GitHub URL, role/sector preferences, an optional AI-drafted professional summary, and reusable narrative content.
* In-app help — a `/guide` user manual explains scores, link confidence, lanes, apply modes, source health, data safety, and integrations; reachable from the board footer and the ⓘ menu.
* Optional AI assist — résumé-aware rescoring, structured role scoring (fit/prob/tier), cover-note and screening-answer drafting, résumé-gap tailoring suggestions, and field-mapping for autofill. Built on the OpenAI **Responses API** with function calling, optional **file_search** (grounded on your résumé + narratives) and **web_search** (current company context). Budget-capped, token-metered, editable, and never auto-submitted.
* AI cost monitor — per-call token logging with daily caps and an optional $ estimate + monthly-budget bar (OpenAI doesn't expose balance via API, so cost is estimated from measured tokens × a rate you set).
* Interview prep guides — auto-generated the moment a role reaches an interview stage (grounded in your narratives + the JD), stored with the role and openable as a styled, printable page from the board card, the extension, or directly.
* Analytics — conversion funnel, response/offer/reject rates, source ROI, and pipeline health, plus a **lensed distribution layer**: view top companies, roles, role levels, salary bands, industries, tiers, and remote posture through any cohort (job reqs / applications / interviews / rejected / offers), with application-velocity and fit-by-outcome trends. Best-fit visual per metric (ranked bars, histogram, donuts).
* Notifications — a multi-channel engine: digest + per-event alerts deliver to any of **in-app (board 🔔 bell), file, Slack, email, SMS, and iOS push**. The digest runs on a clock and/or once after the first scout run of the day. **SMS has a free path** (carrier email-to-SMS gateway over your SMTP) as well as Twilio. Gmail-response detections (rejection / interview / offer) can fire their own per-event notifications on the channels you choose.
* Data safety — every save snapshots first (interview guides bundled in and restorable), destructive saves are rejected, and Settings supports snapshot/restore and retention.
* iOS/iPad companion app — React Native / Expo companion for pipeline, Today command center, analytics, candidate profile, and apply-assist workflows.
* Chrome extension (Reqon Clip) — clips postings, overlays fit signals, marks roles applied, AI-assisted autofill, a board-synced side panel (analytics, keyword coverage, AI draft, scoring, status, interview guides), and an AI usage monitor.
* Gmail response ingest — reads recruiter replies, auto-sets confident rejections, and advances confident interview emails to Recruiter Screen (which triggers the prep guide); offers are flagged for review.
* MCP server — exposes the board read-only (`list_reqs` / `get_req` / `pipeline_stats`) to MCP clients like ChatGPT desktop or Claude.

## Product Decisions

* Built around structured opportunity records instead of freeform notes or a spreadsheet.
* Used deterministic workflows for discovery, scoring, dedupe, merge, status changes, and safety checks.
* Kept AI assistance optional, reviewable, and human-controlled.
* Treated privacy as a product requirement: personal data, résumé files, credentials, and live pipeline data are gitignored.
* Designed companion surfaces for different jobs: web for command-center management, mobile for quick review, Chrome for capture, and Gmail ingest for pipeline freshness.
* Prioritized workflow reliability over flashy automation: the system should help make better decisions, not silently act on the user’s behalf.
* Made Excel an export path rather than the system of record, preserving structured state, workflow integrity, and auditability.

## What This Demonstrates

**Reqon reflects how I think about product systems:**

* Turn messy real-world workflows into structured, repeatable processes.
* Combine product strategy, data modeling, automation, AI assistance, and user control.
* Use AI to improve decision quality while preserving trust and reviewability.
* Design for multiple surfaces without simply copying the same experience everywhere.
* Build practical tools that solve real user problems end-to-end.

## Architecture

Reqon runs as a small self-hosted Node/Express application with a server-backed web UI, mobile view, optional companion clients, and local file persistence.

* **Web board** — dark command-center interface served by the Node/Express app.
* **Persistence** — edits are written to data.json on disk with snapshot/restore support and corruption protection.
* **Configuration** — sources, filters, profile settings, digest options, and optional AI settings are managed through the Settings UI.
* **Scout agent** — Python-based deterministic scanner that polls supported public ATS board APIs, filters roles, scores fit, dedupes, and merges new opportunities append-only.
* **Mobile companion** — React Native / Expo app for pipeline review, Today command center, analytics, profile, and apply-assist workflows.
* **Chrome extension (Reqon Clip)** — clipping, fit overlays, mark-applied, AI-assisted autofill, and a `chrome.sidePanel` (analytics, keyword coverage, AI draft/score, status controls, interview guides, usage monitor) — all writing back to the board.
* **Gmail ingest** — server-side IMAP workflow that reads recruiter replies, auto-sets confident rejections, and advances confident interview emails (which triggers the prep guide); offers flagged for review.
* **Interview guides** — server generates a grounded prep guide on the move into an interview stage, stored as Markdown in `agent/interview-guides/`, attached to the row (`guideAt`), served as a styled HTML page, and bundled into backups.
* **Optional AI layer** — OpenAI **Responses API** (`openaiChat`, function calling, file_search/web_search tools), endpoints for drafting, structured scoring, field-mapping, tailoring, and a usage/consumption monitor. Falls back to chat-completions; budget-capped; human-reviewed.
* **MCP server** (`mcp/`) — read-only stdio MCP server over the board API for MCP clients.

Excel is available as an on-demand export, but it is not the live database.

## Quick start

```bash
git clone <this-repo> reqon && cd reqon
npm install
npm start        # http://localhost:8787  (board)  ·  /m  (mobile)
```

Requires **Node 18+**. A fresh clone boots from `seed.example.json` (sample data). Open
**Settings** to configure sources, filters, your profile (upload a résumé), and optional AI/
digest features. Nothing requires hand-editing a file.

On macOS you can register auto-start (launchd) with `./install.sh`.

## Configuration

| Where it's stored | What | How you set it |
|---|---|---|
| `agent/boards.json` | companies, sources on/off, tiers, employment skips, tab mapping, hygiene, apply-mode map | Settings UI |
| `agent/watchlist.json` | keywords, titles, min-fit, blockers, desired salary (min + target) | Settings UI |
| `agent/profile.json` | applicant info, GitHub, summary, résumé keywords, narratives, prefs *(gitignored)* | Settings → Candidate profile (résumé upload) |
| `.env` | secrets + budgets: `OPENAI_API_KEY`, assistant/digest/SMTP/SMS, notification channels, backup retention *(gitignored)* | Settings UI (secrets masked) |

See `.env.example` for every optional variable — and **Settings → Advanced → "All environment variables"** for a live, read-only inventory of every var the server reads (secrets masked to set/last-4). The scout details live in `agent/SCOUT.md`.

**AI assist & cost.** Set `OPENAI_API_KEY` (and `OPENAI_MODEL`) to enable AI. The board uses the
Responses API by default (`OPENAI_USE_CHAT=true` forces legacy chat). OpenAI doesn't expose your
balance via API, so set `OPENAI_PRICE_PER_1M` (a blended $/1M-token rate) and optional
`ASSIST_MONTHLY_BUDGET` to get cost estimates + a budget bar. Optional tools:
`ASSIST_WEB_SEARCH=true` (company context) and `OPENAI_VECTOR_STORE_ID` for file-search grounding —
create the store with `python3 agent/setup-vector-store.py` (uploads your résumé + narratives), then
paste the printed id into `.env`. Daily call/token caps: `ASSIST_DAILY_CALLS`, `ASSIST_MAX_TOKENS`.

## Scout

```bash
python3 agent/scout.py --dry-run        # preview; writes nothing
python3 agent/scout.py                   # merge new roles into data.json
bash tests/run.sh                        # unit tests (stdlib, no deps)
```

Add a company without editing JSON: **Settings → Add company by careers URL** (paste a board
URL; it detects the ATS + slug). Per-source run health is shown in Settings.

## Mobile App & Chrome Extension

**iOS / iPad app** (`app/`, Expo SDK 56) — runs in **Expo Go**, so no Apple Developer account
or Xcode is needed to use it on your own device:

```bash
cd app && npm install
npx expo start          # then open the link in Expo Go (device on the same network)
```

iPad lays out as a master-detail command center (3-pane in landscape, 2-pane in portrait);
phone is single-column. **Connect it without typing:** on the board, **Settings → Advanced →
Pair a device** shows a QR; in the app, **Settings → Sync → Scan QR** (or paste the code) fills
the server URL + passphrase (stored in the device keychain). The native **Share Extension**
(Safari → Add to CRM) and **push notifications** require an EAS/Xcode dev build — not in Expo Go.

**Chrome extension — Reqon Clip** (`extension/`) — load unpacked: `chrome://extensions` → enable
*Developer mode* → *Load unpacked* → select `extension/`. Set your server origin + token in the
extension's options (and toggle the on-page overlay there). Then:

* the toolbar button clips the current tab and a fit/EV overlay appears on tracked/known job pages;
* **📊 Open analytics sidebar** opens a `chrome.sidePanel` with pipeline analytics, this-page
  record/clip, **résumé↔JD keyword coverage**, **⚡ AI-assisted autofill**, **✨ AI draft** for
  open-ended questions (insert into the page or copy), **Score with AI**, status controls, and an
  **AI usage** monitor;
* interview-stage roles show **📋 Interview guide**;
* apply-assist fills factual fields + matching saved answers across Greenhouse / Ashby / Lever /
  LinkedIn / Workable / SmartRecruiters / Recruitee / Teamtailor / Personio — it never touches
  passwords, EEO, consent, or the submit button.

The side panel needs Chrome 116+ (`chrome.sidePanel.open`). AI features require an OpenAI key on
the board (see Configuration).

## Gmail Response Ingest

Keeps the board current as recruiters reply — **auto-sets confident rejections** and **advances a
confident, single-match interview email** (still at "Applied") to **Recruiter Screen**, which
triggers the interview prep guide server-side. Offers are flagged for review, never auto-advanced
(a misread shouldn't move you to Offer); disable interview advancement with
`--no-advance-interviews`. Reads Gmail over IMAP with an **App Password** (2-Step Verification →
App passwords), matches conservatively (the company name must appear *and* there must be exactly
one active applied row), and writes through the audited update path. Deterministic keyword rules by
default; optional AI for the ambiguous ones.

Set it up two ways — both store credentials on the server and run there:
- **From the app:** Settings → Sync → *Gmail response ingest* (address, App Password, label) →
  **Test (dry-run)** → **Run now**.
- **From `.env` / CLI:** `GMAIL_USER` + `GMAIL_APP_PASSWORD`, then `python3 agent/mail_ingest.py`
  (dry-run) → `--apply`. The daily scout runner (`run-mail.sh`) also runs it automatically.

On a real `--apply` run it can also fire **per-event notifications** — toggle rejection / interview /
offer and pick the channels (in-app, file, Slack, email, SMS, push) under Settings → Digest &
notifications.

Full guide: [`agent/MAIL.md`](agent/MAIL.md).

## MCP server

`mcp/` is a read-only [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
your board to MCP clients (ChatGPT desktop, Claude, etc.) so an assistant can answer questions about
your pipeline. Tools: `list_reqs`, `get_req`, `pipeline_stats`. It calls the board over HTTP (never
reads `data.json` directly) and never writes.

```bash
cd mcp && npm install
REQON_ORIGIN=http://localhost:8787 node server.js   # stdio; register the command in your MCP client
```

Details: [`mcp/README.md`](mcp/README.md).

## Multi-user (optional)

By default Reqon is single-user. Set **`MULTIUSER=true`** to run one server for several people — each
gets a **fully separate** board, profile, settings, analytics, scout, and notifications; nobody can
see anyone else's data.

- **First run:** an admin is bootstrapped (`ADMIN_USER` / `ADMIN_PASSWORD`, defaults `admin` + a printed
  password). Your **existing single-user board is migrated into that admin's account** automatically
  (a copy — turning multi-user back off restores the original).
- **Accounts:** scrypt-hashed passwords, signed per-user sessions; **Settings → Users** (admin) to
  create / disable / reset / set role / grant shared-key access.
- **API keys are per-user:** each user adds their own OpenAI key (their AI usage is billed to them),
  or an admin grants **shared-key** access to run on the server's key. Per-user usage/cost accounting.
- **New users** get a guided first-run (target roles, résumé upload) that seeds their search and kicks
  off their first scout, so their first board view is relevant.
- **Devices:** each user pairs the app / extension with a **per-user token** (clips + sync land in
  their board). Data lives under `data/users/<id>/` (gitignored). Isolation is enforced in one
  resolver and covered by `node tests/test_multiuser_isolation.js`.

Storage layout and the tenant resolver live in [`lib/store.js`](lib/store.js); accounts/auth in
[`lib/users.js`](lib/users.js). With `MULTIUSER` unset, behavior is identical to single-user.

## Data & Privacy

`data.json` (your pipeline), `agent/profile.json` (your résumé-derived profile), résumé source
files, `seed.json`, `agent/found-log.md`, `agent/interview-guides/` (personal prep guides), `.env`,
and `backups/` are **gitignored** — no personal data is committed. Generic `*.example.json` files ship for fresh clones. The board is LAN-only by
default; set `APP_TOKEN` to require a passphrase before exposing it.

Edits sync across the board, the app, and the extension through the server (`/api/sync`), and
deletes are **soft (tombstones)** — removing a row on one surface won't have it resurrected by
another device that hadn't seen the delete yet.

## License

MIT — see [LICENSE](LICENSE). Contributions welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
