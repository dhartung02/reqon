"""
Fantastic.jobs via Apify (aggregator). KEY-GATED + EXPERIMENTAL.

Enabled only when APIFY_TOKEN is set; otherwise fetch() returns [] (no-op). Runs the
configured Apify actor synchronously and reads its dataset. slug is passed as the
actor's search term. Broad ATS crawling fallback (Workday/Taleo/iCIMS/SuccessFactors/
Rippling/...). Confirm the actor id + its input/output schema before relying on it.
"""
import os
from .base import source, fetch_json, strip_html, add_remote, join_loc


@source("fantastic")
def fetch(slug):
    token = os.environ.get("APIFY_TOKEN")
    if not token:
        return []   # not configured -> skip silently
    actor = os.environ.get("APIFY_ACTOR", "fantastic-jobs~job-postings-search")
    url = "https://api.apify.com/v2/acts/%s/run-sync-get-dataset-items?token=%s" % (actor, token)
    payload = {"query": slug or "product manager", "remote": True,
               "maxItems": int(os.environ.get("APIFY_MAX_ITEMS", "25"))}
    items = fetch_json(url, data=payload)
    if isinstance(items, dict):
        items = items.get("items") or items.get("data") or []
    out = []
    for j in (items or []):
        loc = j.get("location") or join_loc(j.get("city"), j.get("country")) or ""
        loc = add_remote(loc, bool(j.get("remote") or j.get("is_remote")))
        out.append({
            "title": j.get("title") or j.get("job_title") or "",
            "location": loc,
            "url": j.get("url") or j.get("apply_url") or j.get("jobUrl") or "",
            "desc": strip_html(j.get("description") or j.get("description_html") or ""),
            "salary": j.get("salary") or "",
        })
    return out
