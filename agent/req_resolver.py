#!/usr/bin/env python3
"""
req_resolver.py — turn a fuzzy (company, title) lead into the REAL job req on the
employer's own career site.

WHY THIS EXISTS
  Job-recommendation emails (LinkedIn / Indeed / Glassdoor / …) hand you a company,
  a title, and an *aggregator redirect* link — not the employer's actual ATS posting.
  That link is low-trust (often a tracking redirect, sometimes already dead) and it
  blocks the apply assembly-line, which wants a live Greenhouse/Ashby/Lever req.

  This module upgrades a lead in three tiers of confidence, all ToS-safe (public
  board APIs only — no scraping):

    Tier 1  company already in boards.json  -> fetch its ATS board, fuzzy-match the
            title against the live reqs. On a match you get the canonical employer
            apply URL + real location/salary, and the lead can be marked `verified`.
    Tier 2  company NOT mapped              -> derive candidate ATS slugs from the
            company name and probe Greenhouse/Ashby/Lever. On a hit, the company is
            appended to boards.json (so the daily scout permanently covers it too),
            then title-matched as in Tier 1.
    Tier 3  no pollable board found         -> return None; the caller keeps the
            aggregator link at lower confidence.

  All scoring/dedupe/merge stays in scout.py — this module only *finds and verifies*
  the canonical posting. Stdlib only; reuses the scout's ATS adapters (sources/).
"""

import json
import os
import re
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
BOARDS_FILE = os.environ.get("REQON_BOARDS_FILE") or os.path.join(HERE, "boards.json")

import sources  # noqa: E402  registers the ATS adapters into sources.REGISTRY
import scout    # noqa: E402  reuse the canonical title-normalization vocab

# ATS types we can *discover* by guessing a slug (their slug == a short company token).
# Workday/iCIMS/Phenom need a per-tenant host, so they aren't probe-able blind.
PROBE_ATS = ("greenhouse", "ashby", "lever")

# Corporate suffixes stripped before deriving a slug / comparing company names.
_SUFFIX_RE = re.compile(
    r"\b(inc|inc\.|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|"
    r"technologies|technology|software|labs|systems|solutions|group|holdings|"
    r"global|worldwide|usa|ai|io|hq)\b", re.I)
# Tokens that carry no matching signal in a title.
_TITLE_STOP = set(scout._STOP) | {
    "remote", "us", "usa", "united", "states", "fulltime", "ft", "i", "ii", "iii",
}


# ---------------------------------------------------------------------------
# Title matching (pure — unit-tested in tests/test_req_resolver.py)
# ---------------------------------------------------------------------------
def norm_title_tokens(title):
    """Canonical token set for a job title. Applies the scout's abbreviation map
    ('Product Manager' -> 'pm', 'Senior' -> 'sr', …) so the email title and the
    board title collapse to the same vocabulary, then drops stopwords."""
    s = re.sub(r"\(.*?\)", " ", (title or "").lower())     # drop parentheticals
    for pat, rep in scout._NORM:
        s = re.sub(pat, rep, s)
    return set(t for t in re.findall(r"[a-z0-9]+", s) if t and t not in _TITLE_STOP)


def title_match_score(a, b):
    """0..1 similarity between two titles. Weighted toward containment so a short
    email title ('Principal Product Manager') still matches a longer board title
    ('Principal Product Manager, Data Platform')."""
    ta, tb = norm_title_tokens(a), norm_title_tokens(b)
    if not ta or not tb:
        return 0.0
    inter = ta & tb
    if not inter:
        return 0.0
    contain = len(inter) / min(len(ta), len(tb))
    jac = len(inter) / len(ta | tb)
    return round(0.7 * contain + 0.3 * jac, 3)


def best_match(title, postings, threshold=0.6):
    """Best (posting, score) in `postings` for `title`, or (None, 0.0). Requires at
    least two shared meaningful tokens unless the email title is a single token that
    is fully contained — guards 'Director' from matching every senior req."""
    best, best_s = None, 0.0
    ta = norm_title_tokens(title)
    for p in postings:
        s = title_match_score(title, p.get("title", ""))
        if s <= best_s:
            continue
        inter = ta & norm_title_tokens(p.get("title", ""))
        if len(inter) < 2 and not (len(ta) == 1 and ta <= norm_title_tokens(p.get("title", ""))):
            continue
        best, best_s = p, s
    return (best, best_s) if best_s >= threshold else (None, 0.0)


# ---------------------------------------------------------------------------
# Company -> slug derivation + boards.json lookup (pure)
# ---------------------------------------------------------------------------
def _strip_suffix(name):
    n = _SUFFIX_RE.sub(" ", (name or "").lower())
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", n)).strip()


