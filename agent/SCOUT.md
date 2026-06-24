# Daily Scout — self-contained job finder

Replaces the Claude-desktop auto-scout with a deterministic Python pipeline that
runs on its own (no Claude in the loop). It polls real ATS board APIs, scores
roles, and merges new ones into the CRM (`data.json`) append-only.

## Files
- `agent/scout.py` — polls Greenhouse / Ashby / Lever board APIs for every
  company in `boards.json`, filters to senior PM + your domain keywords + remote,
  scores fit/prob/tier per `scoring-criteria.md`, dedupes vs `data.json`, merges,
  logs to `found-log.md`.
- `agent/boards.json` — company → ATS slug map. **Add companies here** (only
  greenhouse/ashby/lever are pollable; Workday/iCIMS sites can't be).
- `agent/watchlist.json` — title bands, domain keywords, `minFitToAdd`.
- `agent/scout_linkedin.py` — ingests LinkedIn job-alert **emails** (see below).
- `agent/run-scout.sh` — the daily runner (ATS + optional LinkedIn + xlsx export).

## Run it
```bash
python3 agent/scout.py --dry-run     # preview, writes nothing
python3 agent/scout.py               # live: merge new roles + log
python3 agent/scout.py --min-fit 6.5 --include-onsite
```
New roles land in `data.json` (so the board at localhost:8787 shows them) with
`status: "Not Applied"`. Your tracking edits are never overwritten.

## Schedule it (macOS launchd, weekday 7am)
Create `~/Library/LaunchAgents/com.reqon.scout.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.reqon.scout</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>/Users/you/Documents/reqon/agent/run-scout.sh</string></array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>2</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>3</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>4</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>5</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  </array>
</dict></plist>
```
Then: `launchctl load ~/Library/LaunchAgents/com.reqon.scout.plist`
(Unlike the Claude task, this runs even when the desktop app is closed.)

Or cron: `0 7 * * 1-5 /Users/you/Documents/reqon/agent/run-scout.sh`

## LinkedIn recommended jobs
There is **no public LinkedIn jobs API**, and scraping the site violates their
ToS + anti-bot. The clean, automatable route is the **job-alert emails** LinkedIn
already sends you:
1. In Outlook/Gmail, save LinkedIn alert emails as `.eml` or `.html` into a folder.
2. Run `python3 agent/scout_linkedin.py --dir <folder>` (or set `LI_DIR` and let
   `run-scout.sh` do it daily).
It scores them with the same engine and merges new PM roles (marked `boardonly` —
verify role/remote on the listing, since emails are title-only).
Later you can point your Microsoft 365 connector to auto-dump those emails to the
folder for a fully hands-off loop.

## Tuning
- Add/remove target companies → `boards.json`.
- Change which keywords count or the min fit → `watchlist.json`.
- Adjust scoring weights → the `PRIORITY_KW` / `SECONDARY_KW` / band logic in
  `scout.py` (mirrors `scoring-criteria.md`).
- **Salary fit** — set `searchTerms.minSalary` + `searchTerms.salaryTarget` in `watchlist.json`
  (Settings → Matching & scoring). The scout parses the top of each posting's range
  (`parse_salary_top`) and nudges fit (`salary_adj`): ≥target +0.3, ≥min neutral, below min a
  scaling penalty so under-paying roles can drop below min-fit. Unknown comp is never penalized;
  both 0 disables it.

## Pluggable sources (`agent/sources/`)
Source adapters live in the `sources/` package. Importing it registers every adapter
into `REGISTRY` (`scout.ADAPTERS`), keyed by the `boards.json` `"ats"` value. Each
adapter is `fetch(slug) -> [ {title, location, url, desc, salary} ]` — the same
normalized shape the pipeline already scores/dedupes/merges. Adapters do no scoring;
that stays centralized in `scout.py`.

Currently registered + what `slug` means:
| ats | slug | endpoint |
|---|---|---|
| greenhouse | board token | boards-api.greenhouse.io |
| ashby | board name | api.ashbyhq.com/posting-api |
| lever | company | api.lever.co/v0/postings |
| workable | apply.workable.com account | apply.workable.com widget API |
| smartrecruiters | company identifier | api.smartrecruiters.com Posting API (list + detail) |
| recruitee | `<slug>`.recruitee.com subdomain | careers offers API |
| personio | `<slug>`.jobs.personio.de subdomain (or full host) | public XML feed |
| teamtailor | `<slug>`.teamtailor.com subdomain | jobs.json (JSON Feed) |

**Add a source:** drop `sources/<name>.py` that defines `@source("<name>") def fetch(slug)`,
import it in `sources/__init__.py`, add companies to `boards.json` with `"ats": "<name>"`,
and (for re-validation) add the source's posting-URL pattern to `parse_ats()` in
`scout_run.py`. No pipeline changes needed.

Re-validation (`scout_run.py validate`) re-polls these same APIs to confirm existing
reqs are still open and refresh salary/location/remote; `parse_ats()` maps a row's link
back to `(ats, slug, posting_id)`.

## Settings, source selection, source tracking
- **Settings panel** (board → ⚙ Settings, or the Run-Scout menu → Settings…): enable/disable
  sources, edit title bands + domain keywords + min-fit + remote-only, and set the OpenAI
  model/key (and optional `THEIRSTACK_API_KEY` / `APIFY_TOKEN`). Writes to `boards.json`
  (`disabledSources`, `remoteOnly`), `watchlist.json` (`searchTerms`), and `.env`
  (`OPENAI_*`), and takes effect next run — no restart. Backed by `GET/PUT /api/settings`
  (the key is never returned to the browser — only `keySet` + last 4).
- **Run a specific source (or all):** the Run-Scout menu has a per-source checklist; leaving
  it empty runs all enabled sources. Maps to `scout.py --sources a,b` /
  `POST /api/scout/run {sources:[...]}`. `boards.disabledSources` are always skipped.
- **Source tracking:** the scout stamps `source` on every new row; quick-adds get
  `source:"manual"`. The board/mobile infer source from the link when unstamped, so the
  **Source filter** works immediately. Run-Scout → "↻ Backfill source from links"
  (`--mode source-backfill`, no network) persists `source` onto existing rows.

## More sources (MVP-2)
Added: **Workday** (per-tenant cxs JSON; slug `"<host>|<tenant>|<site>"`), **BambooHR**
(`careers/list` JSON, experimental), and key-gated aggregators **TheirStack**
(`THEIRSTACK_API_KEY`) + **Fantastic.jobs/Apify** (`APIFY_TOKEN`) that cover the messy
enterprise ATSs (iCIMS/Taleo/SuccessFactors/Workday) — off until a key is set, per the
compliance guidance (no scraping). iCIMS/Taleo/SuccessFactors/Jobvite are intentionally
routed through aggregators rather than fragile direct scrapers.

## Tests (`tests/`)
Stdlib `unittest`, no deps: `bash tests/run.sh` (or `python3 -m unittest discover -s tests`).
Covers scoring/tiering/employment filters, normalized dedupe (the embellished-vs-official
near-dupe gotcha — `norm_key` is now order-independent + abbreviation/connector-aware),
`parse_ats`, and adapter normalization (mocked HTTP).

## Source health + discovery
Each run stamps per-source metadata (companies/postings/matches/errors/lastRun) into
`agent/source-health.json`; the **Source health** panel in Settings shows it. **Add company
by URL**: paste a careers/job URL in Settings → the server detects the ATS + slug (public
boards only) → adds it to `boards.json` (deduped) for the next run.

## Secrets / API keys (`.env`)
`server.js` loads `<project>/.env` on boot (and `scout_run.py` loads it for CLI runs);
real environment vars override it. Put `OPENAI_API_KEY` (and optional `OPENAI_MODEL`,
default `gpt-5.4-mini`) there to enable AI rescoring. `.env` is gitignored; see
`.env.example`. Toggle state is shown in the board's Run-Scout menu footer.
