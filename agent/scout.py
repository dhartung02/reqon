#!/usr/bin/env python3
"""
scout.py - self-contained daily job scout for the Job Pipeline CRM.

Replaces the Claude-desktop auto-scout with a deterministic, dependency-free
Python script. It:
  1. Reads agent/boards.json (company -> ATS slug) and agent/watchlist.json
     (title bands, domain keywords, filters).
  2. Polls the PUBLIC board APIs of Greenhouse / Ashby / Lever for each company
     (no auth, always-current -> no stale links).
  3. Filters to senior PM roles that match your domain keywords (+ remote).
  4. Scores each role fit / interview-probability / tier, deterministically,
     following agent/scoring-criteria.md.
  5. Dedupes against data.json by (company + role), APPEND-ONLY (never touches
     existing tracking edits).
  6. Merges: POSTs to the running CRM server (so the live board updates), or
     falls back to an atomic write of data.json.
  7. Appends a dated run summary to agent/found-log.md.

No pip installs needed (Python 3 stdlib only). Designed to run daily via
cron or launchd. See README / the bottom of this file for scheduling.

Usage:
    python3 agent/scout.py                # live run
    python3 agent/scout.py --dry-run      # show what would be added; no writes
    python3 agent/scout.py --min-fit 6.5  # override min fit to add (default from watchlist)
    python3 agent/scout.py --include-onsite   # don't drop onsite roles
    python3 agent/scout.py --quiet        # less console output
"""

import argparse
import datetime
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AGENT = os.path.join(ROOT, "agent")
DATA_FILE = os.path.join(ROOT, "data.json")
BOARDS_FILE = os.path.join(AGENT, "boards.json")
WATCHLIST_FILE = os.path.join(AGENT, "watchlist.json")
LOG_FILE = os.path.join(AGENT, "found-log.md")
SOURCE_HEALTH_FILE = os.path.join(AGENT, "source-health.json")
TODAY = datetime.date.today().isoformat()
PORT = int(os.environ.get("PORT", "8787"))
UA = "job-scout/1.0 (+local CRM)"
TIMEOUT = 20

# ---------------------------------------------------------------------------
# Scoring vocab. Mirrors agent/scoring-criteria.md (priority vs secondary tiers).
# ---------------------------------------------------------------------------
PRIORITY_KW = [
    "customer data platform", "cdp", "data platform", "data product",
    "data pipeline", "pipelines", "etl", "ingest", "snowflake", "data lake",
    "ai platform", "agentic", "llm", "mcp", "generative ai", "genai",
    "machine learning platform", "ml platform", "identity resolution",
    "identity and access", "identity & access", "iam", "sso", "scim",
    "martech", "marketing cloud", "audience", "segmentation",
    "api platform", "integration platform", "developer platform",
    "experimentation platform",
]
SECONDARY_KW = [
    "usage billing", "usage-based", "monetization", "monetisation", "pricing",
    "consumption", "finops", "cost optimization", "billing", "product catalog",
    "catalog", "commerce", "e-commerce", "ecommerce",
]
GENERIC_KW = ["platform", "infrastructure", "enterprise", "data", "integration", "api"]

# Seniority bands (title must contain a PM phrase AND ideally a band word).
PM_PHRASES = ["product manager", "product management", "head of product", "product lead"]
# Titles containing these are NOT product-management IC/leadership roles -> drop.
EXCLUDE_TITLE = ["marketing", "engineer", "designer", "data scientist", "program manager",
                 "solutions", "sales", "recruit", "support", "success", "analyst",
                 "scientist", "researcher", "counsel", "accountant", "evangelist"]
BAND_STRONG = ["principal", "director", "group product", "sr director", "senior director",
               "head of", "vp ", "vice president", "lead product"]
BAND_OK = ["staff", "senior", "sr.", "sr ", "lead"]
BAND_WEAK = ["manager", "associate", "product manager i", "product manager 1"]

