"""
Pluggable ATS/source adapters for the job scout.

Importing this package self-registers every adapter into REGISTRY
(source_name -> fetch(slug) -> list[normalized row]). scout.py uses REGISTRY as its
ADAPTERS table, so adding a source is just: drop a module here that calls
@source("name"), and add companies to boards.json with that "ats" type.

Currently registered: greenhouse, ashby, lever, workable, smartrecruiters,
recruitee (alias tellent), personio, teamtailor.
"""
from .base import REGISTRY, source  # re-export

# importing each module triggers its @source registration
from . import greenhouse, ashby, lever            # noqa: F401  (migrated)
from . import workable, smartrecruiters, recruitee, personio, teamtailor  # noqa: F401  (MVP-1)
from . import workday, bamboohr                    # noqa: F401  (MVP-2 public)
from . import theirstack, fantastic                # noqa: F401  (MVP-2 aggregators, key-gated)

# Catalog: name -> {label, kind, needsKey}. 'kind' = public | aggregator. Used by the
# settings UI; the live truth of what's callable is REGISTRY.
CATALOG = {
    "greenhouse":      {"label": "Greenhouse",            "kind": "public"},
    "ashby":           {"label": "Ashby",                 "kind": "public"},
    "lever":           {"label": "Lever",                 "kind": "public"},
    "workable":        {"label": "Workable",              "kind": "public"},
    "smartrecruiters": {"label": "SmartRecruiters",       "kind": "public"},
    "recruitee":       {"label": "Recruitee / Tellent",   "kind": "public"},
    "personio":        {"label": "Personio",              "kind": "public"},
    "teamtailor":      {"label": "Teamtailor",            "kind": "public"},
    "workday":         {"label": "Workday",               "kind": "public", "note": "per-tenant slug"},
    "bamboohr":        {"label": "BambooHR",              "kind": "public", "note": "experimental"},
    "theirstack":      {"label": "TheirStack",            "kind": "aggregator", "needsKey": "THEIRSTACK_API_KEY"},
    "fantastic":       {"label": "Fantastic.jobs (Apify)", "kind": "aggregator", "needsKey": "APIFY_TOKEN"},
}

__all__ = ["REGISTRY", "source", "CATALOG"]