def candidate_slugs(company):
    """Plausible ATS slugs for a company name, most-likely first. e.g. 'Acme Data, Inc.'
    -> ['acmedata', 'acme-data', 'acme']. Slugs are how Greenhouse/Ashby/Lever name a
    board (job-boards.greenhouse.io/<slug>)."""
    base = _strip_suffix(company)
    if not base:
        return []
    words = base.split()
    out = []
    def add(s):
        s = s.strip("-")
        if s and s not in out:
            out.append(s)
    add("".join(words))            # acmedata
    add("-".join(words))           # acme-data
    if words:
        add(words[0])              # acme
    if len(words) > 1:
        add("".join(words[:2]))    # first two joined (already covered if 2 words)
    return out[:4]


def company_norm(name):
    """Normalized company name for equality comparison (suffix-stripped, spaceless)."""
    return _strip_suffix(name).replace(" ", "")


def find_company_in_boards(company, boards):
    """Return the boards.json company entry matching `company` (normalized name match,
    either exact or clear containment), or None."""
    target = company_norm(company)
    if len(target) < 3:
        return None
    for c in boards.get("companies", []):
        cn = company_norm(c.get("name", ""))
        if not cn:
            continue
        if cn == target or (len(target) >= 4 and (target in cn or cn in target)):
            return c
    return None


# ---------------------------------------------------------------------------
# Board fetching + the public resolve() entry point
# ---------------------------------------------------------------------------
def load_boards(path=None):
    try:
        with open(path or BOARDS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"companies": []}


def _fetch_board(ats, slug, cache):
    """Fetch a board's postings via the scout's adapter, tolerating a missing board.
    Cached per (ats, slug) for the life of a run. Returns a list (possibly empty) or
    None when the board doesn't exist / errored."""
    key = (ats, slug)
    if cache is not None and key in cache:
        return cache[key]
    fn = sources.REGISTRY.get(ats)
    result = None
    if fn and slug:
        try:
            result = fn(slug) or []
        except urllib.error.HTTPError:
            result = None          # 404/410 -> no such board
        except Exception:
            result = None          # network/parse hiccup -> treat as miss
    if cache is not None:
        cache[key] = result
    return result


def append_board(name, ats, slug, path=None):
    """Append a newly-discovered company to boards.json (append-only, deduped by
    ats+slug AND by normalized name). Atomic write. Returns True if it was added."""
    path = path or BOARDS_FILE
    try:
        boards = load_boards(path)
    except Exception:
        return False
    comps = boards.setdefault("companies", [])
    tnorm = company_norm(name)
    for c in comps:
        if (c.get("ats") == ats and c.get("slug") == slug) or company_norm(c.get("name", "")) == tnorm:
            return False
    comps.append({"name": name, "ats": ats, "slug": slug, "addedBy": "email-scout"})
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(boards, f, indent=2)
        os.replace(tmp, path)
        return True
    except Exception:
        return False


def resolve(company, title, boards=None, probe=True, cache=None,
            write_boards=False, threshold=0.6, boards_path=None):
    """Resolve a (company, title) lead to a real ATS req.

    Returns a dict on success, else None:
        { via: 'boards'|'probe', ats, slug, url, salary, location,
          matchedTitle, score, newBoard: bool }
    `url` is the canonical employer posting when a title matched; it is "" when a
    board was discovered but no posting matched (caller keeps the aggregator link but
    still benefits from the newly-learned board). `cache` is an optional dict to share
    board fetches across many leads in one run.
    """
    if not company or not title:
        return None
    if boards is None:
        boards = load_boards(boards_path)
    cache = cache if cache is not None else {}

    # Tier 1 — company already mapped.
    entry = find_company_in_boards(company, boards)
    if entry:
        postings = _fetch_board(entry.get("ats"), entry.get("slug"), cache)
        if postings:
            p, score = best_match(title, postings, threshold)
            if p:
                return {"via": "boards", "ats": entry.get("ats"), "slug": entry.get("slug"),
                        "url": p.get("url", ""), "salary": p.get("salary", ""),
                        "location": p.get("location", ""), "matchedTitle": p.get("title", ""),
                        "score": score, "newBoard": False}
        # Mapped but no match (title changed / role closed) — nothing better to offer.
        return None

    # Tier 2 — discover the board by probing candidate slugs.
    if not probe:
        return None
    for slug in candidate_slugs(company):
        for ats in PROBE_ATS:
            postings = _fetch_board(ats, slug, cache)
            if not postings:
                continue
            # Found a real board for this company. Learn it for the daily scout.
            added = append_board(company, ats, slug, boards_path) if write_boards else False
            p, score = best_match(title, postings, threshold)
            return {"via": "probe", "ats": ats, "slug": slug,
                    "url": (p.get("url", "") if p else ""),
                    "salary": (p.get("salary", "") if p else ""),
                    "location": (p.get("location", "") if p else ""),
                    "matchedTitle": (p.get("title", "") if p else ""),
                    "score": (score if p else 0.0), "newBoard": added}
    return None