# Employment types that aren't full-time IC/leadership PM roles -> skip (configurable via
# boards.json "skipEmploymentTypes"; matched against the TITLE to avoid false drops on
# benign description mentions like "contract negotiation").
EMPLOYMENT_SKIP_DEFAULT = ["contract", "contractor", "c2c", "temporary", "temp",
                           "intern", "internship", "co-op", "coop", "part-time",
                           "part time", "seasonal", "fixed-term", "fixed term",
                           "apprentice", "associate"]
TIER_RANK = {"A": 3, "B": 2, "C": 1}
NEG_KW_PENALTY = 2.0   # fit points subtracted per negative-keyword/blocker hit (demote, not hard-drop)

SECTOR_MAP = [
    (["cdp", "customer data"], "CDP / Customer Data"),
    (["identity", "iam", "sso", "scim", "auth"], "Identity / Data"),
    (["data platform", "data lake", "snowflake", "pipeline", "etl", "data infra",
      "experimentation", "cloud infrastructure", "finops"], "Data Infra"),
    (["ai", "ml", "llm", "agentic", "genai", "machine learning"], "AI Platform"),
    (["martech", "marketing", "audience", "segmentation", "campaign", "engagement",
      "billing", "monetization", "pricing", "offers"], "Martech / Engagement"),
]


def log(msg, quiet=False):
    if not quiet:
        print(msg)


# ---------------------------------------------------------------------------
# Source adapters live in the pluggable `sources/` package. Importing it registers
# every adapter into REGISTRY, keyed by the boards.json "ats" type:
#   greenhouse, ashby, lever, workable, smartrecruiters, recruitee, personio, teamtailor
# Each adapter is fetch(slug) -> [ {title, location, url, desc, salary} ] in the same
# normalized shape this pipeline already scores/dedupes/merges. Add a source by dropping
# a module in sources/ (calling @source("name")) and adding companies to boards.json.
# ---------------------------------------------------------------------------
import sources
ADAPTERS = sources.REGISTRY


# ---------------------------------------------------------------------------
# Filtering + scoring
# ---------------------------------------------------------------------------
def is_pm_role(title):
    t = title.lower()
    if any(x in t for x in EXCLUDE_TITLE):
        return False
    return any(p in t for p in PM_PHRASES)


def remote_mode(location):
    loc = (location or "").lower()
    if any(w in loc for w in ["hybrid", "flex"]):
        return "flex"          # check hybrid first ("Hybrid - SF (Remote)" is flex, not remote)
    if "remote" in loc:
        return "remote"
    return "onsite"


def us_eligible(location):
    loc = (location or "").lower()
    if not loc:
        return True  # unknown -> let it through; scoring handles
    if "remote" in loc and ("us" in loc or "united states" in loc or "u.s" in loc
                            or "americas" in loc or "north america" in loc):
        return True
    # plain "Remote" with no country -> allow; explicit other-country remote -> reject
    foreign = ["united kingdom", "canada", "india", "germany", "ireland", "australia",
               "singapore", "spain", "france", "brazil", "netherlands", "poland",
               "japan", "mexico", "colombia", "philippines", "argentina", "emea", "apac"]
    if "remote" in loc and any(f in loc for f in foreign) and "united states" not in loc:
        return False
    return True


def count_kw(text, kws):
    t = text.lower()
    return sum(1 for k in kws if k in t)


def score_fit(title, desc):
    tt, dd = title.lower(), desc.lower()
    pri_t, pri_d = count_kw(tt, PRIORITY_KW), count_kw(dd, PRIORITY_KW)
    sec_t, sec_d = count_kw(tt, SECONDARY_KW), count_kw(dd, SECONDARY_KW)
    gen_t = count_kw(tt, GENERIC_KW)
    if pri_t >= 1:
        fit = 8.5 + min(0.5, 0.1 * (pri_t - 1))      # priority pillar in the title
    elif sec_t >= 1:
        fit = 7.0
    elif pri_d >= 2:
        fit = 7.5                                     # priority strongly in body
    elif pri_d == 1:
        fit = 6.8
    elif gen_t >= 1 or sec_d >= 1:
        fit = 6.0
    else:
        fit = 5.0
    return round(min(fit, 9.0), 1)


