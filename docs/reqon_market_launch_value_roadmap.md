# Reqon Market Launch Roadmap

**Purpose:** Prioritize Reqon roadmap work by customer impact/value before market release.  
**Competitive reference:** Simplify  
**Planning lens:** What must be true for Reqon to go live with a credible, differentiated product.  
**Date:** 2026-07-01  
**Status:** Roadmap planning input

---

## 1. Executive Summary

Reqon should go to market as a **job-search command center for serious candidates**, not as a generic job tracker or a Simplify clone.

Simplify's clearest value proposition is application speed: find jobs, autofill repetitive forms, manage documents, track status, and use job-match/document tools. Reqon's stronger market opportunity is different:

> **Simplify helps candidates apply faster. Reqon helps candidates run a smarter, more accountable search.**

The highest-value launch version of Reqon should focus on four customer outcomes:

1. **Find better jobs from better sources.**
2. **Know which opportunities are worth acting on next.**
3. **Keep every application moving without dropping follow-ups or recruiter replies.**
4. **Turn outcomes into insight: what is working, what is not, and where to focus.**

The launch roadmap should therefore prioritize operational clarity, trust, onboarding, synced surfaces, and outcome tracking over lower-leverage polish or broad feature expansion.

---

## 2. Product Tier Model

Reqon should be explicit that it has a free tier. This matters competitively because Simplify has a strong free-product perception, and Reqon cannot look paywalled before users understand the value.

### Free

**Positioning:** Personal job-search command center for users willing to run locally.

Includes:

- Core app / local board
- Scout search
- Pipeline tracking
- Most browser/web-board capabilities
- Some extension capabilities
- Manual job capture and status management
- Basic analytics
- Candidate profile / basic saved answers where available

Customer value:

- Lets users experience the core Reqon workflow without paying.
- Creates trust because the user can run locally and keep data under their control.
- Gives Reqon a competitive answer to Simplify's free entry point.

### Local Pro

**Positioning:** Power-user edition for users who want the full product but are comfortable hosting their own server.

Includes:

- Everything in Free
- Full local/self-hosted feature set
- Advanced board functionality
- Advanced extension functionality where server-backed features are required
- Local automation and integrations that do not require Reqon Cloud
- Local-first privacy/control posture

Customer value:

- Best fit for technical users, privacy-sensitive users, and early adopters.
- Lets Reqon monetize without forcing everyone into cloud hosting.
- Reinforces the product's trust and ownership story.

### Cloud

**Positioning:** Managed Reqon with all surfaces kept in sync.

Includes:

- Everything in Local Pro
- Hosted cloud board
- Web board, extension, and app all staying in sync
- Cloud persistence and cross-device access
- Easier setup and onboarding
- Managed account/session model
- Cloud-ready notifications and integrations

Customer value:

- Removes the biggest adoption barrier: hosting and setup.
- Makes Reqon usable by non-technical serious job seekers.
- Creates the strongest paid conversion path.

### AI+

**Positioning:** Cloud plus AI assistance woven into the workflow.

Includes:

- Everything in Cloud
- AI-assisted autofill
- AI answer drafting
- Advanced job-fit analysis
- Resume/JD gap analysis
- Role scoring and reasoning
- Company/context enrichment where enabled
- Interview prep generation
- Drafted outreach/follow-up/thank-you notes
- Human-in-the-loop review and editable outputs

Customer value:

- Saves time while preserving control.
- Improves decision quality and application quality.
- Gives Reqon a premium tier that is clearly more valuable than basic tracking.

---

## 3. Launch Strategy

The product should not wait until every Simplify-like feature exists. Reqon should go live when the core differentiated loop is clear, reliable, and easy enough for a real customer to complete.

### The launch loop

A market-ready user should be able to:

1. Create an account or start locally.
2. Upload or enter their candidate profile.
3. Define target roles, companies, location/remote preferences, salary expectations, and search filters.
4. Run scout/search and get relevant roles.
5. See a prioritized Apply Next view.
6. Clip/save jobs from the browser.
7. Apply and track status.
8. Receive reminders for follow-ups and aging applications.
9. Ingest recruiter responses or manually record outcomes.
10. See what is working through analytics and outcome signals.

If that loop feels coherent, Reqon can go to market. Everything else can be shipped as iterative upgrades.

---

