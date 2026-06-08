"""
Workable public careers widget. slug = account (apply.workable.com/<account>).

GET https://apply.workable.com/api/v1/widget/accounts/<account>?details=true
  -> { name, description, jobs: [ {title, shortcode, url, application_url,
       employment_type, telecommuting, department, country, city, state, location,
       description, ...} ] }
"""
from .base import source, fetch_json, strip_html, add_remote, join_loc


@source("workable")
def fetch(slug):
    data = fetch_json("https://apply.workable.com/api/v1/widget/accounts/%s?details=true" % slug)
    out = []
    for j in (data.get("jobs") or []):
        # location can be a nested dict or flat fields depending on board age
        locobj = j.get("location") if isinstance(j.get("location"), dict) else {}
        loc = join_loc(
            j.get("city") or locobj.get("city"),
            j.get("state") or j.get("region") or locobj.get("region"),
            j.get("country") or locobj.get("country"),
        ) or (locobj.get("location_str") if isinstance(locobj, dict) else "") or ""
        loc = add_remote(loc, bool(j.get("telecommuting") or j.get("remote")))
        url = j.get("url") or j.get("application_url") or j.get("shortlink") or ""
        out.append({
            "title": j.get("title", "") or j.get("full_title", "") or "",
            "location": loc,
            "url": url,
            "desc": strip_html(j.get("description", "") or ""),
            "salary": "",
        })
    return out
