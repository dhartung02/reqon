#!/usr/bin/env python3
"""
scout_email.py — ingest job-RECOMMENDATION / job-ALERT emails (LinkedIn, Indeed,
Glassdoor, ZipRecruiter, Dice, BuiltIn, …) from a live Gmail inbox and add the new
roles to the board as leads — append-only, scored, deduped, and resolved to the real
employer req when possible.

HOW IT'S DIFFERENT FROM mail_ingest.py
  mail_ingest.py tracks *responses* to jobs you already applied to (rejection /
  interview / offer) and updates EXISTING rows. This script does the opposite end:
  it reads the *alert* emails the job sites send you and turns the recommended jobs
  into NEW leads. Same live Gmail connection, opposite direction.

PIPELINE (per matching email)
  1. Detect the source (LinkedIn / Indeed / Glassdoor / …) from the sender.
  2. Parse the job cards out of the HTML (title, company, location, salary, link).
  3. Score fit / interview-probability / tier with the SAME engine as scout.py
     (title-only — there's no JD in an alert email; the note says so).
  4. RESOLVE the lead to the employer's real ATS req via req_resolver.py (Tier 1
     boards.json match, Tier 2 slug-probe + auto-learn the board). A resolved lead
     gets the canonical apply URL + real location/salary and is marked `verified`.
  5. Merge append-only by (company + role) — never touches your tracking edits.

ToS-SAFE: reads your own mailbox over IMAP with a Gmail App Password (same pattern as
mail_ingest.py / scout_linkedin.py). No site scraping; req resolution uses the public
board APIs only.

USAGE
    python3 agent/scout_email.py                  # DRY RUN — parse + report, write nothing
    python3 agent/scout_email.py --apply          # add new leads to the board
    python3 agent/scout_email.py --no-resolve     # skip career-site resolution (faster)
    python3 agent/scout_email.py --sources linkedin,indeed
    python3 agent/scout_email.py --since-days 7 --label "Job Alerts" --min-fit 6.5

Env (shared with mail_ingest.py): GMAIL_USER, GMAIL_APP_PASSWORD, GMAIL_LABEL,
MAIL_SINCE_DAYS, APP_TOKEN, PORT. Stdlib only.
"""

import argparse
import datetime
import email
import email.utils
import glob
import html as htmllib
import imaplib
import json
import os
import re
import sys
from email.header import decode_header, make_header

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scout          # noqa: E402  scoring + dedupe + merge engine
import req_resolver   # noqa: E402  career-site resolution

STATE_FILE = os.environ.get("REQON_EMAIL_SCOUT_STATE") or os.path.join(HERE, "email-scout-state.json")
WATCHLIST_FILE = os.environ.get("REQON_WATCHLIST_FILE") or os.path.join(HERE, "watchlist.json")
TODAY = datetime.date.today().isoformat()


# ---------------------------------------------------------------------------
# Source detection + link patterns
# ---------------------------------------------------------------------------
# Each source: domains that identify the sender, and the URL shape of a job-detail
# link inside the email. `company_pos` tells the card extractor where the company
# name sits relative to the title anchor ('after' = "Company · Location" follows the
# title; 'before' = company precedes the title, e.g. Glassdoor cards).
SOURCES = {
    "linkedin": {
        "domains": ["linkedin.com"],
        "link": re.compile(r"linkedin\.com/[^\"'\s]*jobs/view/\d+", re.I),
        "company_pos": "after",
    },
    "indeed": {
        "domains": ["indeed.com", "indeedemail.com"],
        "link": re.compile(r"indeed\.com/[^\"'\s]*(?:viewjob|rc/clk|pagead/clk|job/|jk=)", re.I),
        "company_pos": "after",
    },
    "glassdoor": {
        "domains": ["glassdoor.com"],
        "link": re.compile(r"glassdoor\.[^\"'\s]*/(?:job-listing|partner/jobListing|Job/)[^\"'\s]*", re.I),
        "company_pos": "before",
    },
    "ziprecruiter": {
        "domains": ["ziprecruiter.com"],
        "link": re.compile(r"ziprecruiter\.com/[^\"'\s]*(?:jobs?/|/k/|ojob/)", re.I),
        "company_pos": "after",
    },
    "dice": {
        "domains": ["dice.com"],
        "link": re.compile(r"dice\.com/[^\"'\s]*job[^\"'\s]*detail", re.I),
        "company_pos": "after",
    },
    "builtin": {
        "domains": ["builtin.com"],
        "link": re.compile(r"builtin\.com/[^\"'\s]*/job/[^\"'\s]*", re.I),
        "company_pos": "after",
    },
    "wellfound": {
        "domains": ["wellfound.com", "angel.co"],
        "link": re.compile(r"(?:wellfound\.com|angel\.co)/[^\"'\s]*jobs?/[^\"'\s]*", re.I),
        "company_pos": "after",
    },
}

