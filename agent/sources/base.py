"""
sources.base - shared plumbing for the pluggable ATS/source adapters.

Each adapter is a function `fetch(slug) -> list[dict]` registered under one or more
source names via the @source decorator. It MUST return rows in the project's
existing normalized shape (the same dict scout.py already consumes):

    { "title": str, "location": str, "url": str, "desc": str, "salary": str }

`desc` is plain text (HTML stripped). `location` is the raw location string; if the
source flags a role remote, call add_remote() so scout's remote_mode() detects it.
Adapters do NO scoring/filtering/dedupe - that stays in scout.py so every source
flows through the one canonical pipeline (agent/scoring-criteria.md).

Stdlib only. Be a good citizen: clear UA, timeouts, tolerate junk.
"""

import json
import os
import re
import urllib.request
import urllib.error

UA = "job-scout/1.0 (+local CRM; respectful polling)"
# Per-request board-fetch timeout (seconds). Overridable via BOARD_FETCH_TIMEOUT so speculative
# resolution probes (req_resolver) can fail fast instead of stalling 20s each on dead boards.
try:
    TIMEOUT = int(os.environ.get("BOARD_FETCH_TIMEOUT", "20") or "20")
except ValueError:
    TIMEOUT = 20
MAX_BYTES = 6 * 1024 * 1024   # guard against huge feeds (some shared boards are MBs)

REGISTRY = {}


def source(*names):
    """Register an adapter under one or more source names."""
    def deco(fn):
        for n in names:
            REGISTRY[n] = fn
        return fn
    return deco


def _open(url, data=None, method=None, headers=None):
    h = {"User-Agent": UA, "Accept": "application/json, text/xml, */*"}
    if headers:
        h.update(headers)
    if data is not None and not isinstance(data, (bytes, bytearray)):
        data = json.dumps(data).encode("utf-8")
        h.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    return urllib.request.urlopen(req, timeout=TIMEOUT)


def fetch_json(url, data=None, method=None, headers=None):
    with _open(url, data=data, method=method, headers=headers) as r:
        return json.loads(r.read(MAX_BYTES).decode("utf-8", "replace"))


def fetch_text(url, headers=None):
    with _open(url, headers=headers) as r:
        return r.read(MAX_BYTES).decode("utf-8", "replace")


def strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
          .replace("&nbsp;", " ").replace("&#39;", "'").replace("&quot;", '"'))
    return re.sub(r"\s+", " ", s).strip()


def join_loc(*parts):
    return ", ".join(p for p in parts if p and str(p).strip())


def add_remote(loc, is_remote):
    """If the source flags a role remote, make sure the location string says so,
    so scout.remote_mode() classifies it as 'remote'."""
    loc = (loc or "").strip()
    if is_remote and "remote" not in loc.lower():
        return (loc + " (Remote)").strip() if loc else "Remote"
    return loc


def looks_like_pm(title):
    """Cheap gate to avoid expensive per-posting detail calls on obviously-irrelevant
    roles (used by adapters that need a second request for the description). The real
    filter is scout.is_pm_role()."""
    t = (title or "").lower()
    return ("product" in t or "head of product" in t
            or any(b in t for b in ["principal", "director", "staff", "group", "lead"]) and "product" in t)
