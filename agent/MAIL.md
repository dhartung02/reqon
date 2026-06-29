# Gmail response ingest (`mail_ingest.py`)

Reads your application-response emails from Gmail and reflects them on the board — so a rejection
flips the row to **Rejected** automatically, a confident **interview** email advances the row to
**Recruiter Screen** (which triggers the interview prep guide server-side), and an **offer** is
**flagged + notified** for review (never auto-advanced, since a misread shouldn't move you to Offer).

Stdlib-only (Gmail IMAP via `imaplib`). It does **not** scrape or use a browser — it reads your
own mailbox with an app password, the same ToS-safe pattern as `scout_linkedin.py`.

## One-time Gmail setup

1. Turn on **2-Step Verification** on your Google account.
2. Create an **App Password** (Google Account → Security → App passwords). This is a 16-character
   password scoped to one app — **not** your real account password. IMAP works with it by default.
3. Put it in `.env` (the server never returns these to the browser):
   ```
   GMAIL_USER=you@gmail.com
   GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
   ```
   Optional: `GMAIL_LABEL` (default `INBOX`; or a label you file recruiter mail into),
   `MAIL_SINCE_DAYS` (default 14), `APP_TOKEN` (if your board requires a passphrase),
   `DIGEST_SLACK_WEBHOOK` (positive-result alerts), `OPENAI_API_KEY` (only used with `--ai`).

## Use

```bash
python3 agent/mail_ingest.py                       # DRY RUN — classify + report, write nothing
python3 agent/mail_ingest.py --apply               # act: set rejections, advance confident interviews, notify
python3 agent/mail_ingest.py --apply --no-advance-interviews   # act, but DON'T auto-advance interviews
python3 agent/mail_ingest.py --ai                  # AI-classify the keyword-ambiguous ones (sends snippets to OpenAI)
python3 agent/mail_ingest.py --since-days 30 --label "Job Search"
```

Always run the **dry-run first** and read the report before `--apply`.

## Run it automatically

`agent/run-mail.sh` is the scheduled runner. It loads `.env` (scoped to its own process), no-ops
silently if Gmail isn't configured, and runs `mail_ingest.py --apply` — logging to `logs/mail.log`.
Set `MAIL_AI=true` in `.env` to also AI-classify the ambiguous ones.

You don't have to wire anything up: the **daily scout already calls it** (`run-scout.sh` step 3),
so once `GMAIL_USER` / `GMAIL_APP_PASSWORD` are in `.env`, your weekday-morning scout run will also
ingest mail. To check responses **more often**, add your own schedule, e.g. an hourly launchd agent
or cron entry pointing at `agent/run-mail.sh`:

```cron
0 * * * *  /bin/bash /path/to/reqon/agent/run-mail.sh
```

`tail -f logs/mail.log` to watch it.

## How it decides (conservative by design)

- **Classification** is deterministic keyword rules by default (rejection language wins even when
  an email also says "interview"). `--ai` only classifies the leftover ambiguous ones.
- **Matching** requires the tracked **company name to appear** in the sender/subject/body **and**
  exactly **one active applied row** at that company. Generic ATS senders (greenhouse/ashby/lever/
  workday) rarely carry the company, so body text matters — anything ambiguous is left for you.
- **Writes** go through the audited `PATCH /api/reqs/:key` path (snapshots + change log). A
  rejection is only set on an active applied row (`Applied`/`Recruiter Screen`/`Hiring Manager`/
  `Panel`) — it never downgrades an `Offer` or touches a non-applied row.
- **Interview advancement** is gated tighter than rejections: it only fires on a confident
  classification (≥0.7) with **exactly one** match that is still at `Applied`, advancing it to
  `Recruiter Screen`. The server, seeing that move, auto-builds the interview prep guide. Disable
  with `--no-advance-interviews`. Offers are never auto-advanced.
- Processed message-ids are remembered in `agent/mail-state.json` so nothing is acted on twice.
- **Per-event notifications.** On a real `--apply` run the script prints a machine-readable
  `SUMMARY_JSON` line (counts + per-event company/role). Run via the server (`POST /api/mail/run`),
  it dispatches alerts for the event types you enabled (`MAIL_NOTIFY_REJECTION` / `_INTERVIEW` /
  `_OFFER`) on the channels in `MAIL_NOTIFY_CHANNELS` (in-app/file/slack/email/sms/push) — set these
  under Settings → Digest & notifications. Dry runs never notify.

## The other direction — email job-scout (`scout_email.py`)

`mail_ingest.py` tracks **responses** to jobs you applied to. `scout_email.py` does the opposite
end: it reads the job-**recommendation / alert** emails the job sites send you (LinkedIn, Indeed,
Glassdoor, ZipRecruiter, Dice, BuiltIn, Wellfound) and adds the recommended roles to the board as
**new leads** — scored with the same engine as `scout.py`, deduped append-only, and **resolved to
the employer's real career-site req** when possible. Same live Gmail connection, no scraping.

```bash
python3 agent/scout_email.py                 # DRY RUN — parse + report, write nothing
python3 agent/scout_email.py --apply          # add new leads to the board
python3 agent/scout_email.py --no-resolve     # skip career-site resolution (faster)
python3 agent/scout_email.py --sources linkedin,indeed
python3 agent/scout_email.py --since-days 7 --label "Job Alerts" --min-fit 6.5
python3 agent/scout_email.py --dir ~/Downloads/alerts   # offline: saved .eml/.html, no Gmail
```

### Req resolution (`req_resolver.py`) — turn a fuzzy lead into a real apply link

Alert emails hand you a company + title + an *aggregator redirect*. The resolver upgrades each lead
in three tiers (all ToS-safe — public board APIs only):

1. **Company already in `boards.json`** → fetch its ATS board, fuzzy-match the title → canonical
   employer apply URL + real location/salary, lead marked `verified`.
2. **Company not mapped** → derive candidate slugs from the name and probe Greenhouse/Ashby/Lever.
   On a hit, the company is **appended to `boards.json`** (so the daily ATS scout permanently covers
   it too), then title-matched as in tier 1.
3. **No pollable board** (Workday/iCIMS/Phenom/custom) → keep the aggregator link at `unverified`.

Confidence on the resulting row: `verified` (matched a live req), `boardonly` (board found, exact
req not matched), or `unverified` (aggregator link only, title-only score). The `source` is stamped
`<site>-email` (e.g. `linkedin-email`) so you can filter leads that came from your inbox.

### Run it automatically

`agent/run-email-scout.sh` is the scheduled runner. It **no-ops unless `EMAIL_SCOUT=true`** (and
Gmail is configured), so it's safe to leave wired. The daily scout already calls it
(`run-scout.sh` step 3b). Enable + tune it under **Settings → Digest & notifications → Email
job-scout**, or in `.env`:

```
EMAIL_SCOUT=true
EMAIL_SCOUT_NO_RESOLVE=false        # set true to skip career-site resolution
EMAIL_SCOUT_SOURCES=linkedin,indeed # optional; blank = all sources
EMAIL_SCOUT_MIN_FIT=6               # optional; blank = watchlist minFitToAdd
EMAIL_SCOUT_NOTIFY_CHANNELS=inapp   # where to announce "N new leads added"
```

The board exposes **Test (dry run)** / **▶ Run now** buttons in the same settings panel
(`POST /api/mail/scout {apply}`); on a real run that adds leads it drops an in-app notification.
Processed message-ids are remembered in `agent/email-scout-state.json` so the same alert email
isn't re-surfaced. Default is **dry-run** everywhere — it writes nothing until you pass `--apply`.

### Caveats (set expectations)

- **Title-only scoring** — there's no JD in an alert email, so fit is scored from the title; the row
  note says "verify on the listing." Resolution to a live req is what raises confidence.
- **Parsing is heuristic** — alert-email HTML changes often; a missed company/location degrades
  gracefully (the role is skipped or kept at lower confidence rather than mis-filed).
- **Remote-only** still applies — explicitly onsite roles are dropped unless `--include-onsite`.

## Privacy

Your mailbox credentials and email content stay on your self-hosted server. Nothing leaves except
what you've configured (the Slack/SMTP alert you set up, or OpenAI snippets if you pass `--ai`). The
req resolver only calls public ATS board APIs. `mail-state.json` and `email-scout-state.json` are
gitignored.