# Hard cap on messages fetched per run — a busy inbox over a wide look-back would otherwise download
# thousands of full bodies and blow past the server's run timeout. Newest are kept.
MAX_FETCH = 600

# Anchor text that is navigation / CTA, never a job title.
CTA_TEXT = {
    "view job", "view jobs", "apply", "apply now", "easy apply", "see all jobs",
    "see more jobs", "view all jobs", "learn more", "unsubscribe", "manage alerts",
    "see all", "view more", "search for more jobs", "jobs for you", "view details",
    "see this job", "view all", "settings", "help", "privacy policy",
}

ANCHOR = re.compile(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.I | re.S)
SALARY_RE = re.compile(
    r"\$\s?\d[\d,]*(?:\.\d+)?\s*[kKmM]?"
    r"(?:\s*[–\-]\s*|\s*(?:to|–)\s*)?(?:\$?\s?\d[\d,]*(?:\.\d+)?\s*[kKmM]?)?"
    r"(?:\s*(?:a year|/yr|per year|annually|per hour|/hr|an hour))?", re.I)
LOC_RE = re.compile(
    r"(Remote(?:\s*[,\-]?\s*(?:United States|US|USA))?"
    r"|[A-Z][A-Za-z.\-]+(?:\s+[A-Z][A-Za-z.\-]+)*,\s*[A-Z]{2}\b"
    r"|United States)")


def clean(s):
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def detect_source(from_addr, subject):
    """Identify the aggregator from the sender address. Returns a source key or None."""
    a = (from_addr or "").lower()
    for name, cfg in SOURCES.items():
        if any(d in a for d in cfg["domains"]):
            return name
    return None


def detect_source_from_html(html):
    """Fallback: infer the source from job-link patterns in the body (used for saved
    --dir files with no From header, and as a safety net for forwarded mail)."""
    for name, cfg in SOURCES.items():
        if cfg.get("link") and cfg["link"].search(html or ""):
            return name
    return None


# ---------------------------------------------------------------------------
# Card extraction
# ---------------------------------------------------------------------------
def _company_after(after):
    """'Company · Location …' / 'Company - Location' → company (text before the first
    separator or location marker). Used by LinkedIn/Indeed-style cards."""
    seg = re.split(r"\s*[·•|]\s*|\s+[-–]\s+", after, maxsplit=1)[0]
    seg = LOC_RE.split(seg)[0]
    seg = SALARY_RE.split(seg)[0]
    seg = seg.strip(" -–·•|,")
    return seg if 2 <= len(seg) <= 60 and re.search(r"[A-Za-z]", seg) else ""


def _company_before(before):
    """Glassdoor-style cards put the company (with a star rating) just before the title.
    Take the trailing chunk and strip a rating like '4.0 ★'."""
    seg = re.split(r"\s*[·•|]\s*", before)[-1]
    seg = re.sub(r"\s*\d(?:\.\d)?\s*(?:★|stars?)?\s*$", "", seg)   # drop trailing rating
    seg = re.sub(r"^.*?(?:hiring|recommended for you|new job|job for you)\s*:?\s*", "", seg, flags=re.I)
    seg = seg.strip(" -–·•|,")
    # keep only the last 1–4 words (company names are short; avoid swallowing a sentence)
    words = seg.split()
    if len(words) > 4:
        seg = " ".join(words[-4:])
    return seg if 2 <= len(seg) <= 60 and re.search(r"[A-Za-z]", seg) else ""


