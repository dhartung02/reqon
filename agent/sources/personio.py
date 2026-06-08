"""
Personio public XML job feed. slug = company subdomain (or a full host).

GET https://<slug>.jobs.personio.de/xml?language=en  (falls back to .com)
  -> <workzag-jobs><position><id><office><department><name>
       <jobDescriptions><jobDescription><name><value>...
"""
import xml.etree.ElementTree as ET
from .base import source, fetch_text, strip_html, add_remote


def _hosts(slug):
    if "." in slug:                 # caller gave a full host
        return [slug]
    return ["%s.jobs.personio.de" % slug, "%s.jobs.personio.com" % slug]


@source("personio")
def fetch(slug):
    xml, host = None, None
    last = None
    for h in _hosts(slug):
        try:
            xml = fetch_text("https://%s/xml?language=en" % h)
            host = h
            break
        except Exception as e:
            last = e
    if xml is None:
        raise last or RuntimeError("personio feed unreachable")
    root = ET.fromstring(xml.encode("utf-8") if isinstance(xml, str) else xml)
    out = []
    for pos in root.iter("position"):
        def t(tag):
            e = pos.find(tag)
            return (e.text or "").strip() if e is not None and e.text else ""
        title = t("name")
        offices = [o.text.strip() for o in pos.iter("office") if o is not None and o.text]
        loc = ", ".join(dict.fromkeys(offices))
        parts = []
        for jd in pos.iter("jobDescription"):
            v = jd.find("value")
            if v is not None and v.text:
                parts.append(v.text)
        desc = strip_html(" ".join(parts))
        loc = add_remote(loc, "remote" in (title + " " + loc + " " + desc).lower())
        pid = t("id")
        url = ("https://%s/job/%s?language=en" % (host, pid)) if pid else ("https://%s" % host)
        out.append({"title": title, "location": loc, "url": url, "desc": desc, "salary": ""})
    return out