## 4. Roadmap Prioritization Framework

Priorities are ranked by launch value using five criteria:

| Criterion | Meaning |
|---|---|
| Customer impact | Does this materially improve the user's search outcome? |
| Differentiation | Does this make Reqon meaningfully different from Simplify and generic trackers? |
| Activation | Does this help a new user experience value quickly? |
| Trust/reliability | Does this reduce failure, confusion, privacy concern, or data-loss risk? |
| Monetization support | Does this make Free, Local Pro, Cloud, or AI+ easier to understand and sell? |

Priority labels:

- **P0 Launch Gate:** Must be done before go-to-market.
- **P1 Launch Accelerator:** Strongly preferred before launch, but not a blocker if time is tight.
- **P2 Post-Launch Differentiator:** Important update after launch.
- **P3 Later Expansion:** Valuable, but not necessary for initial market release.

---

# 5. Prioritized Roadmap

## P0 Launch Gate — Must Be Done Before Go-To-Market

These items sit above the snap line. Reqon should not broadly launch until these are credible, because they define the core product promise.

---

### 1. Clear Tier Packaging and In-Product Entitlement Model

**Why this matters:** Reqon has a free tier, but the website/product must make that obvious. Without clear packaging, users may assume Reqon is paid-only and compare it unfavorably against Simplify.

**Customer value:** Users understand what they can try immediately and why they would upgrade.

**Scope:**

- Define four tiers in product and marketing copy:
  - Free
  - Local Pro
  - Cloud
  - AI+
- Create a simple capability matrix.
- Clarify which surfaces/features are available per tier.
- Avoid implying AI is required for the product to be useful.
- Make Free feel legitimate, not crippled.
- Make Cloud value obvious: sync, hosted board, app, extension, lower setup friction.
- Make AI+ value obvious: advanced job fit, autofill, answer drafts, interview prep, human-reviewed AI assistance.

**Launch acceptance criteria:**

- Website includes a clean pricing/tier section.
- README includes the same tier definitions.
- In-product upgrade/locked-feature messaging is consistent.
- Free users can complete the core local workflow.
- Cloud and AI+ have a clear reason to exist.

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 2. First-Run Onboarding and Activation Flow

**Why this matters:** Simplify's value is immediately obvious. Reqon is deeper, so the onboarding must guide users to value quickly.

**Customer value:** A new user should not stare at an empty board and wonder what to do.

**Scope:**

- Guided first-run checklist:
  1. Choose local/free or sign into cloud.
  2. Add target role titles.
  3. Add location/remote preference.
  4. Add salary target/minimum.
  5. Upload or paste résumé/profile.
  6. Add companies or choose starter scout sources.
  7. Run first scout.
  8. Review Apply Next queue.
  9. Install/load extension prompt.
  10. Optional: connect Gmail response ingest.
- Empty states for every major surface.
- Sample data option for exploration.
- "Your next best step" card after setup.

**Launch acceptance criteria:**

- A new user can reach a populated, prioritized board within 5-10 minutes.
- Empty board states tell the user exactly what to do next.
- Onboarding supports both local/free and cloud paths.
- Users can skip optional AI/Gmail/extension setup without breaking the workflow.

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 3. Daily Command Center / Today View

**Why this matters:** This is the clearest product differentiation. Reqon should not be only a tracker; it should answer, "What should I do next?"

**Customer value:** Users focus limited time on the highest-value actions.

**Scope:**

Create a default Today / Command Center view with:

- Best new roles to review/apply to
- Apply Next queue
- Follow-ups due
- Recruiter replies needing review
- Interviews to prep for
- Aging applications
- Roles likely stale or closed
- High-fit saved roles not yet applied
- Recently rejected / outcome changes
- Quick actions: apply, follow up, archive, prep, mark response, add note

**Launch acceptance criteria:**

- User can open Reqon and immediately know the top 3-5 actions.
- Today view pulls from existing status, scout, follow-up, Gmail ingest, and analytics data.
- Actions are clear and reviewable.
- Works for users with and without AI enabled.

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 4. Outcome Signals v1

**Why this matters:** This is Reqon's strongest long-term moat and the biggest differentiation from generic trackers. The product should capture structured outcomes from day one.

**Customer value:** Users learn which companies, roles, sources, and strategies are actually working.

**Scope:**

