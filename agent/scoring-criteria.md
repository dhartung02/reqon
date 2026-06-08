# Scoring criteria

How the scout (and a human grading roles) scores every newly-discovered requisition. Two
independent 0–10 scores plus a tier. **Be honest and conservative — these scores drive where
apply effort goes.** The candidate's actual domains/keywords/weights come from the **profile**
(Settings → Candidate profile; `agent/profile.json`) and the **watchlist** keywords — this doc
describes the *model*, not any one person.

## What "fit" measures against

**Seniority band (sweet spot):** Principal / Director / Sr. Director / Group / Head of Product /
Staff PM. Plain Manager / Associate and pure Program-Manager (TPM) roles are below target. VP+ is
a stretch for an IC/lead candidate.

**Domain strengths** are configured per candidate (profile keywords + weights, watchlist
keywords). The shipped defaults emphasize, highest → lowest:

PRIORITY TIER — first-choice domains; score highest (fit 8–10 when the title maps directly):
1. **Data / data platforms / data products / pipelines / ETL / ingest / Snowflake / data lake**
2. **AI — AI platform / agentic / LLM tooling / MCP / GenAI products**
3. **CDP / Customer Data Platform**
4. **Martech / engagement / marketing cloud / audience / identity resolution**
5. **API & integration / developer-platform / technical-platform products**

SECONDARY — good fit but not first choice. Cap fit ~0.5–1.0 below an equivalent priority role:
6. **Usage-billing / monetization / pricing / consumption / FinOps**
7. **Product catalog / commerce / retail e-commerce**
8. **Enterprise SaaS platform (generic)**
9. Adjacent/other (productivity, fintech, consumer, healthtech) — lower.

**Work mode:** when the candidate is remote-only (`remoteOnly` in config), on-site is a real
negative on probability and may be dropped entirely; flex/hybrid is acceptable.

**Heritage / network bonuses:** companies where the candidate has alumni ties or a warm
referral get elevated probability (configure via the profile / notes).

## FIT (0–10) — domain & résumé match

| Score | Meaning |
|---|---|
| 9.0–10 | Bullseye: a **priority-tier** role in the candidate's exact wheelhouse |
| 8.0–8.9 | Very strong: clearly a priority pillar, title in band |
| 7.0–7.9 | Strong: a secondary pillar, or a platform role adjacent to the core |
| 5.5–6.9 | Moderate: enterprise SaaS platform PM, lighter domain overlap |
| 4.0–5.4 | Weak: thin domain tie |
| <4.0 | Off-profile — usually skip rather than add |

## INTERVIEW PROBABILITY (0–10) — odds of landing a screen

Start from fit, then adjust (kept separate on purpose — some bullseye-fit roles are hard to land):

- **Seniority match:** in-band Principal/Director → neutral/+. Staff at FAANG-tier → −1 to −2. Head/VP → −1.5.
- **Remote:** remote → neutral/+0.5; on-site → −1.5 to −2 for a remote-only candidate.
- **Directness of map:** the more literally the résumé matches the JD, the higher.
- **Heritage/referral:** alumni tie or warm intro → +1 to +1.5.
- **Company prestige/volume:** very high-prestige firms lower raw odds absent a referral.

Typical range lands 5.0–7.5. Reserve 8+ for in-band, remote, direct-map, with a referral edge.

## EXPECTED VALUE & TIER (do not store EV; derive)

- `expectedValue = round(fit * prob / 10, 1)` — apply-effort allocator.
- **Tier A** = apply now: EV ≳ 5.2 (roughly fit ≥8 **and** prob ≥6.5).
- **Tier B** = strong: EV ~4.0–5.1.
- **Tier C** = monitor: EV < 4.0.
Tier is set by EV, not raw fit; editable later in the board.

## Other field rules

- **conf (link confidence):** `verified` only if a live, specific req URL was confirmed this run;
  `boardonly` if the link is a careers board to filter; `unverified` if sourced indirectly.
- **salary:** prefix `est.` when it's a market estimate, not from the listing.
- **remote enum:** `remote` | `flex` | `onsite`.
- **sector enum:** `CDP / Customer Data`, `Martech / Engagement`, `Data Infra`, `Identity / Data`, `Enterprise SaaS`, `AI Platform`.
- **notes:** 1–2 sentences — why it fits, plus any caveat (verify, on-site catch, referral path).
- All scores and `est.` salaries are estimates; the UI footer says so.
