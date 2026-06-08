#!/usr/bin/env python3
"""
scout_run.py - on-demand scout orchestrator triggered by the CRM web button.

Modes (no Claude in the loop):
  find      run scout.py to find NEW matching roles (board APIs, append-only merge)
  validate  re-check EXISTING reqs: confirm still-open, refresh salary/location/
            remote/link from the board, and (if OPENAI_API_KEY is set) LLM-rescore
            fit/prob/sector from the live JD. Writes back via the audit-logged
            PATCH /api/reqs/:key. Sets reqCheck = open|closed|unknown + reqCheckedOn.
  both      validate then find (default)

It writes live progress to agent/scout-status.json so the web UI can poll it, and
never blocks: the server spawns it detached. With --dry-run nothing is written
(no merge, no PATCH) - used for testing.

Deterministic core works with the desktop app closed. The LLM layer is optional and
env-gated; if the key is unset or a call fails, deterministic refresh still applies.
Stdlib only.
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scout            # reuse board adapters + helpers
import llm_enrich       # optional OpenAI layer (env-gated)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_dotenv():
    """Load <project>/.env into os.environ (no override) so CLI / launchd runs pick
    up OPENAI_API_KEY etc. even when not launched by the server."""
    p = os.path.join(ROOT, ".env")
    try:
        if not os.path.exists(p):
            return
        for line in open(p, encoding="utf-8"):
            s = line.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, v = s.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except Exception:
        pass


_load_dotenv()
AGENT = os.path.join(ROOT, "agent")
DATA_FILE = os.path.join(ROOT, "data.json")
STATUS_FILE = os.path.join(AGENT, "scout-status.json")
LOG_FILE = os.path.join(AGENT, "found-log.md")
TODAY = datetime.date.today().isoformat()
RUN = "scout-run-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
PORT = int(os.environ.get("PORT", "8787"))
UA = "job-scout-run/1.0 (+local CRM)"

PROMOTABLE = {"", "Not Applied", "Identified"}
DEAD_SIGNALS = [
    "job not found", "no longer available", "no longer accepting",
    "position has been filled", "this position is closed", "posting is closed",
    "page not found", "404 not found", "error=true", "job has been filled",
    "we are no longer", "this job is closed",
]


# ---------------------------------------------------------------------------
def write_status(d):
    d = dict(d)
    d.setdefault("run", RUN)
    d.setdefault("updatedAt", datetime.datetime.now().isoformat())
    tmp = STATUS_FILE + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, indent=2)
        os.replace(tmp, STATUS_FILE)
    except Exception:
        pass


def load_store():
    with open(DATA_FILE, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# ATS link parsing + posting matching
# ---------------------------------------------------------------------------
def parse_ats(link):
    u = link or ""
    low = u.lower()
    if "greenhouse.io" in low:
        m = re.search(r"greenhouse\.io/(?:job-boards/|boards/)?([^/?#]+)/jobs/(\d+)", u, re.I)
        if m:
            return ("greenhouse", m.group(1), m.group(2))
        tok = re.search(r"[?&]token=(\d+)", u, re.I)
        sl = re.search(r"[?&]for=([^&]+)", u, re.I)
        if tok and sl:
            return ("greenhouse", sl.group(1), tok.group(1))
        return ("greenhouse", None, None)
    if "ashbyhq.com" in low:
        m = re.search(r"ashbyhq\.com/([^/?#]+)/([0-9a-fA-F-]{8,})", u)
        if m:
            return ("ashby", m.group(1), m.group(2))
        m = re.search(r"ashbyhq\.com/([^/?#]+)", u)
        return ("ashby", m.group(1) if m else None, None)
    if "lever.co" in low:
        m = re.search(r"lever\.co/([^/?#]+)/([^/?#]+)", u)
        if m:
            return ("lever", m.group(1), m.group(2))
        m = re.search(r"lever\.co/([^/?#]+)", u)
        return ("lever", m.group(1) if m else None, None)
    if "workable.com" in low:
        m = re.search(r"apply\.workable\.com/([^/?#]+)/j/([^/?#]+)", u, re.I)
        if m:
            return ("workable", m.group(1), m.group(2))
        m = re.search(r"https?://([^.]+)\.workable\.com/j/([^/?#]+)", u, re.I)
        if m:
            return ("workable", m.group(1), m.group(2))
        m = re.search(r"apply\.workable\.com/(?:j/)?([^/?#]+)", u, re.I)  # acct or bare code
        return ("workable", m.group(1) if m else None, None)
    if "smartrecruiters.com" in low:
        m = re.search(r"jobs\.smartrecruiters\.com/([^/?#]+)/(\d+)", u, re.I)
        if m:
            return ("smartrecruiters", m.group(1), m.group(2))
        m = re.search(r"smartrecruiters\.com/([^/?#]+)", u, re.I)
        return ("smartrecruiters", m.group(1) if m else None, None)
    if "recruitee.com" in low:
        m = re.search(r"https?://([^.]+)\.recruitee\.com", u, re.I)
        return ("recruitee", m.group(1) if m else None, None)   # match by title (no stable numeric id in URL)
    if "personio." in low:
        m = re.search(r"https?://([^.]+)\.jobs\.personio\.(?:de|com)/job/(\d+)", u, re.I)
        if m:
            return ("personio", m.group(1), m.group(2))
        m = re.search(r"https?://([^.]+)\.jobs\.personio\.(?:de|com)", u, re.I)
        return ("personio", m.group(1) if m else None, None)
    if "teamtailor.com" in low:
        m = re.search(r"https?://([^.]+(?:\.[^.]+)?)\.teamtailor\.com/jobs/(\d+)", u, re.I)
        if m:
            return ("teamtailor", m.group(1), m.group(2))
        m = re.search(r"https?://([^.]+(?:\.[^.]+)?)\.teamtailor\.com", u, re.I)
        return ("teamtailor", m.group(1) if m else None, None)
    return (None, None, None)


def norm_title(t):
    s = (t or "").lower()
    s = re.sub(r"\(.*?\)", " ", s)
    for pat, rep in scout._NORM:
        s = re.sub(pat, rep, s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def match_posting(postings, pid, role):
    if pid:
        for p in postings:
            if pid in (p.get("url") or ""):
                return p
    target = norm_title(role)
    if target:
        for p in postings:
            if norm_title(p.get("title", "")) == target:
                return p
    return None


def http_open_status(url):
    """Return ('open'|'closed'|'unknown', detail) for a non-board posting link."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                    "Accept": "text/html"})
        with urllib.request.urlopen(req, timeout=8) as r:
            code = getattr(r, "status", 200) or 200
            raw = r.read(60000).decode("utf-8", "replace").lower()
        if any(sig in raw for sig in DEAD_SIGNALS):
            return ("closed", "dead signal in page")
        if code == 200:
            return ("open", "200")
        return ("unknown", "HTTP %s" % code)
    except urllib.error.HTTPError as e:
        if e.code in (404, 410):
            return ("closed", "HTTP %s" % e.code)
        return ("unknown", "HTTP %s" % e.code)        # 403/429/etc -> anti-bot, don't call it dead
    except Exception as e:
        return ("unknown", str(e)[:80])


