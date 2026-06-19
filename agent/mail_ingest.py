#!/usr/bin/env python3
"""
mail_ingest.py — read application-response emails from Gmail and reflect them on the board.

WHAT IT DOES
  1. Connects to Gmail over IMAP (read-only) and pulls recent messages.
  2. Classifies each as rejection / interview / offer / other — deterministically by default
     (keyword rules), or with AI (--ai, needs OPENAI_API_KEY) for the ambiguous ones.
  3. Matches a message to a tracked, currently-active application by company name (conservative:
     it must find the company name in the sender/subject/body, and exactly one active row).
  4. Acts, safely:
       - REJECTION + one active match  -> sets that row's status to "Rejected" (via the audited
         PATCH /api/reqs/:key path; never downgrades an Offer, never touches a non-applied row).
       - INTERVIEW / OFFER             -> never changes status (a misread shouldn't advance your
         pipeline). It flags + notifies you to review and advance it yourself.
       - ambiguous / no clean match    -> flagged in the report, nothing written.
  5. Notifies (optional) on positives via the Slack webhook the digest already uses.

GMAIL SETUP (one time)
  - Turn on 2-Step Verification, then create an *App Password* (Google Account → Security →
    App passwords). IMAP is enabled by default for App-Password access.
  - Put these in .env (the server never sends them to the browser):
        GMAIL_USER=you@gmail.com
        GMAIL_APP_PASSWORD=the-16-char-app-password
  - Optional: GMAIL_LABEL (default INBOX), CRM_BASE (default http://localhost:$PORT),
    APP_TOKEN (if your board requires a passphrase), DIGEST_SLACK_WEBHOOK (positive alerts),
    OPENAI_API_KEY (only used with --ai).

USAGE
    python3 agent/mail_ingest.py                 # DRY RUN — classify + report, write nothing
    python3 agent/mail_ingest.py --apply         # act: auto-set rejections, notify on positives
    python3 agent/mail_ingest.py --ai            # use AI to classify the keyword-ambiguous ones
    python3 agent/mail_ingest.py --since-days 30 --label "Job Search"

Stdlib only (imaplib, email, smtplib/urllib). Safe to schedule once you've run --dry-run.
"""

import argparse
import datetime
import email
import email.utils
import imaplib
import json
import os
import re
import sys
import urllib.request
import urllib.parse
from email.header import decode_header, make_header

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA_FILE = os.path.join(ROOT, "data.json")
STATE_FILE = os.path.join(HERE, "mail-state.json")
LOG_FILE = os.path.join(HERE, "found-log.md")
TODAY = datetime.date.today().isoformat()
PORT = os.environ.get("PORT", "8787")

# Statuses an auto-rejection may overwrite: applied + still active. Never downgrade Offer, never
# touch Not Applied / already-closed rows.
ACTIVE_APPLIED = {"Applied", "Recruiter Screen", "Hiring Manager", "Panel"}

# --- classification rules (deterministic) ----------------------------------------------------
# Strong rejection phrases are unambiguous and take precedence (a rejection email often still
# contains the word "interview"). Order of checks: reject -> offer -> interview -> other.
REJECT = [
    "unfortunately", "not moving forward", "won't be moving forward", "will not be moving forward",
    "not be moving forward", "decided to move forward with other", "move forward with other candidates",
    "pursue other candidates", "other applicants", "position has been filled", "role has been filled",
    "we have decided not to", "not to proceed", "will not be proceeding", "no longer considering",
    "not selected", "unable to offer", "not be progressing", "decided not to move", "wish you the best",
    "wish you success", "keep your resume on file",
]
OFFER = [
    "pleased to offer", "offer of employment", "extend an offer", "offer letter",
    "compensation package", "we would like to offer", "formal offer",
]
INTERVIEW = [
    "schedule", "phone screen", "interview", "next steps", "your availability", "set up a call",
    "set up a time", "chat with", "meet with the team", "recruiter screen", "hiring manager",
    "would love to connect", "book a time", "calendly", "speak with you",
]


