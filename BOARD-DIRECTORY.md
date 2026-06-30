# Crowdsourced board directory — vertical-tagged board discovery

Status: **Phase 1 shipped** (capture). Phases 2–3 are roadmap, gated on critical mass + the
multi-user cloud backend.

## Intent

Every time a user adds a company via **Settings → Sources → "Add company by careers URL"**, that
add is a signal: "someone job-searching in vertical X tracks this board." Today those adds die in a
single user's `boards.json`. The intent is to **tag each add with a vertical/industry** and, once
enough users have contributed, **recommend additional boards** to a user based on the
vertical/industry on their profile — a data network effect where every manual add improves discovery
for the next person in that vertical.

> Example: a Fintech PM signs up. Because dozens of other Fintech users already added Plaid, Brex,
> Mercury, Ramp, Stripe, etc., Reqon suggests those boards on day one instead of making them paste
> URLs one at a time.

## Why this works

- **Marginal cost is zero** — users already add boards for themselves; we just tag and aggregate.
- **Compounding** — the directory gets better with every user, and is hard for a competitor to copy
  without the same user base.
- **Cold-start friendly** — even before recommendations exist, capturing the tag now means the data
  is ready the day critical mass arrives. Capturing late means starting the flywheel from zero.

## Phases

### Phase 1 — Capture (shipped)
Tag each board-add with an optional industry/vertical at add time; store it on the `boards.json`
entry. No recommendation layer yet — this just starts accruing the data.

- **UI:** the post-Detect "Add to scout" block gains an **Industry / vertical** input (free text with
  a datalist of common suggestions, so it's guided but not rigid).
- **Server:** `POST /api/sources/add` accepts `industry`, stores it on the entry. If the company is
  already tracked but untagged, a provided industry backfills it (never overwrites an existing tag).
- **Data model:** board entry becomes `{ name, ats, slug, industry? }`. `industry` is optional; the
  scout ignores it for now (purely additive metadata).

### Phase 2 — Profile vertical
Add an industry/vertical field to the candidate profile (`agent/profile.json`). Use it to
**pre-fill** the add-time industry input, so tagging becomes one fewer decision. This also seeds the
"what vertical is this user" signal the recommendation layer needs.

### Phase 3 — Aggregate + recommend (post-critical-mass)
A cloud-side directory aggregates board-adds **by vertical, anonymously** (counts per
`(industry, ats, slug)`, never "user X tracks Y"). For a given user, recommend the boards most
common in their vertical that they don't already track. Likely surfaced as suggestions in the
Sources panel and/or onboarding.

## Constraints & flags

- **Cloud-dependent:** aggregation requires the multi-user cloud backend. Per-instance `boards.json`
  cannot aggregate across users — Phase 3 lives server-side in cloud.
- **Privacy:** board lists aren't PII, but the aggregation must be anonymous — store/serve counts by
  vertical, not user-attributed board lists. No profile identity in the directory.
- **Taxonomy:** Phase 1 deliberately uses free text + suggestions rather than a locked enum; the
  canonical vertical list can firm up in Phase 2/3 once we see what users actually type.
- **Monetization:** board recommendations are a natural **Cloud/AI-tier** perk (see `SUBSCRIPTION.md`).

## Data model (Phase 1)

`agent/boards.json`:
```json
{
  "companies": [
    { "name": "Stripe", "ats": "greenhouse", "slug": "stripe", "industry": "Fintech" }
  ]
}
```
`industry` omitted for legacy/untagged entries; treated as "unknown" everywhere.