def parse_cards(source, html):
    """Extract job cards from one alert email. Returns [{title, company, location,
    salary, url}]. Heuristic and tolerant — alert HTML changes often, so a missed
    field degrades gracefully (resolver / is_pm filter clean up the rest)."""
    cfg = SOURCES.get(source, {})
    link_re = cfg.get("link")
    pos = cfg.get("company_pos", "after")
    cards, seen = [], set()
    for m in ANCHOR.finditer(html):
        href = htmllib.unescape(m.group(1)).strip()
        if link_re and not link_re.search(href):
            continue
        if not link_re:  # generic fallback: skip obvious non-job hosts
            if any(h in href.lower() for h in ("unsubscribe", "mailto:", "/settings", "/help")):
                continue
        title = clean(m.group(2))
        if not title or len(title) < 4 or title.lower() in CTA_TEXT:
            continue
        url = href
        # de-dupe by URL (LinkedIn repeats the same job as image + text links)
        ukey = url.split("?")[0] if source == "linkedin" else url
        if ukey in seen:
            continue
        seen.add(ukey)
        after = clean(html[m.end():m.end() + 450])
        before = clean(html[max(0, m.start() - 350):m.start()])
        sal = SALARY_RE.search(after) or SALARY_RE.search(before)
        loc = LOC_RE.search(after) or LOC_RE.search(before)
        loc_str = loc.group(0) if loc else ""
        # A nearby "Remote"/"Hybrid" word is the work-mode signal even when LOC_RE matched a
        # narrower token (e.g. "United States" out of "United States (Remote)"). Fold it in so
        # remote_mode() classifies correctly and a real remote role isn't dropped as onsite.
        rword = re.search(r"\b(remote|hybrid)\b", after + " " + before, re.I)
        if rword and "remote" not in loc_str.lower() and "hybrid" not in loc_str.lower():
            mode = rword.group(1).title()
            loc_str = ("%s (%s)" % (loc_str, mode)) if loc_str else mode
        company = _company_before(before) if pos == "before" else _company_after(after)
        if not company and pos == "before":
            company = _company_after(after)        # fall back to the other side
        cards.append({
            "title": title,
            "company": company,
            "location": loc_str,
            "salary": sal.group(0).strip() if sal else "",
            "url": url,
        })
    return cards


# ---------------------------------------------------------------------------
# IMAP (HTML-preserving — parsers need the anchors, so don't strip like mail_ingest)
# ---------------------------------------------------------------------------
def _hdr(raw):
    try:
        return str(make_header(decode_header(raw or "")))
    except Exception:
        return raw or ""


def _html_body(msg):
    """Return the richest body we can parse: text/html if present (anchors intact),
    else text/plain."""
    html_body, text_body = "", ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if "attachment" in str(part.get("Content-Disposition", "")):
                continue
            try:
                payload = part.get_payload(decode=True)
                if payload is None:
                    continue
                content = payload.decode(part.get_content_charset() or "utf-8", "replace")
            except Exception:
                continue
            if ctype == "text/html" and not html_body:
                html_body = content
            elif ctype == "text/plain" and not text_body:
                text_body = content
        return html_body or text_body
    try:
        return msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", "replace")
    except Exception:
        return ""


