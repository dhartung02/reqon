"""
SmartRecruiters public Posting API. slug = company identifier.

List:   https://api.smartrecruiters.com/v1/companies/<id>/postings?limit&offset
Detail: https://api.smartrecruiters.com/v1/companies/<id>/postings/<postingId>
The list lacks a description; we fetch detail only for PM-looking titles to keep
request volume sane.
"""
from .base import source, fetch_json, strip_html, add_remote, join_loc, looks_like_pm


@source("smartrecruiters")
def fetch(slug):
    base = "https://api.smartrecruiters.com/v1/companies/%s/postings" % slug
    out, offset, limit = [], 0, 100
    while True:
        data = fetch_json(base + "?limit=%d&offset=%d" % (limit, offset))
        content = data.get("content") or []
        for p in content:
            title = p.get("name", "") or ""
            locobj = p.get("location") or {}
            loc = join_loc(locobj.get("city"), locobj.get("region"), locobj.get("country"))
            loc = add_remote(loc, bool(locobj.get("remote")))
            pid = p.get("id")
            url = ("https://jobs.smartrecruiters.com/%s/%s" % (slug, pid)) if pid else (p.get("applyUrl") or "")
            desc = ""
            if pid and looks_like_pm(title):       # only spend a detail call on plausible PM roles
                try:
                    d = fetch_json(base + "/" + str(pid))
                    secs = (d.get("jobAd") or {}).get("sections") or {}
                    parts = []
                    for k in ("companyDescription", "jobDescription", "qualifications", "additionalInformation"):
                        t = (secs.get(k) or {}).get("text") or ""
                        if t:
                            parts.append(t)
                    desc = strip_html(" ".join(parts))
                except Exception:
                    desc = ""
            out.append({"title": title, "location": loc, "url": url, "desc": desc, "salary": ""})
        total = data.get("totalFound", len(content))
        offset += limit
        if not content or offset >= total or offset >= 400:   # hard page cap
            break
    return out
