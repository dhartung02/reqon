# Job Pipeline CRM

A **self-hosted, config-driven job-search CRM** with a deterministic multi-ATS scout and
optional AI assist. A small Node/Express server serves a dark "command-center" board (plus a
phone view) and persists every edit to a JSON file on disk — server-backed, survives refreshes
and reboots. Excel is an on-demand export, never the live database.

Everything is configured from the **Settings** panel in the web UI — no file editing required.

## Features

- **Pipeline board** — requisitions grouped into lifecycle tabs (Open / Applied / Interviewing /
  Rejected+Archived), a tier accordion, and an EV-sorted "apply-next" queue.
- **Hygiene lanes** — needs-verify, follow-up-due, and closed-req lanes so you don't waste
  applies or drop follow-ups. Archiving is always human-confirmed and snapshotted first.
- **Deterministic scout** — polls public ATS board APIs (Greenhouse, Ashby, Lever, Workable,
  SmartRecruiters, Recruitee, Personio, Teamtailor, Workday, …), filters to senior PM + your
  domain keywords + remote, scores fit/interview-probability/tier, dedupes, and merges
  append-only. **Works with no API key.**
- **Candidate profile** — upload a résumé to auto-extract weighted keywords + applicant info;
  edit role/industry/sector preferences and a reusable **narrative library**. Scoring reads it.
- **Optional AI** — résumé-aware rescoring and a per-req cover-note / screening-answer
  **assistant** (grounded in your profile + narratives). Budget-capped; output is editable and
  never auto-submitted.
- **Analytics** — conversion funnel, response/offer rates, and source-ROI breakdowns.
- **Morning digest** — scheduled new-finds / follow-ups / closed summary via Slack webhook,
  SMTP email, or a file fallback.
- **Data safety** — every save snapshots first, a corruption guard rejects destructive saves,
  and Settings has snapshot/restore + retention.
- **Apply-mode** — each row is tagged fillable / gated / simplify / manual to plan the apply step.

## Quick start

```bash
git clone <this-repo> job-pipeline-crm && cd job-pipeline-crm
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
| `agent/watchlist.json` | keywords, titles, min-fit, blockers | Settings UI |
| `agent/profile.json` | applicant info, résumé keywords, narratives, prefs *(gitignored)* | Settings → Candidate profile (résumé upload) |
| `.env` | secrets + budgets: `OPENAI_API_KEY`, assistant/digest/SMTP, backup retention *(gitignored)* | Settings UI (secrets masked) |

See `.env.example` for every optional variable. The scout details live in `agent/SCOUT.md`.

## The scout

```bash
python3 agent/scout.py --dry-run        # preview; writes nothing
python3 agent/scout.py                   # merge new roles into data.json
bash tests/run.sh                        # unit tests (stdlib, no deps)
```

Add a company without editing JSON: **Settings → Add company by careers URL** (paste a board
URL; it detects the ATS + slug). Per-source run health is shown in Settings.

## Data & privacy

`data.json` (your pipeline), `agent/profile.json` (your résumé-derived profile), `seed.json`,
`agent/found-log.md`, `.env`, and `backups/` are **gitignored** — no personal data is committed.
Generic `*.example.json` files ship for fresh clones. The board is LAN-only by default; set
`APP_TOKEN` to require a passphrase before exposing it.

## License

MIT — see [LICENSE](LICENSE). Contributions welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
