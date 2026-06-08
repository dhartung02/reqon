#!/usr/bin/env python3
"""
scout_linkedin.py - ingest LinkedIn "recommended / job alert" emails into the CRM.

WHY EMAILS (read this): LinkedIn has NO public jobs API, and scraping the site
programmatically violates LinkedIn's Terms of Service and trips their anti-bot
systems. The clean, ToS-safe, fully-automatable path is the job-alert emails
LinkedIn already sends you (you have alerts switched on). This script reads those
emails, extracts the job cards, scores them with the SAME engine as scout.py, and
merges new ones into the CRM - append-only, deduped.

Two ways to feed it emails:
  A) OFFLINE (works today, no setup): in Outlook/Gmail, save LinkedIn job-alert
     messages as .eml or .html into a folder, then point this script at it:
         python3 agent/scout_linkedin.py --dir ~/Downloads/li-alerts
  B) CONNECTOR (optional, later): wire your Microsoft 365 / Outlook connector to
     dump LinkedIn alert emails to that folder on a schedule, then run this. The
     parsing below is the reusable part.

Usage:
    python3 agent/scout_linkedin.py --dir <folder> [--dry-run] [--min-fit 6.0]

Stdlib only. Reuses scoring + merge from scout.py (must sit beside it).
"""

import argparse
import glob
import os
import re
import sys
import html
import email
from email import policy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scout  # noqa: E402  (reuse scoring + merge engine)


def html_from_file(path):
    """Return the HTML/text body of a .eml or .html/.txt file."""
    if path.lower().endswith(".eml"):
        with open(path, "rb") as f:
            msg = email.message_from_binary_file(f, policy=policy.default)
        body = msg.get_body(preferencelist=("html", "plain"))
        return body.get_content() if body else ""
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


# LinkedIn job links look like .../jobs/view/<id> or /comm/jobs/view/<id>
JOB_LINK = re.compile(r'https?://[^"\'\s]*linkedin\.com/[^"\'\s]*jobs/view/\d+[^"\'\s]*', re.I)
ANCHOR = re.compile(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.I | re.S)


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def parse_alert(html_text):
    """Best-effort extraction of (title, company, location, url) from a LinkedIn
    alert email. LinkedIn markup changes often, so this is heuristic: it keys off
    anchor tags pointing at /jobs/view/ and reads the visible anchor text, then
    looks at nearby text for company/location."""
    found = []
    seen = set()
    for m in ANCHOR.finditer(html_text):
        href, inner = m.group(1), clean(m.group(2))
        if "jobs/view/" not in href.lower():
            continue
        if not inner or len(inner) < 4:
            continue
        url = href.split("?")[0]
        if url in seen:
            continue
        seen.add(url)
        # The anchor text is usually the title; the chunk of text right after the
        # anchor usually holds "Company - Location".
        tail = clean(html_text[m.end():m.end() + 400])
        company, location = "", ""
        mctx = re.match(r"([A-Z][\w&.,'\- ]{1,60}?)\s*[·\-|]\s*([A-Za-z .,'\-]+(?:Remote|United States|[A-Z]{2})[A-Za-z .,'\-]*)", tail)
        if mctx:
            company = mctx.group(1).strip(" -|·")
            location = mctx.group(2).strip(" -|·")
        found.append({"title": inner, "company": company, "location": location, "url": url})
    return found


def main():
    ap = argparse.ArgumentParser(description="Ingest LinkedIn job-alert emails into the CRM.")
    ap.add_argument("--dir", required=True, help="folder of saved LinkedIn alert emails (.eml/.html)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--min-fit", type=float, default=6.0)
    ap.add_argument("--include-onsite", action="store_true")
    args = ap.parse_args()

    files = []
    for ext in ("*.eml", "*.html", "*.htm", "*.txt"):
        files += glob.glob(os.path.join(os.path.expanduser(args.dir), ext))
    if not files:
        print("No .eml/.html files found in", args.dir)
        return 1

    existing = scout.load_existing_keys()
    cands, seen = [], set()
    raw = 0
    for path in files:
        try:
            for job in parse_alert(html_from_file(path)):
                raw += 1
                title = job["title"]
                company = job["company"] or "LinkedIn (company in listing)"
                loc = job["location"] or "Remote"
                if not scout.is_pm_role(title):
                    continue
                rmode = scout.remote_mode(loc)
                if (not args.include_onsite) and rmode == "onsite" and "remote" not in loc.lower():
                    # location often missing in emails; only drop if explicitly onsite
                    pass
                fit = scout.score_fit(title, "")
                if fit < args.min_fit:
                    continue
                key = scout.norm_key(company, title)
                if key in existing or key in seen:
                    continue
                seen.add(key)
                prob = scout.score_prob(fit, title, rmode, False)
                cands.append({
                    "company": company, "role": title,
                    "sector": scout.sector_for(title, ""), "salary": "",
                    "location": loc, "remote": rmode, "fit": fit, "prob": prob,
                    "tier": scout.tier_for(fit, prob), "conf": "boardonly",
                    "link": job["url"],
                    "notes": "LinkedIn alert %s. Title-only score - verify role/remote on the listing." % scout.TODAY,
                })
        except Exception as e:
            print("  ! parse error in", os.path.basename(path), "-", e)

    cands.sort(key=lambda r: r["fit"] * r["prob"], reverse=True)
    print("Parsed %d files, %d job cards, %d new PM matches >= fit %.1f."
          % (len(files), raw, len(cands), args.min_fit))
    for r in cands:
        print("  + [%s] %s - %s (fit %.1f / prob %.1f)" % (r["tier"], r["company"], r["role"], r["fit"], r["prob"]))

    if not cands or args.dry_run:
        if args.dry_run:
            print("[dry-run] nothing written.")
        return 0
    try:
        res = scout.http_merge(cands)
    except Exception:
        res = scout.file_merge(cands)
    print("Merge: added %d, total %d (via %s)." % (res.get("added", 0), res.get("total", "?"), res.get("via", "?")))
    scout.append_log(res.get("added", 0), cands)
    return 0


if __name__ == "__main__":
    sys.exit(main())
