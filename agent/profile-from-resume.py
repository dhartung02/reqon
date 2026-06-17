#!/usr/bin/env python3
"""
profile-from-resume.py - turn a resume into a tailored search profile.

Reads a resume (.docx / .txt / .md natively; .pdf if `pdftotext` is installed),
extracts (a) applicant contact info and (b) the domain keywords the resume
actually emphasizes, then writes agent/profile.json. scout.py reads that file to
tailor which roles it surfaces and how it scores fit - so the daily search keys
off YOUR resume instead of a hand-kept keyword list.

Usage:
    python3 agent/profile-from-resume.py "/path/to/Resume.docx"
    python3 agent/profile-from-resume.py "/path/to/Resume.docx" --print

Stdlib only (uses zipfile to read .docx). Re-run any time you update your resume.
"""

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scout  # reuse the domain vocab so parser + scorer stay in sync  # noqa: E402

PROFILE_FILE = os.path.join(HERE, "profile.json")

# Extra PM skill vocabulary to detect (beyond scout's PRIORITY/SECONDARY lists).
PM_SKILLS = [
    "product strategy", "roadmap", "okrs", "prd", "go to market", "gtm",
    "stakeholder", "cross-functional", "discovery", "voice of customer",
    "experimentation", "a/b testing", "analytics", "sql", "snowflake",
    "api", "integration", "platform", "data model", "etl", "telemetry",
    "personalization", "recommendation", "fraud", "risk", "governance",
    "p&l", "pricing", "billing", "monetization", "saas", "b2b",
]
SENIORITY = ["principal", "director", "senior director", "group product",
             "head of product", "staff", "vp", "vice president", "senior", "lead"]


def read_resume(path):
    p = path.lower()
    if p.endswith(".docx"):
        with zipfile.ZipFile(path) as z:
            xml = z.read("word/document.xml").decode("utf-8", "ignore")
        xml = re.sub(r"</w:p>", "\n", xml)
        xml = re.sub(r"<[^>]+>", "", xml)
        import html
        return html.unescape(xml)
    if p.endswith(".txt") or p.endswith(".md"):
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    if p.endswith(".pdf"):
        try:
            return subprocess.check_output(["pdftotext", "-layout", path, "-"],
                                           stderr=subprocess.DEVNULL).decode("utf-8", "replace")
        except Exception:
            raise SystemExit("PDF support needs `pdftotext` (brew install poppler), "
                             "or export your resume to .docx / .txt and retry.")
    raise SystemExit("Unsupported file type. Use .docx, .txt, .md, or .pdf.")


def extract_applicant(text):
    a = {}
    m = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
    if m:
        a["email"] = m.group(0)
    m = re.search(r"(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}", text)
    if m:
        a["phone"] = m.group(0).strip()
    m = re.search(r"(?:linkedin\.com/in/[\w-]+)", text, re.I)
    if m:
        a["linkedin"] = "https://" + m.group(0)
    # name: first non-empty line that's short and has no digits/@
    for line in text.splitlines():
        s = line.strip()
        if s and "@" not in s and not re.search(r"\d", s) and 2 <= len(s.split()) <= 4 and len(s) < 40:
            a["name"] = s
            break
    states = {"AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
              "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
              "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
              "TX","UT","VT","VA","WA","WV","WI","WY","DC"}
    # Location is ONLY ever set from a strict "City, ST" shape backed by a real US
    # state code — never from a bare keyword. This guards a core identity field from
    # resume keyword bleed (an earlier version wrote a domain term like "Generative AI"
    # into location). If nothing matches, leave it blank for manual entry — never guess.
    for m in re.finditer(r"\b([A-Z][a-z]+(?: [A-Z][a-z]+)?),\s*([A-Z]{2})\b", text):
        if m.group(2) in states:           # only accept a real US state abbreviation
            a["location"] = m.group(0)
            break
    return a


