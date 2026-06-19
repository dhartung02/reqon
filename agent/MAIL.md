# Gmail response ingest (`mail_ingest.py`)

Reads your application-response emails from Gmail and reflects them on the board — so a rejection
flips the row to **Rejected** automatically, and an interview/offer **flags + notifies** you to
review (never auto-advanced, since a misread shouldn't move your pipeline).

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
python3 agent/mail_ingest.py                 # DRY RUN — classify + report, write nothing
python3 agent/mail_ingest.py --apply         # act: auto-set rejections, notify on positives
python3 agent/mail_ingest.py --ai            # AI-classify the keyword-ambiguous ones (sends snippets to OpenAI)
python3 agent/mail_ingest.py --since-days 30 --label "Job Search"
```

Always run the **dry-run first** and read the report before `--apply`. Once it looks right, schedule
`--apply` (e.g. via launchd, like the scout).

## How it decides (conservative by design)

- **Classification** is deterministic keyword rules by default (rejection language wins even when
  an email also says "interview"). `--ai` only classifies the leftover ambiguous ones.
- **Matching** requires the tracked **company name to appear** in the sender/subject/body **and**
  exactly **one active applied row** at that company. Generic ATS senders (greenhouse/ashby/lever/
  workday) rarely carry the company, so body text matters — anything ambiguous is left for you.
- **Writes** go through the audited `PATCH /api/reqs/:key` path (snapshots + change log). A
  rejection is only set on an active applied row (`Applied`/`Recruiter Screen`/`Hiring Manager`/
  `Panel`) — it never downgrades an `Offer` or touches a non-applied row.
- Processed message-ids are remembered in `agent/mail-state.json` so nothing is acted on twice.

## Privacy

Your mailbox credentials and email content stay on your self-hosted server. Nothing leaves except
what you've configured (the Slack/SMTP alert you set up, or OpenAI snippets if you pass `--ai`).
`mail-state.json` is gitignored.
