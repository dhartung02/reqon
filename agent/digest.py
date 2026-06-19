#!/usr/bin/env python3
"""
digest.py - SMTP deliverer for the morning digest (Phase 7).

The Express server composes the digest and (for the "email" channel) hands it to this
script as a JSON payload file: {subject, text, html}. We send it via SMTP using stdlib
smtplib + email - no third-party dependency. Credentials come from the environment
(set in the Settings UI -> .env), so nothing is hardcoded:

  SMTP_HOST   required (e.g. smtp.gmail.com)
  SMTP_PORT   default 587 (STARTTLS) ; 465 -> implicit SSL
  SMTP_USER   required (login + default From)
  SMTP_PASS   required (app password)
  DIGEST_TO   required recipient (comma-separated allowed)
  DIGEST_FROM optional From override (defaults to SMTP_USER)

Usage (invoked by the server): python3 agent/digest.py --send-file /path/to/payload.json
Manual self-test:               python3 agent/digest.py --self-test   (composes nothing; checks config)
"""

import argparse
import json
import os
import smtplib
import ssl
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def _require(name):
    v = os.environ.get(name, "").strip()
    if not v:
        raise SystemExit("missing %s (set it in Settings -> .env)" % name)
    return v


def send(payload):
    host = _require("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", "587") or "587")
    user = _require("SMTP_USER")
    pwd = _require("SMTP_PASS")
    to = _require("DIGEST_TO")
    sender = os.environ.get("DIGEST_FROM", "").strip() or user
    recipients = [a.strip() for a in to.split(",") if a.strip()]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = payload.get("subject", "Job Pipeline CRM digest")
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(payload.get("text", ""), "plain", "utf-8"))
    if payload.get("html"):
        msg.attach(MIMEText(payload["html"], "html", "utf-8"))

    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=30) as s:
                s.login(user, pwd)
                s.sendmail(sender, recipients, msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=30) as s:
                s.ehlo()
                s.starttls(context=ssl.create_default_context())
                s.login(user, pwd)
                s.sendmail(sender, recipients, msg.as_string())
    except smtplib.SMTPAuthenticationError as e:
        raise SystemExit(_auth_hint(host, e))
    except (smtplib.SMTPException, OSError) as e:
        raise SystemExit("SMTP error talking to %s:%d — %s" % (host, port, e))
    return len(recipients)


def _auth_hint(host, e):
    """Turn an opaque SMTPAuthenticationError into one actionable line."""
    raw = ""
    try:
        raw = (e.smtp_error or b"").decode("utf-8", "replace") if isinstance(e.smtp_error, bytes) else str(e.smtp_error)
    except Exception:
        raw = str(e)
    h = (host or "").lower()
    if "gmail" in h or "google" in h or "application-specific password" in raw.lower() or "5.7.9" in raw:
        return ("SMTP login was rejected by Gmail. Gmail with 2-Step Verification requires a "
                "16-character App Password — not your Google account password. Create one at "
                "Google Account → Security → 2-Step Verification → App passwords, then paste it as "
                "the SMTP password. (Server said: %s)" % raw.strip())
    return ("SMTP login was rejected by %s. Check SMTP user/password (many providers require an "
            "app-specific password, not your normal login). (Server said: %s)" % (host, raw.strip()))


def main():
    ap = argparse.ArgumentParser(description="SMTP deliverer for the morning digest.")
    ap.add_argument("--send-file", help="path to a JSON payload {subject,text,html}")
    ap.add_argument("--self-test", action="store_true", help="validate SMTP config (no send)")
    args = ap.parse_args()

    if args.self_test:
        for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASS", "DIGEST_TO"):
            print("%s: %s" % (k, "set" if os.environ.get(k) else "MISSING"))
        return 0
    if not args.send_file:
        raise SystemExit("nothing to do: pass --send-file or --self-test")
    with open(args.send_file, encoding="utf-8") as f:
        payload = json.load(f)
    n = send(payload)
    print("sent digest to %d recipient(s)" % n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
