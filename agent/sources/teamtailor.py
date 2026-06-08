"""
Teamtailor public JSON Feed. slug = company subdomain.

GET https://<slug>.teamtailor.com/jobs.json  (JSON Feed 1.1)
  -> { items: [ {id, title, url, content_html, date_published, tags, ...} ] }

Teamtailor's public feed doesn't carry a clean structured location, so location is
best-effort: we only flag 'remote' when the title/body says so. Under the scout's
remote-only filter that means Teamtailor surfaces explicitly-remote roles.
"""
from .base import source, fetch_json, strip_html, add_remote


@source("teamtailor")
def fetch(slug):
    data = fetch_json("https://%s.teamtailor.com/jobs.json" % slug)
    out = []
    for it in (data.get("items") or []):
        title = it.get("title", "") or ""
        url = it.get("url", "") or ""
        desc = strip_html(it.get("content_html") or it.get("content_text") or it.get("summary") or "")
        loc = add_remote("", "remote" in (title + " " + desc[:500]).lower())
        out.append({"title": title, "location": loc, "url": url, "desc": desc, "salary": ""})
    return out
