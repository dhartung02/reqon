"""Ashby public job-board API. slug = board name (jobs.ashbyhq.com/<slug>)."""
from .base import source, fetch_json, strip_html, add_remote


@source("ashby")
def fetch(slug):
    data = fetch_json("https://api.ashbyhq.com/posting-api/job-board/%s?includeCompensation=true" % slug)
    out = []
    for j in data.get("jobs", []):
        if j.get("isListed") is False:
            continue
        comp = j.get("compensation") or {}
        salary = ""
        tiers = comp.get("compensationTierSummary") or ""
        if isinstance(tiers, str):
            salary = tiers
        loc = j.get("location", "") or j.get("locationName", "") or ""
        loc = add_remote(loc, bool(j.get("isRemote")))
        out.append({
            "title": j.get("title", "") or "",
            "location": loc,
            "url": j.get("jobUrl", "") or j.get("applyUrl", "") or "",
            "desc": strip_html(j.get("descriptionHtml", "") or j.get("descriptionPlain", "") or ""),
            "salary": salary,
        })
    return out