def band_adj(title):
    t = title.lower()
    if any(b in t for b in ["vp ", "vice president", "head of"]):
        return -1.5
    if any(b in t for b in ["principal", "director", "group product", "senior director", "sr director"]):
        return 0.5
    if any(b in t for b in ["staff", "lead product"]):
        return 0.0
    if "senior" in t or "sr." in t or "sr " in t:
        return 0.0
    if "manager" in t:  # plain Manager / Product Manager
        return -0.5
    return 0.0


def score_prob(fit, title, rmode, heritage):
    p = fit - 1.0
    p += band_adj(title)
    p += {"remote": 0.5, "flex": 0.0, "onsite": -2.0}[rmode]
    if heritage:
        p += 1.0
    return round(max(1.0, min(9.0, p)), 1)


def tier_for(fit, prob):
    ev = fit * prob / 10.0
    if ev >= 5.2:
        return "A"
    if ev >= 4.0:
        return "B"
    return "C"


def employment_blocked(title, skip_types):
    """Return the matching skip-type if the title looks like a non-FT/non-IC role, else None."""
    t = (title or "").lower()
    return next((s for s in skip_types if s and s in t), None)


def tier_ok(tier, min_tier):
    return TIER_RANK.get(tier, 0) >= TIER_RANK.get(min_tier, 2)


def sector_for(title, desc):
    blob = (title + " " + desc).lower()
    for kws, sector in SECTOR_MAP:
        if any(k in blob for k in kws):
            return sector
    return "Enterprise SaaS"


def short_note(title, desc, rmode):
    why = []
    blob = (title + " " + desc).lower()
    for k in ["customer data platform", "data platform", "ai platform", "agentic", "mcp",
              "identity", "snowflake", "usage", "monetization", "pricing", "martech",
              "experimentation", "finops", "api"]:
        if k in blob:
            why.append(k)
        if len(why) >= 3:
            break
    tag = ", ".join(why) if why else "platform PM"
    cav = "" if rmode == "remote" else (" CAVEAT: %s - verify before applying (remote-only)." % rmode)
    return "Auto-scout %s. Matches: %s.%s" % (TODAY, tag, cav)


# ---------------------------------------------------------------------------
# CRM dedupe + merge (parity with agent/merge-into-crm.js)
# ---------------------------------------------------------------------------
# Canonicalize a company|role string so abbreviated manual entries
# ("Senior PM, CDP") match scraped official titles ("Senior Product Manager, CDP").
_NORM = [
    (r"\bproduct manager\b", "pm"), (r"\bproduct management\b", "pm"),
    (r"\bsr\.", "sr"), (r"\bsenior\b", "sr"), (r"\bprincipal\b", "prin"),
    (r"\bstaff\b", "staff"), (r"\bdirector\b", "dir"), (r"\bgroup\b", "grp"),
    (r"\band\b", "&"),
]
# Connector/stopwords dropped from the role so "Identity & Access" == "Identity and Access"
# and word-order/filler variants collapse.
_STOP = {"the", "of", "a", "an", "for", "to", "in", "at", "with", "on"}


def norm_key(company, role):
    """Order-independent canonical key. Role tokens are normalized (abbreviations), de-duped,
    and SORTED so 'Senior PM, CDP' / 'CDP Senior Product Manager' / 'Sr. PM - CDP' all collapse
    to the same key, killing the embellished-vs-official near-dupe gotcha."""
    s = (str(company) + "|" + str(role)).lower()
    s = re.sub(r"\(.*?\)", " ", s)          # drop parentheticals e.g. (Contract), (Remote)
    for pat, rep in _NORM:
        s = re.sub(pat, rep, s)
    parts = s.split("|", 1)
    comp = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", parts[0])).strip()
    role_s = parts[1] if len(parts) > 1 else ""
    rtoks = sorted(set(t for t in re.findall(r"[a-z0-9]+", role_s) if t not in _STOP))
    return (comp + "|" + " ".join(rtoks)).strip()


