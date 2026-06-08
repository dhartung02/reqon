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
        "remoteOnly": True,
    }

    print("Parsed %s" % os.path.basename(path))
    print("  applicant:", json.dumps(profile["applicant"]))
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