def weighted_keywords(text):
    t = text.lower()
    vocab = scout.PRIORITY_KW + scout.SECONDARY_KW + PM_SKILLS
    counts = {}
    for kw in vocab:
        n = t.count(kw)
        if n:
            counts[kw] = counts.get(kw, 0) + n
    return [{"kw": k, "weight": v} for k, v in
            sorted(counts.items(), key=lambda x: x[1], reverse=True)]


def detect_seniority(text):
    t = text.lower()
    return [s for s in SENIORITY if s in t]


# ---- structured work history + education ------------------------------------------------
# Resume layouts vary wildly, so these are best-effort heuristics: find the section, split it
# into entries on date-range lines, and capture role/company/dates + a short description. The app
# shows "review below" — the candidate fixes anything we mis-split. Better to surface entries than
# leave the sections blank (the prior behavior).

_MONTH = (r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|"
          r"april|june|july|august|september|october|november|december)\.?")
_DATE = r"(?:%s\s*)?\d{4}" % _MONTH
_RANGE = re.compile(r"(%s)\s*(?:to|[-–—−])\s*(present|current|now|%s)" % (_DATE, _DATE), re.I)
_DEGREE = re.compile(r"\b(ph\.?d|doctorate|m\.?b\.?a|master'?s?|m\.?s\.?|m\.?a\.?|b\.?s\.?|"
                     r"b\.?a\.?|bachelor'?s?|associate'?s?|b\.?eng|m\.?eng)\b", re.I)

_SECTION_KEYS = {
    "experience": ["work experience", "professional experience", "experience", "employment history",
                   "employment", "work history", "career history", "relevant experience"],
    "education": ["education", "academic background", "academics"],
}
_BOUND_KEYS = (["skills", "technical skills", "core competencies", "projects", "certifications",
                "certification", "awards", "honors", "volunteer", "summary", "profile", "objective",
                "publications", "interests", "languages", "references", "achievements", "contact"]
               + [k for ks in _SECTION_KEYS.values() for k in ks])


def _header_name(line):
    s = line.strip()
    if not s or len(s) > 46:
        return None
    norm = re.sub(r"[^a-z ]", "", s.lower()).strip()
    if not norm:
        return None
    for name, keys in _SECTION_KEYS.items():
        if any(norm == k or norm.startswith(k) for k in keys):
            return name
    if any(norm == k or norm.startswith(k) for k in _BOUND_KEYS):
        return "_bound"
    return None


def _sections(text):
    """Return {name: [lines]} for experience/education, each bounded by the next header."""
    lines = text.splitlines()
    heads = [(i, _header_name(l)) for i, l in enumerate(lines)]
    heads = [(i, n) for i, n in heads if n]
    out = {}
    for idx, (i, name) in enumerate(heads):
        if name in _SECTION_KEYS and name not in out:
            end = heads[idx + 1][0] if idx + 1 < len(heads) else len(lines)
            out[name] = lines[i + 1:end]
    return out


def _split_title(head):
    head = head.strip(" \t,|·•–—-")
    for sep in [" — ", " – ", " | ", " · ", " at ", " @ ", "—", "–", "|", "·"]:
        if sep in head:
            a, b = head.split(sep, 1)
            return a.strip(" \t,"), b.strip(" \t,")
    if "," in head:
        a, b = head.split(",", 1)
        return a.strip(), b.strip()
    return head, ""


def extract_experience(text):
    secs = _sections(text)
    lines = secs.get("experience")
    if not lines:
        return []
    entries, cur, prev = [], None, ""
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        m = _RANGE.search(line)
        if m:
            if cur:
                entries.append(cur)
            head = (line[:m.start()] + " " + line[m.end():]).strip(" \t,|·•–—-")
            role, company = _split_title(head) if head else (prev, "")
            # "Role\nCompany 2019–2023" → head is the company, prev is the role
            if head and not company and prev and prev != head:
                role, company = prev, head
            cur = {"role": role, "company": company, "start": m.group(1).strip(),
                   "end": m.group(2).strip(), "desc": []}
        elif cur is not None and len(cur["desc"]) < 6:
            cur["desc"].append(re.sub(r"^[•\-–*•]\s*", "", line))
        prev = line
    if cur:
        entries.append(cur)
    return [{"role": e["role"], "company": e["company"], "start": e["start"], "end": e["end"],
             "description": " ".join(e["desc"]).strip()[:600]} for e in entries[:12]]


