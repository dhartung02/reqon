# Reqon — Branding & Positioning Work

> Status: exploration in progress. Not final. Return here before any copy changes go to production.

---

## Brand guardrails

- **Feel:** focused, premium, calm, useful — not gimmicky
- **Avoid:** "auto-apply" positioning; leading with "CRM"; anything that implies the tool acts without the user
- **AI framing:** assistive, human-in-the-loop — the candidate reviews every action
- **Target:** serious candidates (Principal / Director / Sr. Director level; active, not casual browsers)
- **Product arc:** saved role → scored → followed up → interview prepped → offer / decision

---

## Current hero line (as of 2026-06-26)

| Slot | Copy |
|---|---|
| Headline | Your job search, run like an operation. |
| Status | Early reader flagged as unclear on first impression. Retiring from hero — see notes below. |

---

## Headline evaluation

### Scoring matrix

| Option | 3-sec clarity | Emotional pull | Differentiation | Brand fit | Generic risk | OG/social | Premium |
|---|---|---|---|---|---|---|---|
| **A** Stop letting good roles slip away | ★★★★★ | ★★★★★ | ★★★★ | ★★★★★ | Low | ★★★★★ | ★★★★★ |
| **B** Turn job-search chaos into a pipeline | ★★★★ | ★★★★ | ★★★★ | ★★★★★ | Medium | ★★★★ | ★★★★ |
| **C** Your job search has too many tabs | ★★★★★ | ★★★★★ | ★★★★★ | ★★★ | Low | ★★★★★ | ★★★ |
| **D** Never lose track of a good opportunity again | ★★★★ | ★★★ | ★★ | ★★★ | High | ★★★ | ★★★ |
| **E** Treat your job search like a pipeline, not a pile | ★★★★★ | ★★★★ | ★★★★★ | ★★★★ | Low | ★★★★★ | ★★★★ |
| **F** Find the right roles. Keep them moving. | ★★★★ | ★★★ | ★★★ | ★★★★ | Medium | ★★★★ | ★★★★ |
| **G** Organize your job search from saved role to offer | ★★★★★ | ★★ | ★★★ | ★★★ | High | ★★★ | ★★★ |

### Option notes

**A — "Stop letting good roles slip away."**
Strongest overall. Fear-of-loss hook is universally true for any active candidate who has lost track of a promising role. "Good roles" (not just "opportunities") feels credible and specific. Calm, not gimmicky. Works on every surface — hero, OG preview, social card. **Current top pick.**

**B — "Turn job-search chaos into a pipeline."**
Best fit for Emerald Command vocabulary. "Pipeline" does double duty — Reqon's own mental model and a process signal without jargon. Weakness: "chaos into order" is a common SaaS trope; "pipeline" may need a beat for non-B2B readers. Strong as a section headline or secondary hook.

**C — "Your job search has too many tabs."**
Most viral-ready line on the list. Highly specific, relatable, faintly self-deprecating. Risk: slightly casual for premium/calm brand. Works well on social or as a secondary hook; risks a product-hunt-y tone if it leads the page. Revisit for social ads.

**D — "Never lose track of a good opportunity again."**
Too generic. "Never lose track" and "in one place" are table stakes for every productivity tool. "Again" is good (implies the problem already happened) but the surrounding language is forgettable.

**E — "Treat your job search like a pipeline, not a pile."**
Most memorable and differentiated. The contrast is specific and the phrasing sticks. Slight risk: the rhyme can read as playful, undercutting premium. Strong second choice. Best for "how it works" section header or paid social tests.

**F — "Find the right roles. Keep them moving."**
Clean, action-forward, credible. Two-sentence rhythm echoes Reqon's two core jobs (discovery + momentum). Weakness: no pain-point hook — describes the product rather than naming the user's feeling. Better as button label, section header, or tagline below the hero.

**G — "Organize your job search from saved role to offer."**
Descriptive and precise, but "organize" is a weak verb. The "saved role to offer" arc is Reqon's best unique framing — belongs in the subheadline, not the hero.

---

## Recommended hero block

```
Stop letting good roles slip away.

Reqon helps you discover roles, rank them by fit, track follow-ups,
and move every opportunity from saved to offer.

[ Launch Reqon Cloud → ]

No auto-apply · you review every action · your search data stays yours.
Your job search, run like an operation.
```

---

## Slot-by-slot recommendations

### 1. Hero headline
> **Stop letting good roles slip away.**

### 2. Subheadline
> **Reqon helps you discover roles, rank them by fit, track follow-ups, and move every opportunity from saved to offer.**

Covers the full product arc in plain language. No CRM jargon. "Saved to offer" is Reqon-specific and should stay.

### 3. OG / social preview title
> **Stop letting good roles slip away. | Reqon**

~50 chars before the brand suffix. Doesn't truncate on most platforms. Standalone-legible with no context.

### 4. OG / social preview description
> Discover roles, rank them by fit, track every follow-up, and move every opportunity from saved to offer. Your job search, organized.

~155 chars. Derived from the subheadline, slightly tightened. The closing phrase ("Your job search, organized") works as an OG summary closer — not strong enough to lead the hero.

### 5. "Your job search, run like an operation." — disposition

**Retire from hero. Keep as a supporting line.**

As a first-impression headline it asks the reader to supply the metaphor before they understand the product. As a second-impression line (once the reader already understands) it lands as a confident brand statement.

Recommended placements:
- Microline below the primary CTA (current favorite mockup placement — keep it)
- "How it works" section header as an imperative: "Run your search like an operation."
- `<meta name="description">` or About page as brand voice

Do not retire from the brand — it is distinctive and premium. Just not the hook for a cold reader.

---

## Options held for later testing

These didn't win the current evaluation but are worth revisiting for specific surfaces (paid social, onboarding copy, product section headers):

- *Your job search has too many tabs.* — social/viral, lighter tone
- *Treat your job search like a pipeline, not a pile.* — section header, memorable contrast
- *Turn job-search chaos into a pipeline.* — secondary hero if A/B testing against current pick
- *From saved role to offer, keep every opportunity moving.* — onboarding empty-state copy
- *Know what to apply to, who to follow up with, and what comes next.* — feature bullet or tooltip copy
- *Built for job searches with too many moving parts.* — niche/targeted ad copy

---

## Open questions for next session

- [ ] Test Option A vs Option E in a real A/B context (social post or landing page variant)
- [ ] Decide whether to use Option C ("too many tabs") for social ads specifically
- [ ] Confirm OG image pairing — dashboard screenshot vs pipeline illustration
- [ ] Review `<title>` tag in `marketing/index.html` against final OG title decision
- [ ] Consider a short tagline for the favicon / browser tab: "Reqon" alone vs "Reqon — Job Search Command Center"
