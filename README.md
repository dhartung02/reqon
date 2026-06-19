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
- **iOS / iPad app** (`app/`) — a React Native / Expo companion: pipeline, Today command
  center, analytics, candidate profile, and an in-app apply-assist browser. Lays out as a
  master-detail command center on iPad (landscape or portrait). Runs in **Expo Go** — no Apple
  Developer account needed; connect it to your server by **scanning a QR** from the board.
- **Chrome extension** (`extension/`) — clip any posting to the board, a fit overlay on known
  job pages, one-click "Mark Applied" write-back, and apply-assist autofill of *factual* fields
  on Greenhouse / Ashby / Lever (never EEO, consent, or submit).
- **Email response ingest** (Gmail) — reads recruiter replies on the server and updates the
  board: **auto-sets confident rejections, flags interviews/offers** for review. Deterministic
  by default, optional AI; configurable from the app or `.env`. See `agent/MAIL.md`.

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

## Mobile app & Chrome extension

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

**Chrome extension** (`extension/`) — load unpacked: `chrome://extensions` → enable *Developer
mode* → *Load unpacked* → select `extension/`. Set your server origin + token in the extension's
options. Then the toolbar button clips the current tab, a fit overlay appears on tracked/known
job pages, "Mark Applied" writes the status back, and apply-assist fills factual fields on
Greenhouse / Ashby / Lever (it never touches EEO, consent, or the submit button).

## Gmail response ingest

Keeps the board current as recruiters reply — **auto-sets confident rejections** and **flags
interviews/offers** for review (it never auto-advances a positive; a misread shouldn't move your
pipeline). Reads Gmail over IMAP with an **App Password** (2-Step Verification → App passwords),
matches conservatively (the company name must appear *and* there must be exactly one active
applied row), and writes through the audited update path. Deterministic keyword rules by default;
optional AI for the ambiguous ones.

Set it up two ways — both store credentials on the server and run there:
- **From the app:** Settings → Sync → *Gmail response ingest* (address, App Password, label) →
  **Test (dry-run)** → **Run now**.
- **From `.env` / CLI:** `GMAIL_USER` + `GMAIL_APP_PASSWORD`, then `python3 agent/mail_ingest.py`
  (dry-run) → `--apply`. The daily scout runner (`run-mail.sh`) also runs it automatically.

Full guide: [`agent/MAIL.md`](agent/MAIL.md).

## Data & privacy

`data.json` (your pipeline), `agent/profile.json` (your résumé-derived profile), résumé source
files, `seed.json`, `agent/found-log.md`, `.env`, and `backups/` are **gitignored** — no personal
data is committed. Generic `*.example.json` files ship for fresh clones. The board is LAN-only by
default; set `APP_TOKEN` to require a passphrase before exposing it.

Edits sync across the board, the app, and the extension through the server (`/api/sync`), and
deletes are **soft (tombstones)** — removing a row on one surface won't have it resurrected by
another device that hadn't seen the delete yet.

## License

MIT — see [LICENSE](LICENSE). Contributions welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