_SCHOOL_WORD = re.compile(r"\b(university|college|institute|polytechnic|academy|school of)\b", re.I)


def _find_school(*candidates):
    for c in candidates:
        for seg in re.split(r"[—–|·,]| {2,}", c):
            seg = seg.strip(" \t,|·•–—-")
            if len(seg) >= 4 and _SCHOOL_WORD.search(seg):
                return seg
    return ""


def extract_education(text):
    secs = _sections(text)
    lines = [l.strip() for l in secs.get("education", []) if l.strip()]
    if not lines:
        return []
    out, prev = [], ""
    for line in lines:
        deg = _DEGREE.search(line)
        yrs = re.findall(r"\b(?:19|20)\d{2}\b", line)
        # A line with neither a degree nor a year isn't its own entry — keep it as the pending
        # school for the next degree/year line (handles "School\nDegree, year" layouts).
        if not deg and not yrs:
            prev = line
            continue
        rng = _RANGE.search(line)
        start = rng.group(1).strip() if rng else (yrs[0] if yrs else "")
        end = rng.group(2).strip() if rng else ""
        level = deg.group(0).strip().rstrip(".") if deg else ""
        fm = re.search(r"\bin\s+([A-Z][A-Za-z& ]{2,40}?)(?:\s*[—–|·,]|\s+\d|$)", line)
        field = fm.group(1).strip() if fm else ""
        # School: prefer a segment with a school keyword (this line, then the previous line);
        # else fall back to the line stripped of degree / field / dates.
        school = _find_school(line, prev)
        if not school:
            s = _RANGE.sub("", line)
            s = _DEGREE.sub("", s)
            s = re.sub(r"\b(?:19|20)\d{2}\b", "", s)
            if field:
                s = s.replace(field, "")
            s = re.sub(r"\b(?:in|of|the)\b", "", s, flags=re.I)
            school = s.strip(" \t,|·•–—-.") or prev.strip(" \t,|·•–—-")
        out.append({"school": school, "level": level, "field": field, "start": start, "end": end})
        prev = line
    return out[:8]


def main():
    ap = argparse.ArgumentParser(description="Build a tailored search profile from a resume.")
    ap.add_argument("resume", help="path to resume (.docx/.txt/.md/.pdf)")
    ap.add_argument("--print", action="store_true", help="print profile, don't write")
    args = ap.parse_args()

    path = os.path.expanduser(args.resume)
    if not os.path.exists(path):
        raise SystemExit("Resume not found: " + path)

    text = read_resume(path)
    profile = {
        "generatedFrom": os.path.basename(path),
        "generatedAt": datetime.date.today().isoformat(),
        "applicant": extract_applicant(text),
        "seniority": detect_seniority(text),
        "keywords": weighted_keywords(text),
        "workHistory": extract_experience(text),
        "education": extract_education(text),
        "remoteOnly": True,
    }

    print("Parsed %s" % os.path.basename(path))
    print("  applicant:", json.dumps(profile["applicant"]))
    print("  work history:", len(profile["workHistory"]), "entries · education:", len(profile["education"]), "entries")
    print("  seniority:", ", ".join(profile["seniority"]) or "(none detected)")
    print("  top keywords:", ", ".join("%s(%d)" % (k["kw"], k["weight"])
                                        for k in profile["keywords"][:12]) or "(none)")

    if args.print:
        return 0
    with open(PROFILE_FILE, "w", encoding="utf-8") as f:
        json.dump(profile, f, indent=2)
    print("Wrote %s (%d keywords). scout.py will now tailor to this resume."
          % (PROFILE_FILE, len(profile["keywords"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