Add structured event tracking for:

- Saved
- Applied
- Recruiter response
- Rejection
- Recruiter screen
- Hiring manager screen
- Technical/product interview
- Panel/final interview
- Offer
- Withdrawn
- Ghosted
- Closed role
- Referral requested
- Referral received

Each signal should capture:

- Company
- Role title
- Role level
- Source
- ATS/provider if known
- Date/time
- Status before/after
- Résumé/profile version if available
- Match/fit score at time of application
- Remote/location
- Salary band if known
- Manual vs Gmail-ingested vs AI-assisted source
- Confidence

**Launch acceptance criteria:**

- Status changes create structured events.
- Gmail ingest can create/recommend response signals.
- Manual signal entry is easy from a role card/detail page.
- Analytics can read from the signal log.
- Signals are exportable.

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 5. Core Analytics v1 Focused on Outcomes

**Why this matters:** Analytics should not be decorative. They should show users whether the search is working.

**Customer value:** Users can adjust behavior based on evidence.

**Scope:**

Prioritize these analytics before launch:

- Applications over time
- Response rate
- Rejection rate
- Interview rate
- Offer rate where available
- Ghosting/aging count
- Source ROI
- Company response history
- Role/title conversion
- Time from applied to first response
- Time from applied to rejection
- Current bottleneck view

**Launch acceptance criteria:**

- Analytics are grounded in structured signals, not only current status counts.
- Metrics are understandable to non-technical users.
- User can filter by date range, source, company, role family, and status.
- Analytics are useful with small datasets and improve as more applications accumulate.

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 6. Reliable Scout and Source Setup UX

**Why this matters:** Job discovery is part of the core promise. If scout setup feels brittle, Reqon will feel like a developer tool rather than a product.

**Customer value:** Users get relevant jobs without manually searching every company board.

**Scope:**

- Add company/source by careers URL.
- Detect supported ATS/provider.
- Show source health.
- Show last run, new roles found, errors, skipped roles, and stale sources.
- Let users enable/disable sources easily.
- Explain why a job matched or did not match.
- Make scout search useful in Free/local mode.

**Launch acceptance criteria:**

- A user can add at least one company/source without editing JSON.
- Scout failures are visible and understandable.
- Apply Next queue is populated from scout results.
- Source health is visible in Settings or a Source Manager.

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 7. Extension v1: Clip, Status, Fit, and Safe Assist

**Why this matters:** Simplify's extension is a major adoption hook. Reqon needs a credible browser surface, but it should focus on capture + workflow continuity rather than trying to win only on autofill.

**Customer value:** Users can capture roles and update their search while browsing real job boards.

**Scope:**

Minimum launch extension capabilities:

- Clip current job posting.
- Detect known/tracked job page.
- Show fit/EV/status overlay.
- Mark applied.
- Open role in board.
- Open side panel with role details/status.
- Basic saved-answer/factual-field assistance where available.
- AI features only for AI+ users or locally configured AI users.
- Never submit applications.
- Never fill EEO, consent, password, or sensitive fields automatically.

**Launch acceptance criteria:**

- Extension can connect to local server and cloud server.
- Extension setup is documented and easy to follow.
- Clipping works on major supported ATS/job pages.
- Status changes sync back to the board.
- Locked AI+ features degrade gracefully.

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 8. Cloud Sync Foundation

**Why this matters:** Cloud is the main path for non-technical users and the clearest paid value layer.

**Customer value:** Users can move between web board, extension, and app without losing state.

**Scope:**

- Stable cloud auth/session model.
- Board sync across cloud web, extension, and app.
- Per-user data isolation.
- Device pairing or token-based extension/app setup.
- Soft deletes/tombstones to prevent resurrected data.
- Backup/snapshot safety.
- Basic account management.

**Launch acceptance criteria:**

- A cloud user can sign in and use board + extension + app against the same data.
- Data remains consistent across surfaces.
- User data is isolated by account.
- Recovery/snapshot path exists for data safety.

**Tier impact:** Cloud, AI+

---

### 9. Trust, Privacy, and Safety Messaging

**Why this matters:** Reqon's differentiation depends on trust: no auto-submit, user-owned data, reviewable AI, and privacy-aware design.

**Customer value:** Users feel safe putting sensitive job-search data into the product.

**Scope:**