def classify_email(subject, body):
    """Pure classifier. Returns {kind, confidence, signals}. kind in
    rejected|interview|offer|other. No I/O — unit-tested in tests/test_mail_classify.py."""
    t = ((subject or "") + "\n" + (body or "")).lower()
    hit = lambda kws: [k for k in kws if k in t]
    rej, off, intv = hit(REJECT), hit(OFFER), hit(INTERVIEW)
    if rej:
        return {"kind": "rejected", "confidence": 0.9 if len(rej) > 1 else 0.75, "signals": rej}
    if off:
        return {"kind": "offer", "confidence": 0.85, "signals": off}
    if intv:
        return {"kind": "interview", "confidence": 0.7 if len(intv) > 1 else 0.55, "signals": intv}
    return {"kind": "other", "confidence": 0.0, "signals": []}


# --- company matching (conservative) ----------------------------------------------------------
def _norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", str(s or "").lower())).strip()


def match_rows(rows, from_name, from_addr, subject, body):
    """Active applied rows whose company name appears in the email. Requires the normalized
    company (>= 3 chars) to occur as a token-run in the sender/subject/body — generic ATS senders
    (greenhouse, ashby, lever, workday) rarely carry the company, so body text matters most."""
    hay = " " + _norm(" ".join([from_name or "", from_addr or "", subject or "", (body or "")[:4000]])) + " "
    out = []
    for r in rows:
        if r.get("status") not in ACTIVE_APPLIED:
            continue
        comp = _norm(r.get("company"))
        if len(comp) < 3:
            continue
        if (" " + comp + " ") in hay:
            out.append(r)
    return out


def req_key(r):
    return (str(r.get("company", "")) + "|" + str(r.get("role", ""))).lower().strip()


# --- board writes (via the audited server PATCH path) -----------------------------------------
def crm_base():
    return (os.environ.get("CRM_BASE") or ("http://localhost:" + str(PORT))).rstrip("/")


def patch_status(row, status, note):
    body = json.dumps({"fields": {"status": status, "lastcontact": TODAY},
                       "note": note}).encode("utf-8")
    req = urllib.request.Request(crm_base() + "/api/reqs/" + urllib.parse.quote(req_key(row)),
                                 data=body, method="PATCH",
                                 headers={"Content-Type": "application/json"})
    tok = os.environ.get("APP_TOKEN", "")
    if tok:
        req.add_header("X-CRM-Token", tok)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def notify(text):
    hook = os.environ.get("DIGEST_SLACK_WEBHOOK", "").strip()
    if not hook:
        return False
    data = json.dumps({"text": text}).encode("utf-8")
    req = urllib.request.Request(hook, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=15)
        return True
    except Exception:
        return False


# --- AI fallback (optional) -------------------------------------------------------------------
def classify_ai(subject, body):
    """Classify an ambiguous email with OpenAI. Returns the same shape as classify_email or None
    on any error / no key. Sends a trimmed snippet — only used when --ai is passed."""
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        return None
    prompt = ("Classify this job-application email as exactly one of: rejected, interview, offer, other. "
              "Reply with only that word.\n\nSubject: %s\n\n%s" % (subject or "", (body or "")[:1500]))
    payload = json.dumps({
        "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0, "max_tokens": 3,
    }).encode("utf-8")
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=payload,
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            j = json.loads(resp.read().decode("utf-8"))
        word = j["choices"][0]["message"]["content"].strip().lower()
        word = re.sub(r"[^a-z]", "", word)
        if word in ("rejected", "interview", "offer", "other"):
            return {"kind": word, "confidence": 0.6, "signals": ["ai"]}
    except Exception:
        return None
    return None


# --- IMAP -------------------------------------------------------------------------------------
def _hdr(raw):
    try:
        return str(make_header(decode_header(raw or "")))
    except Exception:
        return raw or ""


def _body_text(msg):
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and "attachment" not in str(part.get("Content-Disposition", "")):
                try:
                    return part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
                except Exception:
                    continue
        # fall back to stripped HTML
        for part in msg.walk():
            if part.get_content_type() == "text/html":
                try:
                    html = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
                    return re.sub(r"<[^>]+>", " ", html)
                except Exception:
                    continue
        return ""
    try:
        raw = msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", "replace")
    except Exception:
        return ""
    return re.sub(r"<[^>]+>", " ", raw) if msg.get_content_type() == "text/html" else raw


