"""Greenhouse public board API. slug = board token (job-boards.greenhouse.io/<slug>)."""
from .base import source, fetch_json, strip_html


@source("greenhouse")
def fetch(slug):
    data = fetch_json("https://boards-api.greenhouse.io/v1/boards/%s/jobs?content=true" % slug)
    out = []
    for j in data.get("jobs", []):
        loc = (j.get("location") or {}).get("name", "") or ""
        out.append({
            "title": j.get("title", "") or "",
            "location": loc,
            "url": j.get("absolute_url", "") or "",
            "desc": strip_html(j.get("content", "") or ""),
            "salary": "",
        })
    return out