- Public privacy/trust page.
- Clear explanation of local vs cloud data handling.
- Clear statement that Reqon never auto-submits applications.
- AI reviewability and budget-cap explanation.
- Explain what Gmail ingest reads, how it matches, and what it does not do.
- Explain extension field safety.
- Security basics for hosted Cloud.

**Launch acceptance criteria:**

- Marketing site includes trust/privacy page.
- In-product integrations explain data access before setup.
- README has a clear Data & Privacy section aligned to product tiers.
- AI features clearly show review/edit before use.

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 10. Marketing Site and Positioning Refresh

**Why this matters:** The product has a lot of capability, but the market-facing story must be simple.

**Customer value:** Users quickly understand why Reqon exists and whether it is for them.

**Scope:**

Update site messaging around:

- "Job-search command center"
- "Find better roles. Apply with focus. Track every signal."
- Free tier availability
- Local/private option
- Cloud sync option
- AI+ as an assistant, not autopilot
- Comparison vs spreadsheets and auto-apply tools
- Strong screenshots/GIFs of Today view, Apply Next, extension, analytics, and signals

**Launch acceptance criteria:**

- Homepage explains Reqon in less than 10 seconds.
- Pricing/tier page exists.
- Core workflow is visually demonstrated.
- CTA supports Free/local and Cloud paths.

**Tier impact:** Free, Local Pro, Cloud, AI+

---

## SNAP LINE: Minimum Market Launch Readiness

Reqon is ready for go-to-market when the P0 launch gate items above are complete enough that a new user can reliably complete the core loop:

> Set up profile → discover/clip roles → see prioritized next actions → apply/track → capture outcomes → learn what is working.

### Must be true before launch

- Free tier is clearly communicated and useful.
- Local Pro, Cloud, and AI+ are clearly differentiated.
- New users have a guided first-run setup.
- Scout/search produces relevant roles.
- Apply Next / Today view tells users what to do next.
- Extension can clip and update status reliably.
- Cloud users can sync board, app, and extension.
- Outcome signals are captured from status changes and recruiter responses.
- Core analytics explain response/interview/rejection patterns.
- Trust/privacy/AI-control messaging is clear.
- The marketing site explains the product without requiring a demo.

### Should not block launch

The following should not delay launch if the P0 loop is strong:

- Full company intelligence pages
- Full referral/contact CRM
- Advanced document workspace
- Public benchmark database
- Services marketplace
- Perfect visual polish
- Full Simplify-style job-board replacement
- Deep social/network graph

---

# 6. P1 Launch Accelerators — High Value, But Not Strict Launch Blockers

These items are strong candidates for the first post-snap sprint if they cannot fit before launch.

---

### 11. Application Assets Workspace

**Why this matters:** Simplify makes documents very visible. Reqon has profile/narrative/draft assets, but they should be packaged into an obvious workspace.

**Customer value:** Users can manage the materials they reuse across applications.

**Scope:**

- Master résumé
- Résumé versions
- Cover note templates
- Saved answers
- STAR stories
- Product leadership stories
- Recruiter outreach templates
- Follow-up templates
- Thank-you templates
- Interview prep guides
- AI drafts and generated artifacts

**Acceptance criteria:**

- User can open one area to manage reusable job-search assets.
- Assets can be referenced by AI+ drafting and extension assist.
- Assets are searchable and organized by type.

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 12. Role Detail Page v1

**Why this matters:** A strong role detail page helps Reqon feel less like a spreadsheet and more like a product.

**Customer value:** Users can make apply/no-apply decisions faster.

**Scope:**

- Job description summary
- Requirements/responsibilities
- Compensation and remote policy
- Fit explanation
- Match gaps
- Source and ATS metadata
- Application status history
- Signals timeline
- Notes
- Follow-up actions
- Related assets/drafts

**Acceptance criteria:**

- Every opportunity has a useful detail view.
- User can see why the role is recommended.
- User can act from the detail page.

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 13. Company Intelligence Page v1

**Why this matters:** Simplify's company pages are strong. Reqon should counter with a more operationally useful company view.

**Customer value:** Users understand whether a company is worth pursuing and what history they have there.

**Scope:**

- Company overview
- Open tracked roles
- Previous applications
- Response history
- Known recruiters/contacts
- Source/ATS metadata
- Company career page URL
- Notes
- Response/ghosting/rejection history from user's own data
- Optional AI/company web context for AI+