def fetch_messages(user, pw, label, since_days, only=None):
    # 30s timeout so a blocked/stalled connection fails fast with a clear error instead of hanging
    # until the server's hard kill (which surfaces as an opaque "exit null").
    box = imaplib.IMAP4_SSL("imap.gmail.com", timeout=30)
    box.login(user, pw)
    box.select('"%s"' % label, readonly=True)
    # Only fetch alert emails from KNOWN job sites. Downloading the full body of every message in the
    # look-back window doesn't scale — a busy inbox would exceed the run timeout (seen as "exit null").
    # Filter server-side by sender domain via Gmail's search; fall back to a (capped) SINCE scan only
    # if that search errors. A legitimately empty result is respected (no fallback to "all mail").
    domains = sorted({d for name, c in SOURCES.items()
                      if not only or name in only for d in c.get("domains", [])})
    ids, filtered = [], False
    if domains:
        try:
            q = "from:(%s) newer_than:%dd" % (" OR ".join(domains), max(1, since_days))
            typ, data = box.search(None, "X-GM-RAW", '"%s"' % q)
            if typ == "OK":
                ids = data[0].split() if data and data[0] else []
                filtered = True
        except Exception:
            filtered = False
    if not filtered:
        since = (datetime.date.today() - datetime.timedelta(days=since_days)).strftime("%d-%b-%Y")
        typ, data = box.search(None, "(SINCE %s)" % since)
        ids = data[0].split() if data and data[0] else []
    if len(ids) > MAX_FETCH:        # IMAP returns ids oldest→newest; keep the newest MAX_FETCH
        ids = ids[-MAX_FETCH:]
    msgs = []
    for mid in ids:
        typ, mdata = box.fetch(mid, "(RFC822)")
        if typ != "OK" or not mdata or not mdata[0]:
            continue
        m = email.message_from_bytes(mdata[0][1])
        msgs.append({
            "id": m.get("Message-ID", "") or ("uid:" + mid.decode()),
            "from_addr": (email.utils.parseaddr(m.get("From", ""))[1] or ""),
            "from_name": _hdr(m.get("From", "")),
            "subject": _hdr(m.get("Subject", "")),
            "html": _html_body(m),
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


# ---------------------------------------------------------------------------
# Lead building (score → resolve → row), shared by the live + offline paths
# ---------------------------------------------------------------------------
def build_leads(messages, args, watch, boards):
    """Turn parsed emails into scored, resolved, deduped candidate rows. Pure-ish:
    network only via the resolver (skipped with --no-resolve). Returns
    (candidates, stats)."""
    min_fit = args.min_fit if args.min_fit is not None else watch.get("searchTerms", {}).get("minFitToAdd", 6.0)
    desired_min = int(watch.get("searchTerms", {}).get("minSalary", 0) or 0)
    desired_target = int(watch.get("searchTerms", {}).get("salaryTarget", 0) or 0)
    only = set(s.strip() for s in args.sources.split(",")) if args.sources else None

    existing = scout.load_existing_keys()
    cache = {}                       # share board fetches across leads within this run
    cands, seen = [], set()
    stats = {"emails": 0, "skipped_source": 0, "cards": 0, "no_company": 0,
             "not_pm": 0, "below_fit": 0, "resolved": 0, "by_source": {}}

    for msg in messages:
        source = (msg.get("source") or detect_source(msg.get("from_addr"), msg.get("subject"))
                  or detect_source_from_html(msg.get("html", "")))
        if not source or (only and source not in only):
            stats["skipped_source"] += 1
            continue
        stats["emails"] += 1
        for card in parse_cards(source, msg.get("html", "")):
            stats["cards"] += 1
            title = card["title"]
            if not scout.is_pm_role(title):
                stats["not_pm"] += 1
                continue
            if scout.employment_blocked(title, scout.EMPLOYMENT_SKIP_DEFAULT):
                continue
            company = card["company"]
            if not company:
                stats["no_company"] += 1
                continue
            loc = card["location"] or ""
            rmode = scout.remote_mode(loc)
            # Location is often missing in alert emails → only drop EXPLICIT onsite.
            if (not args.include_onsite) and rmode == "onsite" and loc and "remote" not in loc.lower():
                continue
            if loc and not scout.us_eligible(loc):
                continue

            salary, link, conf = card["salary"], card["url"], "unverified"
            resolved = None
            if not args.no_resolve:
                try:
                    resolved = req_resolver.resolve(company, title, boards=boards, cache=cache,
                                                    write_boards=args.apply)
                except Exception:
                    resolved = None
            if resolved:
                stats["resolved"] += 1
                if resolved.get("url"):
                    link = resolved["url"]
                    conf = "verified"
                    salary = resolved.get("salary") or salary
                    loc = resolved.get("location") or loc
                    rmode = scout.remote_mode(loc)
                else:
                    conf = "boardonly"      # board discovered, exact req not matched

            fit = scout.score_fit(title, "")
            adj = scout.salary_adj(salary, desired_min, desired_target)
            if adj:
                fit = round(max(0.0, min(9.0, fit + adj)), 1)
            if fit < min_fit:
                stats["below_fit"] += 1
                continue
            key = scout.norm_key(company, title)
            if key in existing or key in seen:
                continue
            seen.add(key)
            prob = scout.score_prob(fit, title, rmode, False)
            tier = scout.tier_for(fit, prob)
            note = "%s alert %s. Title-only score — verify role/remote on the listing." % (source.title(), TODAY)
            if resolved and resolved.get("url"):
                note = ("%s alert %s → resolved to live %s req (match %.0f%%). %s"
                        % (source.title(), TODAY, resolved["ats"], 100 * resolved.get("score", 0),
                           "Verified on the employer board." if resolved.get("score", 0) >= 0.75
                           else "Verify the title match."))
            elif resolved:
                note += " Found %s board for %s — added to scout targets." % (resolved["ats"], company)
            cands.append({
                "company": company, "role": title,
                "sector": scout.sector_for(title, ""), "salary": salary,
                "location": loc or "Remote", "remote": rmode,
                "fit": fit, "prob": prob, "tier": scout.tier_for(fit, prob),
                "conf": conf, "link": link, "source": source + "-email",
                "notes": note,
                "_resolved": bool(resolved and resolved.get("url")),
            })
            stats["by_source"][source] = stats["by_source"].get(source, 0) + 1

    cands.sort(key=lambda r: r["fit"] * r["prob"], reverse=True)
    return cands, stats


def main():
    ap = argparse.ArgumentParser(description="Ingest job-recommendation emails into the CRM as new leads.")
    ap.add_argument("--apply", action="store_true", help="add new leads to the board; default is dry-run")
    ap.add_argument("--no-resolve", action="store_true", help="skip career-site req resolution")
    ap.add_argument("--sources", default=None, help="comma list to limit (linkedin,indeed,glassdoor,…)")
    ap.add_argument("--label", default=os.environ.get("GMAIL_LABEL", "INBOX"))
    ap.add_argument("--since-days", type=int, default=int(os.environ.get("MAIL_SINCE_DAYS", "14")))
    ap.add_argument("--min-fit", type=float, default=None)
    ap.add_argument("--include-onsite", action="store_true")
    ap.add_argument("--dir", default=None, help="offline: a folder of saved .eml/.html alert emails (no Gmail)")
    args = ap.parse_args()

    watch = load_json(WATCHLIST_FILE, {})
    boards = req_resolver.load_boards()
    state = load_json(STATE_FILE, {"seen": []})
    seen_ids = set(state.get("seen", []))

    # Gather messages: offline folder (--dir) or live Gmail.
    messages = []
    if args.dir:
        for ext in ("*.eml", "*.html", "*.htm", "*.txt"):
            for path in glob.glob(os.path.join(os.path.expanduser(args.dir), ext)):
                try:
                    if path.lower().endswith(".eml"):
                        with open(path, "rb") as f:
                            m = email.message_from_binary_file(f)
                        messages.append({"id": "file:" + os.path.basename(path),
                                         "from_addr": (email.utils.parseaddr(m.get("From", ""))[1] or ""),
                                         "from_name": _hdr(m.get("From", "")),
                                         "subject": _hdr(m.get("Subject", "")), "html": _html_body(m)})
                    else:
                        with open(path, encoding="utf-8", errors="replace") as f:
                            messages.append({"id": "file:" + os.path.basename(path), "from_addr": "",
                                             "from_name": "", "subject": "", "html": f.read()})
                except Exception as e:
                    print("  ! could not read", os.path.basename(path), "-", e)
    else:
        user = os.environ.get("GMAIL_USER", "").strip()
        # Strip ALL whitespace — Google displays app passwords grouped ("abcd efgh ijkl mnop") but the
        # spaces are visual only; a pasted value with spaces would otherwise fail to authenticate.
        pw = re.sub(r"\s+", "", os.environ.get("GMAIL_APP_PASSWORD", ""))
        if not user or not pw:
            raise SystemExit("Set GMAIL_USER and GMAIL_APP_PASSWORD in .env (or use --dir for offline files).")
        only = set(s.strip() for s in args.sources.split(",")) if args.sources else None
        try:
            messages = fetch_messages(user, pw, args.label, args.since_days, only)
        except imaplib.IMAP4.error as e:
            raise SystemExit("Gmail login/IMAP failed: %s (check the App Password is correct and has no typos)." % e)
        except (OSError, TimeoutError) as e:
            raise SystemExit("Couldn't reach Gmail IMAP (imap.gmail.com:993): %s — network/connectivity issue." % e)

    # Skip already-processed emails (live only; --dir always reprocesses).
    fresh = [m for m in messages if args.dir or m["id"] not in seen_ids]

    cands, stats = build_leads(fresh, args, watch, boards)

    # Report
    print("Scanned %d email(s); %d from known job sites; parsed %d card(s); %d new PM lead(s) ≥ fit %.1f."
          % (len(messages), stats["emails"], stats["cards"], len(cands),
             args.min_fit if args.min_fit is not None else watch.get("searchTerms", {}).get("minFitToAdd", 6.0)))
    print("   (skipped: %d non-PM, %d no-company, %d below-fit; resolved %d to live reqs.)"
          % (stats["not_pm"], stats["no_company"], stats["below_fit"], stats["resolved"]))
    for r in cands:
        flag = "✓ live req" if r.pop("_resolved", False) else r["conf"]
        print("  + [%s] %s — %s (fit %.1f / prob %.1f) [%s] %s"
              % (r["tier"], r["company"], r["role"], r["fit"], r["prob"], flag, r["source"]))

    if not cands or not args.apply:
        if not args.apply:
            print("\n[dry-run] nothing written. Re-run with --apply once this looks right.")
        _emit_summary(args, cands, stats, added=0)
        return 0

    if scout.FILE_MODE:
        res = scout.file_merge(cands)
    else:
        try:
            res = scout.http_merge(cands)
        except Exception:
            res = scout.file_merge(cands)
    added = res.get("added", 0)
    print("\nMerge: added %d, skipped %d, total %d (via %s)."
          % (added, res.get("skipped", 0), res.get("total", "?"), res.get("via", "?")))
    scout.append_log(added, cands)

    # Persist processed message ids so re-runs don't re-surface the same emails.
    if not args.dir:
        for m in fresh:
            seen_ids.add(m["id"])
        try:
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump({"seen": sorted(seen_ids)[-4000:]}, f, indent=2)
        except Exception:
            pass

    _emit_summary(args, cands, stats, added=added)
    return 0


def _emit_summary(args, cands, stats, added):
    """One-line machine-readable summary the server parses for notifications."""
    summary = {
        "applied": bool(args.apply),
        "counts": {"emails": stats["emails"], "cards": stats["cards"],
                   "leads": len(cands), "resolved": stats["resolved"], "added": added},
        "bySource": stats["by_source"],
        "events": [{"kind": "lead", "company": r["company"], "role": r["role"],
                    "source": r["source"], "conf": r["conf"]} for r in cands[:50]],
    }
    print("SUMMARY_JSON " + json.dumps(summary))


if __name__ == "__main__":
    sys.exit(main())
