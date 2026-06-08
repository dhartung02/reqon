"""
Recruitee (Tellent) careers-site API. slug = company subdomain.

GET https://<slug>.recruitee.com/api/offers/  ->  { offers: [ {title, slug,
    careers_url, careers_apply_url, location, city, country, state_*, remote,
    description, requirements, ...} ] }
"""
from .base import source, fetch_json, strip_html, add_remote, join_loc


@source("recruitee", "tellent")
def fetch(slug):
    data = fetch_json("https://%s.recruitee.com/api/offers/" % slug)
    out = []
    for o in (data.get("offers") or []):
        loc = join_loc(o.get("city"), o.get("state_name") or o.get("state_code"),
                       o.get("country") or o.get("country_code"))
        if not loc:
            loc = o.get("location", "") or ""
        loc = add_remote(loc, bool(o.get("remote")))
        desc = strip_html((o.get("description") or "") + " " + (o.get("requirements") or ""))
        url = o.get("careers_url") or o.get("careers_apply_url") or o.get("url") or ""
        out.append({"title": o.get("title", "") or "", "location": loc,
                    "url": url, "desc": desc, "salary": ""})
    return out
