"""
BambooHR hosted careers (public JSON). slug = subdomain (<slug>.bamboohr.com).

  list:   https://<slug>.bamboohr.com/careers/list           -> {result:[{id, jobOpeningName, ...}]}
  detail: https://<slug>.bamboohr.com/careers/<id>/detail     -> {result:{description, ...}}

EXPERIMENTAL: many BambooHR sites redirect/aren't publicly listable; failures are
handled by the scout per-company (logged, skipped). Confirm a live board before relying.
"""
from .base import source, fetch_json, strip_html, add_remote, join_loc, looks_like_pm


@source("bamboohr")
def fetch(slug):
    base = "https://%s.bamboohr.com/careers" % slug
    data = fetch_json(base + "/list")
    rows = data.get("result") or data.get("jobs") or []
    out = []
    for j in rows:
        title = j.get("jobOpeningName") or j.get("title") or ""
        locobj = j.get("location") or {}
        loc = join_loc(locobj.get("city"), locobj.get("state"), locobj.get("country")) if isinstance(locobj, dict) else str(locobj or "")
        loc = add_remote(loc, str(j.get("isRemote") or j.get("locationType") or "").lower().find("remote") >= 0)
        jid = j.get("id")
        url = "%s/%s" % (base, jid) if jid else (base + "/list")
        desc = ""
        if jid and looks_like_pm(title):
            try:
                d = (fetch_json("%s/%s/detail" % (base, jid)) or {}).get("result") or {}
                desc = strip_html(d.get("description", "") or d.get("jobDescription", "") or "")
            except Exception:
                pass
        out.append({"title": title, "location": loc, "url": url, "desc": desc, "salary": ""})
    return out
