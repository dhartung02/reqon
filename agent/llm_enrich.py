#!/usr/bin/env python3
"""
llm_enrich.py - OPTIONAL LLM scoring/extraction layer for the scout.

Provider-agnostic in spirit, OpenAI today. Stdlib only (urllib) - no SDK install.
It is ENV-GATED and degrades gracefully:

  * If OPENAI_API_KEY is unset            -> llm_available() is False; enrich() returns None.
  * If a call fails / times out / parses  -> enrich() returns None.

The CALLER (scout_run.py) always keeps the deterministic rule-based score as the
baseline and only *overrides* with LLM output when enrich() returns a usable dict.
Only PUBLIC job-description text is sent to the API - never the resume or any PII.

Env:
  OPENAI_API_KEY   required to enable. Set in the server's environment only.
  OPENAI_MODEL     default "gpt-5.4-mini". Set to whatever your key can access.
  OPENAI_BASE_URL  default "https://api.openai.com/v1" (override for Azure/proxy).

Returned dict (any subset may be present; caller validates):
  { "fit": 0-10, "prob": 0-10, "sector": <enum>, "salary": str,
    "remote": "remote|flex|onsite", "summary": str }
"""

import json
import os
import urllib.request
import urllib.error

SECTORS = ["CDP / Customer Data", "Martech / Engagement", "Data Infra",
           "Identity / Data", "Enterprise SaaS", "AI Platform"]

# Condensed from agent/scoring-criteria.md so the model scores the way the rubric does.
RUBRIC = (
    "You score job postings for a senior (Principal/Director/Staff/Lead) Product Manager whose "
    "priority domains are CDP / customer-data platforms, data platforms & pipelines (Snowflake, "
    "data lake, ETL), AI/agentic/LLM/MCP platforms, martech/audience/identity-resolution, and "
    "API/developer platforms. The candidate is remote-only (will not relocate).\n"
    "fit (0-10) = domain/resume match: 8-10 when a priority pillar (CDP, data platform, "
    "AI/ML platform, identity/IAM, martech, API platform) is central; ~7 for secondary "
    "(billing/monetization, catalog/commerce, generic enterprise platform); lower if off-domain.\n"
    "prob (0-10) = odds of landing a screen given seniority band (Principal/Director/Staff/Lead "
    "good; plain Manager/Associate weak), remote posture (remote best; ONSITE is a hard penalty "
    "for a remote-only candidate), and how directly the background maps. A referral/alumni "
    "adjacency is a bump.\n"
    "remote = one of remote|flex|onsite from the posting.\n"
    "sector = exactly one of: " + "; ".join(SECTORS) + ".\n"
    "salary = the posted band verbatim if present, else \"\" (do not invent one).\n"
    "summary = one short sentence on why it fits or doesn't."
)


def llm_available():
    return bool(os.environ.get("OPENAI_API_KEY"))


def model_name():
    return os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")


def _clamp(v):
    try:
        return round(max(0.0, min(10.0, float(v))), 1)
    except Exception:
        return None


def enrich(company, role, jd_text, timeout=30):
    """Return a dict of enriched fields, or None if disabled/unavailable/failed.
    On success the dict carries '_tokens' (total tokens billed) for cost accounting."""
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        return None
    base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    # Trim the JD: the top of a posting carries the signal that matters for scoring, and
    # shorter input = fewer prompt tokens. Configurable via OPENAI_JD_CHARS.
    jd = (jd_text or "")[:int(os.environ.get("OPENAI_JD_CHARS", "3500"))]
    user = (
        "Company: %s\nRole title: %s\n\nJob description (may be truncated):\n%s\n\n"
        "Return ONLY a JSON object with keys: fit, prob, sector, salary, remote, summary."
        % (company, role, jd)
    )
    payload = {
        "model": model_name(),
        "temperature": 0,
        # cap output so a runaway response can't cost much (the JSON is tiny in practice)
        "max_completion_tokens": int(os.environ.get("OPENAI_MAX_TOKENS", "400")),
        "response_format": {"type": "json_object"},
        "messages": [
            # static rubric goes FIRST so OpenAI prompt-caching can discount the repeated prefix
            {"role": "system", "content": RUBRIC},
            {"role": "user", "content": user},
        ],
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        base + "/chat/completions", data=body, method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            resp = json.loads(r.read().decode("utf-8", "replace"))
        content = resp["choices"][0]["message"]["content"]
        data = json.loads(content)
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode("utf-8", "replace")[:200]
        except Exception:
            detail = ""
        return {"_error": "HTTP %s %s" % (e.code, detail)}
    except Exception as e:
        return {"_error": str(e)[:160]}

    out = {}
    if "fit" in data and _clamp(data["fit"]) is not None:
        out["fit"] = _clamp(data["fit"])
    if "prob" in data and _clamp(data["prob"]) is not None:
        out["prob"] = _clamp(data["prob"])
    sec = (data.get("sector") or "").strip()
    if sec in SECTORS:
        out["sector"] = sec
    rm = (data.get("remote") or "").strip().lower()
    if rm in ("remote", "flex", "onsite"):
        out["remote"] = rm
    if isinstance(data.get("salary"), str) and data["salary"].strip():
        out["salary"] = data["salary"].strip()
    if isinstance(data.get("summary"), str) and data["summary"].strip():
        out["summary"] = data["summary"].strip()
    if out:
        try:
            out["_tokens"] = (resp.get("usage") or {}).get("total_tokens", 0)
        except Exception:
            pass
    return out or None


if __name__ == "__main__":
    # tiny self-check (no network unless a key is set)
    print("llm_available:", llm_available(), "model:", model_name())
    if llm_available():
        print(enrich("Acme", "Principal Product Manager, Data Platform",
                     "Own the data platform roadmap; Snowflake, pipelines, governance. Remote US."))