**Acceptance criteria:**

- User can see all company-related activity in one place.
- Company view is grounded in the user's own search history first.
- AI/company context is additive, not required.

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 14. Gmail Response Ingest Productization

**Why this matters:** Gmail ingest is a major differentiator if it feels safe and understandable.

**Customer value:** Users do not have to manually update every rejection/interview response.

**Scope:**

- Friendly Gmail setup flow.
- Dry-run preview before applying changes.
- Match confidence explanation.
- Review queue for uncertain emails.
- Signal creation from rejection/interview/offer emails.
- Notification triggers.

**Acceptance criteria:**

- Users can safely test Gmail ingest before enabling automation.
- Confident rejection/interview signals are captured accurately.
- Ambiguous matches are surfaced for review, not silently applied.

**Tier impact:** Local Pro, Cloud, AI+

---

### 15. Notification and Follow-Up Engine v1

**Why this matters:** Missed follow-ups are one of the core pains Reqon should solve.

**Customer value:** Users stay on top of applications without living in the tracker.

**Scope:**

- Follow-up due reminders
- Aging application reminders
- Recruiter response notifications
- Interview prep reminders
- Daily/weekly digest
- In-app notifications
- Email notifications for Cloud
- Optional Slack/SMS/push where available

**Acceptance criteria:**

- Users can configure a basic digest.
- Follow-up due logic is transparent.
- Notifications link back to the relevant role/action.

**Tier impact:** Free/local in-app/file, Cloud/AI+ hosted channels

---

# 7. P2 Post-Launch Differentiators

These are important for making Reqon stronger after the initial launch.

---

### 16. Referral / Contact CRM

**Why this matters:** Simplify has visible referral surfaces. Reqon can differentiate by making relationship management practical and structured.

**Customer value:** Users can track warm intros and recruiter relationships without a separate spreadsheet.

**Scope:**

- Contacts by company
- Recruiters
- Hiring managers
- Alumni/network connections
- Referral requested/received/declined
- Last contacted
- Next follow-up
- Notes
- Source of relationship
- Gmail/LinkedIn/manual entry support where feasible

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 17. Advanced AI+ Workflow Layer

**Why this matters:** AI+ should become more than isolated drafting endpoints. It should be woven into the job-search workflow.

**Customer value:** Users get better decisions and better application artifacts with less effort.

**Scope:**

- Advanced job-fit reasoning
- Resume/JD gap analysis
- Answer drafting from saved narratives
- Cover note drafting
- Interview prep generation
- Recruiter follow-up drafts
- Thank-you drafts
- Company/context research
- Suggested Apply/Skip reasoning
- AI-generated search retrospectives

**Tier impact:** AI+

---

### 18. Source Quality and Company Benchmarks v1

**Why this matters:** Reqon's long-term moat is outcome intelligence.

**Customer value:** Users can see which sources and companies are worth their time.

**Scope:**

- Personal source response rates
- Personal company response rates
- ATS/source conversion trends
- Time-to-response by source/company
- Ghosting rate
- Role family performance
- Resume version performance

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 19. Importers and Migration Paths

**Why this matters:** Many users already have job-search data in spreadsheets, Notion, Huntr, Simplify, Teal, Gmail, or CSVs.

**Customer value:** Users can adopt Reqon without starting over.

**Scope:**

- CSV import
- Generic spreadsheet mapping
- Existing application import
- Basic dedupe/merge
- Gmail backfill of historical outcomes
- Export path for trust

**Tier impact:** Free, Local Pro, Cloud, AI+

---

### 20. Public Benchmark Database / Aggregated Metrics

**Why this matters:** This could become Reqon's biggest strategic moat if enough users opt in.

**Customer value:** Users get market-level insight beyond their personal search.

**Scope:**

- Opt-in anonymized aggregation
- Company response rates
- Time-to-rejection
- Time-to-screen
- Ghosting rates
- Role-family benchmarks
- Seniority-level benchmarks
- Source/ATS benchmarks
- Remote vs hybrid vs onsite response patterns

**Important:** This should not ship until privacy, consent, anonymization, and minimum sample-size protections are strong.

**Tier impact:** Likely Cloud and AI+ first; could expose limited benchmarks to Free/Local Pro

