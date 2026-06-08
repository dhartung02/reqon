"""
TheirStack broad job-search API (aggregator). KEY-GATED + EXPERIMENTAL.

Enabled only when THEIRSTACK_API_KEY is set; otherwise fetch() returns [] (no-op),
so it never breaks a run. slug is used as a job-title query term. Covers many ATSs
the direct adapters can't (Workday/Taleo/iCIMS/SuccessFactors), per the source plan.
Verify the request/response schema against your TheirStack plan before relying on it.
"""
import os
from .base import source, fetch_json, strip_html, add_remote, join_loc


@source("theirstack")
def fetch(slug):
    key = os.environ.get("THEIRSTACK_API_KEY")
    if not key:
        return []   # not configured -> skip silently
    body = {
        "page": 0, "limit": 25,
        "job_title_or": [slug] if slug else ["product manager"],
        "posted_at_max_age_days": int(os.environ.get("THEIRSTACK_MAX_AGE_DAYS", "30")),
        "remote": True,
    }
    data = fetch_json("https://api.theirstack.com/v1/jobs/search", data=body,
                      headers={"Authorization": "Bearer " + key})
    out = []
    for j in (data.get("data") or data.get("results") or []):
        loc = j.get("location") or join_loc(j.get("city"), j.get("country")) or ""
        loc = add_remote(loc, bool(j.get("remote")))
        out.append({
            "title": j.get("job_title") or j.get("title") or "",
            "location": loc,
            "url": j.get("url") or j.get("apply_url") or j.get("final_url") or "",
            "desc": strip_html(j.get("description") or ""),
            "salary": j.get("salary_string") or "",
        })
    return out
