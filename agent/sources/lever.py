"""Lever public postings API. slug = company (jobs.lever.co/<slug>)."""
from .base import source, fetch_json, strip_html


@source("lever")
def fetch(slug):
    data = fetch_json("https://api.lever.co/v0/postings/%s?mode=json" % slug)
    out = []
    for j in data:
        cats = j.get("categories", {}) or {}
        out.append({
            "title": j.get("text", "") or "",
            "location": cats.get("location", "") or "",
            "url": j.get("hostedUrl", "") or j.get("applyUrl", "") or "",
            "desc": strip_html(j.get("descriptionPlain", "") or j.get("description", "") or ""),
            "salary": "",
        })
    return out
