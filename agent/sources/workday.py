"""
Workday per-tenant career site (the public "cxs" JSON the careers UI itself calls).

slug encodes the tenant coordinates as "<host>|<tenant>|<site>", e.g.
  "nvidia.wd5.myworkdayjobs.com|nvidia|NVIDIAExternalCareerSite"
(find them in the careers URL: https://<host>/<site> ; <tenant> is the first path
segment of /wday/cxs/<tenant>/<site>/jobs). List is a POST; descriptions need a
per-posting GET (gated to PM-looking titles to keep volume sane).
"""
from .base import source, fetch_json, strip_html, add_remote, looks_like_pm


def _parse(slug):
    parts = [p.strip() for p in (slug or "").split("|")]
    if len(parts) != 3 or not all(parts):
        raise ValueError("workday slug must be '<host>|<tenant>|<site>' (got %r)" % slug)
    return parts[0], parts[1], parts[2]


@source("workday")
def fetch(slug):
    host, tenant, site = _parse(slug)
    base = "https://%s/wday/cxs/%s/%s" % (host, tenant, site)
    out, offset, limit = [], 0, 20
    while True:
        data = fetch_json(base + "/jobs", data={"appliedFacets": {}, "limit": limit,
                                                "offset": offset, "searchText": ""})
        posts = data.get("jobPostings") or []
        for p in posts:
            title = p.get("title", "") or ""
            loc = p.get("locationsText", "") or ""
            ext = p.get("externalPath", "") or ""
            url = ("https://%s/%s%s" % (host, site, ext)) if ext else ""
            desc, remote = "", False
            if ext and looks_like_pm(title):
                try:
                    d = (fetch_json(base + ext) or {}).get("jobPostingInfo") or {}
                    desc = strip_html(d.get("jobDescription", "") or "")
                    url = d.get("externalUrl") or url
                    loc = d.get("location") or loc
                    remote = bool(d.get("remoteType"))
                except Exception:
                    pass
            loc = add_remote(loc, remote or "remote" in (title + " " + loc).lower())
            out.append({"title": title, "location": loc, "url": url, "desc": desc, "salary": ""})
        total = data.get("total", len(posts))
        offset += limit
        if not posts or offset >= total or offset >= 200:   # hard cap
            break
    return out