def fetch_messages(user, pw, label, since_days):
    box = imaplib.IMAP4_SSL("imap.gmail.com")
    box.login(user, pw)
    box.select('"%s"' % label, readonly=True)
    since = (datetime.date.today() - datetime.timedelta(days=since_days)).strftime("%d-%b-%Y")
    typ, data = box.search(None, "(SINCE %s)" % since)
    ids = data[0].split() if data and data[0] else []
    msgs = []
    for mid in ids:
        typ, mdata = box.fetch(mid, "(RFC822)")
        if typ != "OK" or not mdata or not mdata[0]:
            continue
        m = email.message_from_bytes(mdata[0][1])
        msgs.append({
            "id": m.get("Message-ID", "") or ("uid:" + mid.decode()),
            "from_name": _hdr(m.get("From", "")),
            "from_addr": (email.utils.parseaddr(m.get("From", ""))[1] or ""),
            "subject": _hdr(m.get("Subject", "")),
            "body": _body_text(m),
        })
    try:
        box.logout()
    except Exception:
        pass
    return msgs


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def main():
    ap = argparse.ArgumentParser(description="Reflect Gmail application responses onto the board.")
    ap.add_argument("--apply", action="store_true", help="act (auto-set rejections, notify); default is dry-run")
    ap.add_argument("--ai", action="store_true", help="use OpenAI to classify keyword-ambiguous emails")
    ap.add_argument("--label", default=os.environ.get("GMAIL_LABEL", "INBOX"))
    ap.add_argument("--since-days", type=int, default=int(os.environ.get("MAIL_SINCE_DAYS", "14")))
    args = ap.parse_args()

    user = os.environ.get("GMAIL_USER", "").strip()
    pw = os.environ.get("GMAIL_APP_PASSWORD", "").strip()
    if not user or not pw:
        raise SystemExit("Set GMAIL_USER and GMAIL_APP_PASSWORD in .env (see this file's header).")

    rows = load_json(DATA_FILE, [])
    state = load_json(STATE_FILE, {"seen": []})
    seen = set(state.get("seen", []))

    try:
        msgs = fetch_messages(user, pw, args.label, args.since_days)
    except imaplib.IMAP4.error as e:
        raise SystemExit("Gmail login/IMAP failed: %s (check the App Password + that IMAP is on)." % e)

    rejected, positives, ambiguous, acted = [], [], [], 0
    for m in msgs:
        if m["id"] in seen:
            continue
        cls = classify_email(m["subject"], m["body"])
        if cls["kind"] == "other" and args.ai:
            cls = classify_ai(m["subject"], m["body"]) or cls
        if cls["kind"] == "other":
            continue
        matches = match_rows(rows, m["from_name"], m["from_addr"], m["subject"], m["body"])
        label = "%s — %s" % (m["from_name"] or m["from_addr"], (m["subject"] or "")[:70])

        if cls["kind"] == "rejected" and len(matches) == 1:
            r = matches[0]
            rejected.append((r, label))
            if args.apply:
                try:
                    patch_status(r, "Rejected", "auto: rejection email %s (%s)" % (TODAY, ", ".join(cls["signals"][:2])))
                    acted += 1
                except Exception as e:
                    print("  ! could not update %s: %s" % (req_key(r), e))
        elif cls["kind"] in ("interview", "offer") and matches:
            positives.append((cls["kind"], matches, label))
        else:
            ambiguous.append((cls["kind"], len(matches), label))
        seen.add(m["id"])

    # report
    print("Scanned %d messages (last %d days, label %s).\n" % (len(msgs), args.since_days, args.label))
    print("REJECTIONS (auto-set %s):" % ("applied" if args.apply else "dry-run"))
    for r, label in rejected:
        print("  – %s — %s" % (r.get("company"), label))
    print("\nPOSITIVES (review — never auto-advanced):")
    pos_lines = []
    for kind, matches, label in positives:
        for r in matches:
            line = "  ★ %s @ %s — %s" % (kind.upper(), r.get("company"), label)
            print(line)
            pos_lines.append("%s — %s (%s)" % (kind.upper(), r.get("company"), r.get("role")))
    if ambiguous:
        print("\nAMBIGUOUS (no clean single match — left for you):")
        for kind, n, label in ambiguous:
            print("  ? %s [%d matches] — %s" % (kind, n, label))

    if args.apply:
        if pos_lines and notify("Reqon — application responses needing review:\n• " + "\n• ".join(pos_lines)):
            print("\nNotified via Slack webhook.")
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump({"seen": sorted(seen)[-2000:]}, f, indent=2)
        if rejected or positives:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write("\n### %s — mail-ingest: %d rejection(s) set, %d positive(s) flagged\n"
                        % (TODAY, acted, len(positives)))
    else:
        print("\n[dry-run] nothing written. Re-run with --apply once this looks right.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