def with_defaults(x):
    base = {
        "status": "Not Applied", "applied": "", "interview": "", "recruiter": "",
        "referral": "No", "resume": "", "cover": "No", "followup": "",
        "lastcontact": "", "next": "Auto-scouted - review & apply", "added": TODAY,
        "reqCheck": "open", "source": "",
    }
    base.update(x)
    return base


def load_existing_keys():
    if not os.path.exists(DATA_FILE):
        return set()
    with open(DATA_FILE, encoding="utf-8") as f:
        store = json.load(f)
    return set(norm_key(r.get("company", ""), r.get("role", "")) for r in store)


def http_merge(rows):
    body = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(
        "http://127.0.0.1:%d/api/reqs/merge" % PORT, data=body, method="POST",
        headers={"Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=3) as r:
        res = json.loads(r.read().decode("utf-8"))
    res["via"] = "http"
    return res


def dedupe_new(rows, store):
    """Entries in `rows` not already in `store`, deduped by norm_key — the near-dupe-aware key —
    both against the store and within the batch. file_merge writes straight to data.json, so this
    is where the embellished-vs-official gotcha must be caught; the scan uses the same key via
    load_existing_keys(), so both paths now agree (previously file_merge used a weaker exact key)."""
    existing = set(norm_key(r.get("company", ""), r.get("role", "")) for r in store)
    out = []
    for x in rows:
        k = norm_key(x.get("company", ""), x.get("role", ""))
        if not k or k == "|" or k in existing:
            continue
        existing.add(k)
        out.append(x)
    return out


def file_merge(rows):
    store = []
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, encoding="utf-8") as f:
            store = json.load(f)
    new = dedupe_new(rows, store)
    for x in new:
        store.append(with_defaults(x))
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)
    os.replace(tmp, DATA_FILE)
    return {"ok": True, "added": len(new), "skipped": len(rows) - len(new),
            "total": len(store), "via": "file"}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Daily job scout for the CRM.")
    ap.add_argument("--dry-run", action="store_true", help="show what would be added; write nothing")
    ap.add_argument("--min-fit", type=float, default=None, help="minimum fit to add")
    ap.add_argument("--include-onsite", action="store_true", help="keep onsite roles")
    ap.add_argument("--min-tier", default=None, choices=["A", "B", "C"], help="lowest tier to merge (override boards.json)")
    ap.add_argument("--sources", default=None, help="comma-separated source names to run (default: all enabled)")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    # personal boards.json/watchlist.json are gitignored; seed from the shipped examples on a
    # fresh clone so the scout works out of the box with zero personal data.
    for real, example in ((BOARDS_FILE, BOARDS_FILE.replace(".json", ".example.json")),
                          (WATCHLIST_FILE, WATCHLIST_FILE.replace(".json", ".example.json"))):
        if not os.path.exists(real) and os.path.exists(example):
            try:
                with open(example, encoding="utf-8") as ef, open(real, "w", encoding="utf-8") as rf:
                    rf.write(ef.read())
            except Exception:
                pass

    with open(BOARDS_FILE, encoding="utf-8") as f:
        boards = json.load(f)
    with open(WATCHLIST_FILE, encoding="utf-8") as f:
        watch = json.load(f)

    min_fit = args.min_fit if args.min_fit is not None else watch.get("searchTerms", {}).get("minFitToAdd", 6.0)
    kw = [k.lower() for k in watch.get("searchTerms", {}).get("keywords", [])]
    remote_only = boards.get("remoteOnly", True) and not args.include_onsite
    delay = float(boards.get("minDelaySeconds", 0.4))   # polite per-company pause between board calls
    disabled = set(boards.get("disabledSources", []))   # settings: sources turned off
    only = set(s.strip() for s in args.sources.split(",")) if args.sources else None  # this-run scope

    # Phase-1 filters (all editable in the Settings UI; config-driven, no hardcoding):
    min_tier = (args.min_tier or str(boards.get("minTierToMerge", "B"))).upper()
    if min_tier not in TIER_RANK:
        min_tier = "B"
    skip_types = [s.lower() for s in boards.get("skipEmploymentTypes", EMPLOYMENT_SKIP_DEFAULT)]
    neg_kw = [k.lower() for k in watch.get("searchTerms", {}).get("negativeKeywords", [])]

    # Optional resume tailoring: agent/profile.json (built by profile-from-resume.py).
    profile_path = os.path.join(AGENT, "profile.json")
    profile_kw, profile_strong = [], set()
    if os.path.exists(profile_path):
        try:
            with open(profile_path, encoding="utf-8") as pf:
                prof = json.load(pf)
            for item in prof.get("keywords", []):
                k = item.get("kw", "").lower()
                if k:
                    profile_kw.append(k)
                    if item.get("weight", 0) >= 3:       # resume-emphasized -> fit bonus
                        profile_strong.add(k)
            kw = list(set(kw) | set(profile_kw))          # search keys off the resume too
            # Optional rubric override (config-driven; the in-code lists stay as defaults so a
            # fresh open-source user works out of the box and can override via the profile).
            pk, sk = prof.get("priorityKeywords"), prof.get("secondaryKeywords")
            if isinstance(pk, list) and pk:
                globals()["PRIORITY_KW"] = [str(x).lower() for x in pk]
            if isinstance(sk, list) and sk:
                globals()["SECONDARY_KW"] = [str(x).lower() for x in sk]
            log("Resume profile loaded (%s): %d keywords, %d emphasized.%s"
                % (prof.get("generatedFrom", "?"), len(profile_kw), len(profile_strong),
                   " Rubric overridden from profile." if (pk or sk) else ""), args.quiet)
        except Exception as e:
            log("  ! profile.json ignored: %s" % e, args.quiet)

    existing = load_existing_keys()
    candidates, seen = [], set()
    stats = {"boards": 0, "errors": 0, "roles_seen": 0,
             "skip_emptype": 0, "demoted": 0, "below_tier": 0}
    health = {}   # per-source run metadata for the Source Health panel
    def _h(a):
        return health.setdefault(a, {"companies": 0, "postings": 0, "matches": 0, "errors": 0, "lastError": ""})

    for ci, c in enumerate(boards.get("companies", [])):
        name, ats, slug = c.get("name"), c.get("ats"), c.get("slug")
        fn = ADAPTERS.get(ats)
        if not fn or not slug:
            continue
        if ats in disabled:
            continue                        # source disabled in settings
        if only is not None and ats not in only:
            continue                        # not in this run's selected sources
        if ci and delay:
            time.sleep(delay)               # rate-limit between companies
        try:
            postings = fn(slug)
            stats["boards"] += 1
            _h(ats)["companies"] += 1
            _h(ats)["postings"] += len(postings)
        except urllib.error.HTTPError as e:
            log("  ! %s (%s/%s): HTTP %s" % (name, ats, slug, e.code), args.quiet)
            stats["errors"] += 1
            h = _h(ats); h["errors"] += 1; h["lastError"] = "HTTP %s" % e.code
            continue
        except Exception as e:
            log("  ! %s (%s/%s): %s" % (name, ats, slug, e), args.quiet)
            stats["errors"] += 1
            h = _h(ats); h["errors"] += 1; h["lastError"] = str(e)[:120]
            continue

        for p in postings:
            title, desc, loc = p["title"], p["desc"], p["location"]
            if not is_pm_role(title):
                continue
            stats["roles_seen"] += 1
            blocked_type = employment_blocked(title, skip_types)
            if blocked_type:
                stats["skip_emptype"] += 1
                continue  # contract/intern/associate/etc. - not a FT IC/leadership PM role
            blob = (title + " " + desc).lower()
            if kw and not any(k in blob for k in kw):
                continue  # no domain-keyword overlap
            rmode = remote_mode(loc)
            if remote_only and rmode == "onsite":
                continue
            if not us_eligible(loc):
                continue
            key = norm_key(name, title)
            if key in existing or key in seen:
                continue
            seen.add(key)
            fit = score_fit(title, desc)
            if profile_strong:
                if any(k in blob for k in profile_strong):
                    fit = round(min(9.0, fit + 0.3), 1)   # resume-tailored nudge
            # Negative keywords / blockers: demote (fit penalty) rather than hard-drop, so a
            # near-miss still surfaces lower; heavy hits fall below min-fit / min-tier naturally.
            neg_hits = sum(1 for k in neg_kw if k in blob) if neg_kw else 0
            if neg_hits:
                fit = round(max(0.0, fit - NEG_KW_PENALTY * neg_hits), 1)
                stats["demoted"] += 1
            if fit < min_fit:
                continue
            prob = score_prob(fit, title, rmode, bool(c.get("heritage")))
            tier = tier_for(fit, prob)
            if not tier_ok(tier, min_tier):
                stats["below_tier"] += 1
                continue
            note = short_note(title, desc, rmode)
            if neg_hits:
                note += " [demoted: %d blocker hit(s)]" % neg_hits
            row = {
                "company": name, "role": title, "sector": sector_for(title, desc),
                "salary": p.get("salary", ""), "location": loc or "Remote",
                "remote": rmode, "fit": fit, "prob": prob, "tier": tier,
                "conf": "verified", "link": p["url"], "source": ats,
                "notes": note,
            }
            candidates.append(row)
            _h(ats)["matches"] += 1

    candidates.sort(key=lambda r: r["fit"] * r["prob"], reverse=True)
    write_source_health(health, args.dry_run, only)

    log("Scanned %d boards (%d errors), %d PM roles seen, %d new matches "
        "(min-fit %.1f, min-tier %s; skipped %d by employment-type, %d below tier, %d demoted)."
        % (stats["boards"], stats["errors"], stats["roles_seen"], len(candidates),
           min_fit, min_tier, stats["skip_emptype"], stats["below_tier"], stats["demoted"]), args.quiet)
    for r in candidates:
        log("  + [%s] %s - %s (fit %.1f / prob %.1f) %s"
            % (r["tier"], r["company"], r["role"], r["fit"], r["prob"], r["location"]), args.quiet)

    if not candidates:
        append_log(0, [])
        return 0

    if args.dry_run:
        log("\n[dry-run] %d candidates not written." % len(candidates), args.quiet)
        return 0

    try:
        result = http_merge(candidates)
    except Exception:
        result = file_merge(candidates)
    log("Merge: added %d, skipped %d, total %d (via %s)."
        % (result.get("added", 0), result.get("skipped", 0),
           result.get("total", "?"), result.get("via", "?")), args.quiet)
    append_log(result.get("added", 0), candidates)
    return 0


def write_source_health(health, dry, only):
    """Persist per-source run metadata for the Settings Source Health panel. Merges into any
    existing file so a source-scoped run doesn't wipe other sources' last-known status."""
    try:
        prev = {}
        if os.path.exists(SOURCE_HEALTH_FILE):
            with open(SOURCE_HEALTH_FILE, encoding="utf-8") as f:
                prev = json.load(f).get("sources", {})
        now = datetime.datetime.now().isoformat(timespec="seconds")
        for ats, h in health.items():
            h["lastRun"] = now
            h["dry"] = bool(dry)
            prev[ats] = h
        with open(SOURCE_HEALTH_FILE, "w", encoding="utf-8") as f:
            json.dump({"generatedAt": now, "sources": prev}, f, indent=2)
    except Exception:
        pass


def append_log(added, candidates):
    lines = ["", "## %s - auto-scout (scout.py)" % TODAY,
             "Added %d new role(s)." % added]
    for r in candidates[:25]:
        lines.append("- [%s] %s - %s (fit %.1f / prob %.1f) - %s"
                      % (r["tier"], r["company"], r["role"], r["fit"], r["prob"], r["link"]))
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except Exception:
        pass


if __name__ == "__main__":
    sys.exit(main())