def patch_row(company, role, fields, note, dry):
    if dry:
        return {"ok": True, "dry": True, "fields": fields}
    key = urllib.parse.quote(str(company) + "|" + str(role), safe="")
    body = json.dumps({"fields": fields, "result": "pass", "run": RUN,
                       "note": note, "sourceUrl": fields.get("link")}).encode("utf-8")
    req = urllib.request.Request("http://127.0.0.1:%d/api/reqs/%s" % (PORT, key),
                                 data=body, method="PATCH",
                                 headers={"Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=12) as r:
        return json.loads(r.read().decode("utf-8"))


def changed_fields(row, proposed):
    """Keep only keys whose value differs from the current row (avoid noop writes),
    but always keep reqCheck + reqCheckedOn so the check itself is recorded."""
    out = {}
    for k, v in proposed.items():
        if k in ("reqCheck", "reqCheckedOn"):
            out[k] = v
        elif v not in (None, "") and row.get(k) != v:
            out[k] = v
    return out


# ---------------------------------------------------------------------------
# Phases
# ---------------------------------------------------------------------------
def run_find(dry, quiet, sources=None):
    args = [sys.executable, os.path.join(AGENT, "scout.py")]
    if dry:
        args.append("--dry-run")
    if sources:
        args += ["--sources", ",".join(sorted(sources))]
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=240)
        out = (p.stdout or "") + "\n" + (p.stderr or "")
    except Exception as e:
        return {"ok": False, "error": str(e)[:160]}
    tail = out.strip().splitlines()[-6:]
    if p.returncode != 0:
        # a broken adapter/import/config crashed scout.py — surface it, don't report success
        return {"ok": False, "error": "scout.py exited %d" % p.returncode,
                "returncode": p.returncode, "dry": dry, "tail": tail}
    added = 0
    seen = None
    m = re.search(r"added (\d+)", out)
    if m:
        added = int(m.group(1))
    m2 = re.search(r"(\d+) new matches", out)
    if m2:
        seen = int(m2.group(1))
    return {"ok": True, "added": added, "newMatches": seen, "dry": dry, "tail": tail}


def run_validate(dry, quiet, do_all, maxrows, mode_label, only=None, disabled=None):
    disabled = disabled or set()
    store = load_store()

    def in_scope(r):
        ats = parse_ats(r.get("link", ""))[0]
        if ats and ats in disabled:
            return False
        if only is not None:
            return ats in only        # only validate rows from the selected sources
        return True

    eligible = [r for r in store if r.get("link")
                and (do_all or (r.get("status", "") in PROMOTABLE)) and in_scope(r)]
    eligible = eligible[:maxrows]
    total = len(eligible)
    llm_on = llm_enrich.llm_available()
    # cost controls: don't re-spend on rows enriched recently with unchanged JD, and cap calls/run
    ai_ttl = int(os.environ.get("AI_ENRICH_TTL_DAYS", "14"))
    ai_cap = int(os.environ.get("AI_ENRICH_MAX_PER_RUN", "40"))
    ai_calls = 0
    summary = {"checked": 0, "open": 0, "closed": 0, "unknown": 0,
               "refreshed": 0, "rescored": 0, "errors": 0,
               "llm": llm_on, "llmModel": llm_enrich.model_name() if llm_on else None,
               "llmErrors": 0, "aiCalls": 0, "aiTokens": 0, "aiSkippedFresh": 0,
               "aiSkippedCap": 0, "aiCap": ai_cap, "aiTtlDays": ai_ttl, "dry": dry, "total": total}
    board_cache = {}

    def _within_days(datestr, n):
        try:
            d = datetime.date.fromisoformat(str(datestr)[:10])
            return (datetime.date.today() - d).days <= n
        except Exception:
            return False

    for i, row in enumerate(eligible):
        company, role, link = row.get("company", ""), row.get("role", ""), row.get("link", "")
        if i % 4 == 0:
            write_status({"state": "running", "phase": "validating", "mode": mode_label,
                          "processed": i, "total": total, "partial": summary})
        ats, slug, pid = parse_ats(link)
        proposed, note, desc = {}, "", ""
        status_label = "unknown"

        if ats and slug:
            ckey = (ats, slug)
            if ckey not in board_cache:
                try:
                    board_cache[ckey] = scout.ADAPTERS[ats](slug)
                except Exception as e:
                    board_cache[ckey] = ("ERR", str(e)[:80])
            postings = board_cache[ckey]
            if isinstance(postings, tuple) and postings and postings[0] == "ERR":
                status_label = "unknown"
                note = "validation: board %s/%s unreachable (%s)" % (ats, slug, postings[1])
                proposed = {"reqCheck": "unknown", "reqCheckedOn": TODAY}
                summary["errors"] += 1
            else:
                match = match_posting(postings, pid, role)
                if match:
                    status_label = "open"
                    desc = match.get("desc", "") or ""
                    loc = match.get("location", "") or ""
                    proposed = {"reqCheck": "open", "reqCheckedOn": TODAY, "conf": "verified"}
                    if match.get("url"):
                        proposed["link"] = match["url"]
                    if loc:
                        proposed["location"] = loc
                        proposed["remote"] = scout.remote_mode(loc)
                    if match.get("salary"):
                        proposed["salary"] = match["salary"]
                    note = "validation: confirmed open on %s board" % ats
                else:
                    status_label = "closed"
                    proposed = {"reqCheck": "closed", "reqCheckedOn": TODAY}
                    note = "validation: role no longer listed on %s board" % ats
        else:
            status_label, detail = http_open_status(link)
            proposed = {"reqCheck": status_label, "reqCheckedOn": TODAY}
            note = "validation: link check (%s)" % detail

        # optional LLM rescore — only when we have real JD text (board match) + key set.
        # COST CONTROLS: skip rows already AI-enriched recently with the SAME JD (hash+TTL),
        # and stop once the per-run call cap is hit. Deterministic refresh still applies.
        if llm_on and status_label == "open" and len(desc) > 200:
            jd_hash = hashlib.sha1(desc[:4000].encode("utf-8", "replace")).hexdigest()[:16]
            fresh = (row.get("aiHash") == jd_hash and _within_days(row.get("aiEnrichedOn"), ai_ttl))
            if fresh:
                summary["aiSkippedFresh"] += 1
            elif ai_calls >= ai_cap:
                summary["aiSkippedCap"] += 1
            else:
                res = llm_enrich.enrich(company, role, desc)
                ai_calls += 1
                if res and "_error" not in res:
                    for k in ("fit", "prob", "sector"):
                        if k in res:
                            proposed[k] = res[k]
                    if res.get("salary") and "salary" not in proposed:
                        proposed["salary"] = res["salary"]
                    if res.get("remote"):
                        proposed["remote"] = res["remote"]
                    if res.get("summary"):
                        proposed["notes"] = "%s [AI-enriched %s]" % (res["summary"], TODAY)
                    proposed["aiHash"] = jd_hash
                    proposed["aiEnrichedOn"] = TODAY
                    summary["rescored"] += 1
                    summary["aiTokens"] += int(res.get("_tokens", 0) or 0)
                    note += "; AI-rescored"
                elif res and "_error" in res:
                    summary["llmErrors"] += 1

        # backfill source from the link whenever we can identify it
        if ats and row.get("source") != ats:
            proposed["source"] = ats

        summary["checked"] += 1
        summary[status_label] = summary.get(status_label, 0) + 1
        fields = changed_fields(row, proposed)
        # was anything beyond the bookkeeping fields refreshed?
        if any(k not in ("reqCheck", "reqCheckedOn") for k in fields):
            summary["refreshed"] += 1
        try:
            patch_row(company, role, fields, note, dry)
        except Exception as e:
            summary["errors"] += 1
            if not quiet:
                print("  ! PATCH failed for %s | %s: %s" % (company, role, str(e)[:80]))

    summary["aiCalls"] = ai_calls
    # log
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write("\n## %s - validate/enrich (%s)\nchecked %d: open %d, closed %d, "
                    "unknown %d; refreshed %d, AI-rescored %d, errors %d%s\n"
                    % (TODAY, RUN, summary["checked"], summary["open"], summary["closed"],
                       summary["unknown"], summary["refreshed"], summary["rescored"],
                       summary["errors"], " [dry-run]" if dry else ""))
    except Exception:
        pass
    return summary


def _disabled_sources():
    try:
        with open(os.path.join(AGENT, "boards.json"), encoding="utf-8") as f:
            return set(json.load(f).get("disabledSources", []))
    except Exception:
        return set()


def run_source_backfill(dry, quiet):
    """No-network pass: stamp `source` (inferred from each row's link) where missing/wrong."""
    store = load_store()
    summary = {"checked": 0, "stamped": 0, "errors": 0, "dry": dry, "total": len(store)}
    for i, row in enumerate(store):
        summary["checked"] += 1
        ats = parse_ats(row.get("link", ""))[0]
        if not ats or row.get("source") == ats:
            continue
        try:
            patch_row(row.get("company", ""), row.get("role", ""),
                      {"source": ats}, "source backfill from link", dry)
            summary["stamped"] += 1
        except Exception:
            summary["errors"] += 1
        if i % 10 == 0:
            write_status({"state": "running", "phase": "source-backfill",
                          "processed": i, "total": len(store), "partial": summary})
    return summary


def main():
    ap = argparse.ArgumentParser(description="On-demand scout orchestrator.")
    ap.add_argument("--mode", choices=["find", "validate", "both", "source-backfill"], default="both")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--all", action="store_true", help="validate every row with a link, not just not-applied")
    ap.add_argument("--max", type=int, default=150)
    ap.add_argument("--sources", default=None, help="comma-separated source names to scope this run")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    if os.environ.get("SCOUT_DRY"):     # env escape hatch for safe testing
        args.dry_run = True
    only = set(s.strip() for s in args.sources.split(",") if s.strip()) if args.sources else None
    disabled = _disabled_sources()

    started = datetime.datetime.now().isoformat()
    write_status({"state": "running", "phase": "starting", "mode": args.mode,
                  "startedAt": started, "dry": args.dry_run, "sources": sorted(only) if only else "all",
                  "llm": llm_enrich.llm_available()})
    result = {"mode": args.mode, "dry": args.dry_run, "startedAt": started,
              "sources": sorted(only) if only else "all"}
    try:
        if args.mode == "source-backfill":
            result["sourceBackfill"] = run_source_backfill(args.dry_run, args.quiet)
            result["state"] = "done"
            result["finishedAt"] = datetime.datetime.now().isoformat()
            write_status(result)
            if not args.quiet:
                print(json.dumps(result, indent=2))
            return 0
        if args.mode in ("validate", "both"):
            write_status({"state": "running", "phase": "validating", "mode": args.mode,
                          "startedAt": started})
            result["validate"] = run_validate(args.dry_run, args.quiet, args.all, args.max, args.mode,
                                               only=only, disabled=disabled)
        if args.mode in ("find", "both"):
            write_status({"state": "running", "phase": "finding", "mode": args.mode,
                          "startedAt": started, "validate": result.get("validate")})
            result["find"] = run_find(args.dry_run, args.quiet, sources=only)
        # surface a non-zero scout exit (broken adapter/import/config) as an error run
        fails = ["%s: %s" % (k, (result[k] or {}).get("error", "failed"))
                 for k in ("validate", "find")
                 if isinstance(result.get(k), dict) and result[k].get("ok") is False]
        result["state"] = "error" if fails else "done"
        if fails:
            result["error"] = "; ".join(fails)
        result["finishedAt"] = datetime.datetime.now().isoformat()
        write_status(result)
        if not args.quiet:
            print(json.dumps(result, indent=2))
        return 1 if fails else 0
    except Exception as e:
        result["state"] = "error"
        result["error"] = str(e)[:200]
        result["finishedAt"] = datetime.datetime.now().isoformat()
        write_status(result)
        print("scout_run error:", e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