---

# 8. P3 Later Expansion

These are valuable but should not distract from launch.

---

### 21. Services Marketplace / Coaching Layer

Potential services:

- Resume review
- Salary negotiation coaching
- Interview coaching
- Recruiter review
- Product case prep

This can come later. It is not required to validate Reqon's software wedge.

---

### 22. Deep Job Board Replacement

Reqon does not need to become a full public job board at launch. The initial strategy should be company/ATS scout + clipping + workflow intelligence.

A broader job board can come later if source coverage and discovery demand justify it.

---

### 23. Social / Network Graph

Reqon should first build practical contact/referral tracking. A broader network or marketplace is a much larger product and trust challenge.

---

### 24. Enterprise / Outplacement / Career Coach Portal

Longer-term opportunity:

- Coaches managing multiple candidates
- University career centers
- Outplacement firms
- Bootcamps
- Executive search support

Do not prioritize until the single-user/cloud workflow is strong.

---

# 9. Recommended Launch Sequence

## Phase 0 — Stabilize and Package

Goal: Make the product understandable and safe to try.

1. Tier packaging and capability matrix
2. Marketing site positioning refresh
3. Trust/privacy page
4. README alignment
5. Free/local onboarding path
6. Cloud/AI+ entitlement messaging

## Phase 1 — Activation Loop

Goal: Get users from empty state to first value.

1. First-run onboarding
2. Candidate profile setup
3. Scout/source setup UX
4. First scout run
5. Apply Next queue
6. Empty states and next-action cards

## Phase 2 — Command Center

Goal: Make Reqon feel smarter than a tracker.

1. Today view
2. Follow-up due logic
3. Aging applications
4. Recruiter reply review
5. Best new roles
6. Quick actions

## Phase 3 — Signals and Analytics

Goal: Make outcomes measurable.

1. Outcome Signals v1
2. Signal timeline per role
3. Core analytics v1
4. Source/company/role conversion metrics
5. Exportable signal log

## Phase 4 — Connected Surfaces

Goal: Make Cloud valuable and cross-device.

1. Cloud sync foundation
2. Extension setup and clipping/status sync
3. App sync validation
4. Device pairing/token flow
5. Backup/restore confidence

## Phase 5 — Launch Readiness

Goal: Make the product ready for real users.

1. Onboarding QA
2. Scout QA
3. Extension QA
4. Cloud sync QA
5. Data safety QA
6. Pricing/tier QA
7. Demo data and screenshots
8. Beta cohort onboarding

---

# 10. Launch Definition of Done

Reqon is market-launch ready when:

- A non-technical cloud user can sign up, configure a search, run scout, use the board, install/use the extension, and see synced data.
- A technical/free user can run the local product and get real value without paying.
- The product clearly communicates Free, Local Pro, Cloud, and AI+.
- The Today view tells users what to do next.
- Outcome signals are captured and visible in analytics.
- Extension clipping/status sync is reliable.
- AI+ features are reviewable, editable, and clearly optional.
- Privacy/trust messaging is public and specific.
- The product can be demoed in less than five minutes.
- The homepage makes the differentiation obvious.

---

# 11. Messaging to Anchor the Roadmap

Use this as a product strategy anchor:

> Reqon is not built to maximize application volume. It is built to maximize search quality, follow-through, and learning. It helps serious candidates find better opportunities, prioritize what is worth their time, track every signal, and understand what is actually working.

Potential headline:

> **Run your job search like a command center.**

Potential subheadline:

> Reqon finds roles from company career pages, ranks what is worth your time, keeps every application moving, and tracks the signals that show what is actually working.

Potential competitive line:

> Autofill helps you apply faster. Reqon helps you decide where to apply, what to do next, and how your search is performing.

---

# 12. Practical Next Steps

Recommended immediate repo work:

1. Add this file under `docs/market-launch-value-roadmap.md`.
2. Update `README.md` with the four-tier model.
3. Add a pricing/tier section to the marketing site.
4. Create issues/epics for the P0 Launch Gate items.
5. Create a visible project board with a snap-line column:
   - Pre-Launch Gate
   - Launch Accelerator
   - Post-Launch Differentiator
   - Later Expansion
6. Start the next implementation sprint with:
   - Tier packaging
   - First-run onboarding
   - Today command center
   - Outcome Signals v1

