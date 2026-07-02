# Reqon Market Launch Snap Line + Career Graph Implementation Plan

## Purpose

This document updates the Reqon market-launch snap line to include **Reqon Career Graph** as a first-class launch differentiator.

Reqon is not only a job application tracker. Reqon should become a job search intelligence platform that helps users discover, evaluate, track, and act on opportunities directly from company career sites and supported ATS boards.

Career Graph gives Reqon a differentiated discovery layer that goes beyond the major job boards.

---

# 1. Updated Product Positioning

## Core positioning

Reqon helps job seekers discover better-fit roles, track every opportunity, and use AI-assisted workflows to apply with more confidence and less chaos.

## Expanded positioning with Career Graph

Reqon builds a living Career Graph of company hiring activity, helping users find direct-from-company opportunities organized by company, vertical, and role type.

Instead of only tracking jobs users already found, Reqon can also identify companies worth watching, discover their career boards, index their open reqs, and surface relevant roles before they get buried on larger job boards.

## Customer-facing language

> Go beyond job boards. Reqon tracks company career sites directly, organizes opportunities by industry and role type, and helps you discover better-fit roles from the source.

## Internal language

Internally this can be described as a crawler-backed company/job intelligence database.

Externally avoid leading with “crawler.” Use:

- Reqon Career Graph
- Direct-from-company job discovery
- Hidden jobs feed
- Company hiring intelligence
- Career site intelligence

---

# 2. Updated Market Launch Snap Line

The snap line separates what should be completed before going to market from what can ship after launch as iterative updates.

## Must Ship Before Market Launch

These items materially affect the launch story, customer value, and product completeness.

### 1. Core Pipeline and Board Experience

Reqon must feel reliable as a job search command center.

Required before launch:

- Stable job application board
- Job status lanes
- Saved jobs
- Applied jobs
- Interview / recruiter / offer tracking
- Notes and metadata
- Job detail view
- Manual add/edit
- Search/filter
- Basic analytics
- Export/backup path

### 2. Scout Search Foundation

Reqon needs a credible discovery workflow even before Career Graph is fully mature.

Required before launch:

- Scout search across supported boards / ATS sources already in the product
- Deterministic source handling where possible
- Ability to add Scout results to the board
- Basic duplicate handling
- Clear source attribution

### 3. Reqon Career Graph MVP

Career Graph should be included before launch because it is one of the strongest differentiators.

Required before launch:

- Company model
- Vertical model
- Career source model
- Job model
- Crawl run model
- First seen / last seen / job status tracking
- Manual company seed import
- Manual career source entry
- Greenhouse adapter
- Lever adapter
- Ashby adapter
- Jobs Explorer page
- Company Directory page
- Vertical browse/filter support
- Add discovered job to pipeline
- Basic crawler health/status
- Safe crawling guardrails

This gives Reqon the ability to say:

> Reqon helps users find jobs directly from company career sites, grouped by company, vertical, and role type — not just manage jobs they already found elsewhere.

### 4. Spider-Web Discovery Loop

This should be part of the Career Graph MVP or immediate launch candidate because it turns normal user activity into Career Graph growth.

Required before launch if feasible:

- When a user adds or imports a job, extract the company domain/name.
- Check whether the company already exists in Career Graph.
- If not, create a pending company record.
- Attempt to resolve the company website and career source.
- If a supported ATS/career source is found, queue a crawl.
- Store discovered jobs for that company.
- Let the user browse “other open roles at this company.”

Example:

- User adds a Microsoft Product Manager role from a LinkedIn email.
- Reqon detects Microsoft as the company.
- Reqon checks Career Graph for Microsoft.
- Reqon discovers or uses the Microsoft careers source.
- Reqon indexes additional Microsoft roles.
- User can view other Microsoft roles by function, location, and role type.

This creates a compounding loop:

> Every job added to Reqon can become a lead into a broader company hiring map.

### 5. Chrome Extension MVP

The extension is important because it connects discovery to action.

Required before launch:

- Capture job from job pages
- Send job to Reqon board
- Basic field mapping
- Source URL capture
- Company/title/location extraction
- Works on the highest-priority job pages / ATS surfaces

### 6. Cloud Offering Foundation

Reqon Cloud is important for commercial launch.

Required before launch:

- Hosted environment
- Domain setup
- Basic auth/session handling
- Cloud data persistence
- Web board available remotely
- Extension/app sync story
- Environment configuration documented
- Clear separation between Free, Local Pro, Cloud, and AI+

### 7. AI+ MVP

AI+ should be valuable but not required for the core system to work.

Required before launch:

- AI fit analysis
- AI answer draft / application assist
- AI job summary
- AI autofill/mapping where already supported
- Clear user review step
- No auto-submit
- Model selection/config where useful

### 8. Launch-Ready UX / Onboarding

Required before launch:

- First-run setup
- Tier explanation
- Empty states
- Import/export guidance
- Basic docs
- Product preview / marketing copy
- Clear “what Reqon does” story that avoids jargon like CRM for non-technical users

---

## Can Ship After Market Launch

These are valuable but do not need to block launch.

### Career Graph Enhancements

- Automated broad company discovery
- More ATS adapters
- Career page detection from homepage
- Company following
- Saved searches
- New-job alerts
- Hiring velocity trends
- Company growth/shrink signals
- Duplicate role clustering across job boards and company sites
- Role change detection
- Job description change tracking
- Salary extraction
- Company-level hiring trend charts
- Public SEO pages by role/vertical/company

### AI+ Enhancements

- Resume-to-role fit scoring at scale
- AI-generated target company recommendations
- AI-generated search expansions
- AI-generated vertical research
- AI matching from saved preferences
- AI career strategy recommendations
- Interview prep generated from company/job context

### Signal Intelligence

- User rejection signal
- Recruiter screen signal
- Hiring manager signal
- Offer signal
- No-response signal
- Company response-rate metrics
- Role/vertical funnel benchmarks
- Time-to-response metrics
- Company-specific user outcome trends

### Advanced Cloud Features

- Shared cloud Career Graph
- Per-user overlays for saved/ignored/applied jobs
- Team/workspace support
- Public/private data separation
- Notification preferences
- Usage metering
- Billing integration

---

# 3. Career Graph Product Definition

## Product name

Reqon Career Graph

## Product summary

Reqon Career Graph is a public-source job intelligence layer that indexes company career sites and supported ATS boards to help users discover direct-from-company opportunities by vertical, company, and role type.

## Product principles

- Deterministic first, AI-enriched later.
- Public career pages only.
- Do not bypass login, captcha, authentication, or anti-bot protections.
- Respect robots.txt and rate limits.
- Prefer official/public ATS endpoints and predictable career board structures.
- Store source attribution and timestamps.
- Crawl conservatively.
- Let users review, save, ignore, and apply manually.
- Never auto-apply.
- Use AI to enrich and personalize, not as the source of truth.

---

# 4. Career Graph Growth Loops

Career Graph should grow from multiple sources, not only manual seed lists.

## Source 1: Curated seed company list

Start with hand-picked companies by vertical.

Example verticals:

- Martech
- B2B SaaS
- Healthcare Data
- Fintech
- AI Infrastructure
- Developer Tools
- Data Infrastructure
- Cybersecurity
- HR Tech
- E-commerce
- Insurance
- Banking

Seed fields:

- Company name
- Website URL
- Vertical
- Careers URL
- ATS provider
- Tags

## Source 2: User-submitted jobs

When a user manually adds a job or imports one through the extension/app, Reqon should extract company information and use it to expand Career Graph.

Example:

- User adds an eBay engineering role.
- Reqon extracts company = eBay.
- Reqon checks whether eBay exists in Career Graph.
- If not, Reqon creates a pending company record.
- Reqon resolves eBay.com and looks for career sources.
- Reqon crawls supported career sources.
- Reqon indexes all available eBay roles.

## Source 3: Jobs discovered from external boards

When Reqon sees a role from LinkedIn email, Google Jobs, Indeed, Simplify, Wellfound, or another job board source, it can use the company as a discovery seed.

Example:

- LinkedIn email includes a Microsoft Product Manager role.
- User adds the role to Reqon.
- Reqon detects Microsoft as the company.
- Reqon finds or confirms Microsoft’s career site.
- Reqon indexes additional Microsoft roles.
- User sees “other open roles at Microsoft.”

## Source 4: User target companies

Users can enter companies they want to watch.

Example:

- User follows Klaviyo, Braze, HubSpot, Databricks, and Snowflake.
- Reqon prioritizes these companies for more frequent crawls.
- New matching roles appear in the Hidden Jobs feed.

## Source 5: Existing pipeline companies

Every company already present in the user’s pipeline becomes a potential Career Graph seed.

Reqon can ask:

- Do we know this company’s career source?
- Do we have its vertical?
- Do we have other open roles?
- Should this company be watched?

---

# 5. Spider-Web Discovery Product Flow

## Flow name

Company Expansion from Job Ingestion

## Trigger events

Career Graph expansion should be triggered when:

- User manually adds a job
- User clips a job from the browser extension
- User imports a job from email
- User imports a job from a job board
- Scout discovers a job
- User follows a company
- User uploads/imports a list of target companies

## Flow steps

1. Job enters Reqon.
2. Reqon extracts company name, source URL, job title, location, and job board source.
3. Reqon normalizes company name.
4. Reqon attempts to match the company to an existing company record.
5. If no company exists, Reqon creates a pending company record.
6. Reqon resolves the company website.
7. Reqon attempts to discover a careers URL.
8. Reqon attempts to detect ATS provider.
9. If confidence is high, Reqon creates a career source and queues a crawl.
10. If confidence is medium/low, Reqon marks the source for review.
11. Crawler fetches public open roles.
12. Jobs are normalized and added to the Career Graph.
13. User sees other roles at that company.

## User-facing result

After adding a job, Reqon can show:

> Reqon found 42 other open roles at Microsoft, including 7 Product roles and 3 AI-related roles.

Potential CTAs:

- View other roles at this company
- Follow this company
- Add matching roles to review queue
- Ignore this company
- Run fit analysis on matching roles

---

# 6. Data Model

## verticals

```ts
Vertical {
  id: string
  name: string
  description?: string
  parent_vertical_id?: string
  tags: string[]
  created_at: string
  updated_at: string
}
```

## companies

```ts
Company {
  id: string
  name: string
  normalized_name: string
  website_url?: string
  careers_url?: string
  ats_provider?: string
  ats_board_token?: string
  vertical_id?: string
  industry?: string
  sub_industry?: string
  company_size?: string
  headquarters?: string
  country?: string
  tags: string[]
  source: "manual" | "seed" | "job_ingestion" | "crawler" | "import" | "ai_enriched"
  discovery_status: "pending" | "verified" | "needs_review" | "rejected"
  confidence_score?: number
  created_at: string
  updated_at: string
  last_crawled_at?: string
  crawl_status?: "pending" | "success" | "failed" | "blocked" | "unsupported"
}
```

## career_sources

```ts
CareerSource {
  id: string
  company_id: string
  source_url: string
  source_type: "careers_page" | "ats_json" | "ats_html" | "sitemap" | "manual" | "discovered"
  ats_provider?: string
  board_token?: string
  priority: number
  enabled: boolean
  confidence_score?: number
  review_status: "approved" | "pending" | "rejected"
  last_success_at?: string
  last_failure_at?: string
  failure_count: number
  created_at: string
  updated_at: string
}
```

## jobs

```ts
Job {
  id: string
  company_id: string
  external_job_id?: string
  source_url: string
  apply_url?: string
  title: string
  normalized_title?: string
  role_family?: string
  role_subfamily?: string
  seniority?: string
  department?: string
  location?: string
  remote_type?: "remote" | "hybrid" | "onsite" | "unknown"
  employment_type?: string
  salary_min?: number
  salary_max?: number
  salary_currency?: string
  description_text?: string
  description_hash?: string
  status: "open" | "closed" | "stale" | "unknown"
  first_seen_at: string
  last_seen_at: string
  last_changed_at?: string
  posted_at?: string
  vertical_id?: string
  tags: string[]
  ats_provider?: string
  raw_payload?: object
  source_type: "career_graph" | "user_submitted" | "job_board" | "extension" | "email" | "scout"
  created_at: string
  updated_at: string
}
```

## crawl_runs

```ts
CrawlRun {
  id: string
  company_id?: string
  career_source_id?: string
  source_type: "company" | "vertical" | "ats_provider" | "discovery" | "job_ingestion"
  started_at: string
  completed_at?: string
  status: "running" | "success" | "partial" | "failed"
  jobs_found: number
  jobs_created: number
  jobs_updated: number
  jobs_closed: number
  error_message?: string
  metadata?: object
}
```

## company_discovery_events

This table is useful for tracking spider-web growth.

```ts
CompanyDiscoveryEvent {
  id: string
  company_id?: string
  source_job_id?: string
  trigger_type: "manual_job_add" | "extension_clip" | "email_import" | "job_board_import" | "scout_result" | "follow_company" | "seed_import"
  raw_company_name?: string
  normalized_company_name?: string
  source_url?: string
  resolved_website_url?: string
  discovered_careers_url?: string
  detected_ats_provider?: string
  confidence_score?: number
  status: "created_company" | "matched_existing" | "needs_review" | "failed" | "ignored"
  created_at: string
}
```

---

# 7. Technical Architecture

```text
Job Ingestion / Seed Company / User Follow
        ↓
Company Extractor
        ↓
Company Matcher
        ↓
Company Resolver
        ↓
Career Source Detector
        ↓
ATS Adapter Router
        ↓
Job Fetcher
        ↓
Job Normalizer
        ↓
Deduper / Change Detector
        ↓
Career Graph Database
        ↓
Jobs Explorer / Company Pages / Hidden Jobs Feed
        ↓
Add to Pipeline / AI Fit / Follow / Ignore
```

---

# 8. Backend Module Plan

Recommended structure:

```text
server/
  careerGraph/
    index.js
    companies.js
    verticals.js
    jobs.js
    careerSources.js
    discoveryEvents.js
    matchCompany.js
    resolveCompany.js
    extractCompanyFromJob.js
    classifyJob.js
  crawler/
    index.js
    queue.js
    scheduler.js
    robots.js
    fetcher.js
    detector.js
    normalizer.js
    dedupe.js
    enrichment.js
    adapters/
      greenhouse.js
      lever.js
      ashby.js
      smartrecruiters.js
      workable.js
      teamtailor.js
      recruitee.js
      workday.js
      genericHtml.js
  routes/
    careerGraph.js
    companies.js
    jobs.js
    crawler.js
    verticals.js
```

---

# 9. API Plan

## Career Graph dashboard

```http
GET /api/career-graph/summary
```

Returns:

- company count
- career source count
- open job count
- new jobs this week
- jobs closed this week
- top verticals
- crawl health

## Company APIs

```http
GET /api/companies
GET /api/companies/:id
POST /api/companies
PATCH /api/companies/:id
POST /api/companies/import
GET /api/companies/:id/jobs
POST /api/companies/:id/follow
DELETE /api/companies/:id/follow
POST /api/companies/:id/discover-careers
POST /api/companies/:id/crawl
```

## Job APIs

```http
GET /api/jobs
GET /api/jobs/:id
POST /api/jobs/:id/add-to-pipeline
POST /api/jobs/:id/ignore
POST /api/jobs/:id/analyze-fit
POST /api/jobs/ingest
```

## Job ingestion endpoint

This is important for the spider-web loop.

```http
POST /api/jobs/ingest
```

Input:

```json
{
  "title": "Principal Product Manager",
  "companyName": "Microsoft",
  "sourceUrl": "https://www.linkedin.com/jobs/view/...",
  "location": "Remote",
  "descriptionText": "...",
  "sourceType": "job_board"
}
```

Expected behavior:

1. Save/import the job.
2. Extract and normalize company.
3. Match or create company.
4. Queue company/career discovery.
5. If career source is known, queue crawl.
6. Return the saved job plus company discovery status.

## Vertical APIs

```http
GET /api/verticals
GET /api/verticals/:id
GET /api/verticals/:id/companies
GET /api/verticals/:id/jobs
```

## Crawler APIs

```http
POST /api/crawler/run
POST /api/crawler/run/company/:companyId
POST /api/crawler/run/source/:sourceId
GET /api/crawler/runs
GET /api/crawler/runs/:id
GET /api/crawler/status
POST /api/crawler/sources/:id/disable
POST /api/crawler/sources/:id/retry
```

---

# 10. Initial ATS Adapter Priority

MVP adapters:

1. Greenhouse
2. Lever
3. Ashby

Next adapters:

4. SmartRecruiters
5. Workable
6. Teamtailor
7. Recruitee
8. Workday basic
9. Personio
10. iCIMS basic

---

# 11. Deduping Strategy

Deduping should use the strongest identifiers first.

Priority:

1. company_id + ats_provider + external_job_id
2. company_id + source_url
3. company_id + normalized title + normalized location
4. company_id + title + description_hash

Repeated crawls should never create duplicates.

Status handling:

```text
Seen in crawl: open, update last_seen_at
Missing from 1 crawl: keep open, increment missing_count
Missing from 2 crawls: mark stale
Missing from 3 crawls: mark closed
Seen again after stale/closed: reopen and update last_seen_at
```

---

# 12. Crawl Scheduling Strategy

## Priority rules

High-priority companies:

- Followed by user
- Has matching role families
- Recently added by user
- Recently changed
- In user target vertical

Crawl every 6–12 hours.

Normal companies:

- Seeded but not followed
- Stable history

Crawl every 24–72 hours.

Low-confidence or inactive companies:

- Repeated failures
- No jobs historically
- Low relevance

Crawl weekly or require review.

## Failure backoff

```text
Failure 1: retry in 1 hour
Failure 2: retry in 6 hours
Failure 3: retry in 24 hours
Failure 4+: disable source or require review
```

---

# 13. UX Plan

## Career Graph dashboard

Show:

- Companies indexed
- Career boards tracked
- Open jobs indexed
- New jobs this week
- Recently removed jobs
- Top hiring verticals
- Top role families
- Crawler health

## Company Directory

Filters:

- Vertical
- ATS provider
- Open job count
- Product jobs
- AI jobs
- Remote jobs
- Last crawled
- Crawler status

Actions:

- View company
- View jobs
- Follow
- Crawl now
- Ignore

## Jobs Explorer

Filters:

- Keyword
- Company
- Vertical
- Role family
- Seniority
- Location
- Remote/hybrid/onsite
- First seen
- Last seen
- Source
- Saved/not saved

Actions:

- View job
- Open source
- Add to pipeline
- Analyze fit
- Ignore

## Company detail page

Show:

- Company metadata
- Vertical
- Website
- Careers URL
- ATS provider
- Open jobs
- Product jobs
- AI jobs
- Recently added jobs
- Recently removed jobs
- Crawl history
- User’s existing pipeline items for that company

## Post-ingestion discovery panel

After a job is added, show something like:

```text
Reqon found this company in Career Graph.

Company: Microsoft
Career source: careers.microsoft.com
Open roles found: 1,247
Product roles: 43
AI-related roles: 88
Remote/hybrid roles: 312

Actions:
- View other roles
- Follow Microsoft
- Run fit analysis
- Ignore company
```

If discovery is pending:

```text
Reqon is checking whether this company has a public career source that can be tracked.
```

If unsupported:

```text
Reqon found the company but does not currently support this career source.
```

---

# 14. Agent Implementation Plan

## PR 1: Career Graph schema and storage foundation

Build:

- verticals
- companies
- career_sources
- jobs
- crawl_runs
- company_discovery_events
- seed import support
- basic CRUD APIs
- tests

Acceptance criteria:

- Can create companies and verticals.
- Can import seed companies.
- Can list companies by vertical.
- Can store career source metadata.
- Can store jobs without crawling.
- Can record crawl runs.

## PR 2: Career Graph dashboard and browser shell

Build:

- Career Graph dashboard page
- Company Directory
- Jobs Explorer
- Company Detail
- Vertical Detail
- Empty states
- Mock/seed data rendering

Acceptance criteria:

- User can browse companies.
- User can browse jobs.
- User can filter by vertical/company/role family where data exists.

## PR 3: Job ingestion spider-web foundation

Build:

- /api/jobs/ingest endpoint
- company extraction from submitted jobs
- company name normalization
- existing company matching
- pending company creation
- company_discovery_events logging
- queue discovery job stub

Acceptance criteria:

- Adding a job with companyName creates or matches a company.
- Discovery event is logged.
- Company is available in Career Graph after job ingestion.
- No duplicate company is created for simple name variations.

## PR 4: Company resolver and career source detector

Build:

- Website resolver
- Homepage fetcher
- Careers link scanner
- ATS URL detector
- Confidence scoring
- pending review status
- fixture tests

Acceptance criteria:

- Given a company website, system can identify likely career links.
- Given common ATS URLs, system detects provider.
- Low-confidence detections are marked pending review.

## PR 5: Crawler framework

Build:

- crawler queue
- fetcher
- adapter interface
- adapter router
- normalizer shell
- dedupe/upsert shell
- crawl run logger
- manual crawl endpoints

Acceptance criteria:

- Can queue a crawl for a company/source.
- Crawl run is logged.
- Unsupported source produces clear status.
- Errors are captured cleanly.

## PR 6: Greenhouse adapter

Build:

- Greenhouse detection
- public jobs fetch
- job normalization
- upsert/dedupe
- missing job handling
- tests with fixtures

Acceptance criteria:

- Can crawl a Greenhouse company source.
- Jobs are saved in normalized schema.
- Re-running crawl does not duplicate jobs.
- Removed jobs eventually become stale/closed.

## PR 7: Lever adapter

Build:

- Lever detection
- public jobs fetch
- job normalization
- upsert/dedupe
- tests with fixtures

Acceptance criteria:

- Same as Greenhouse for Lever.

## PR 8: Ashby adapter

Build:

- Ashby detection
- public jobs fetch
- job normalization
- upsert/dedupe
- tests with fixtures

Acceptance criteria:

- Same as Greenhouse for Ashby.

## PR 9: Jobs Explorer filters and pipeline conversion

Build:

- Search/filter APIs
- UI filters
- Add to pipeline action
- Ignore job action
- Saved/not saved state

Acceptance criteria:

- User can browse open Career Graph jobs.
- User can filter by company, vertical, role family, location, remote status, and freshness.
- User can add a discovered job to the Reqon pipeline.

## PR 10: Deterministic classification

Build:

- Role family classifier
- Product subtype classifier
- Seniority classifier
- Remote classifier
- Department normalization

Acceptance criteria:

- Product, Engineering, Sales, Marketing, Customer Success, Design, Data, Ops, Finance, Legal, HR roles are classified.
- Product roles are classified into subtypes where possible.
- Seniority is derived from title keywords.
- Remote/hybrid/onsite is derived from title/location/description.

## PR 11: Follow companies and hidden jobs feed

Build:

- follow company
- unfollow company
- hidden jobs feed
- new jobs since last visit
- matching jobs for followed companies

Acceptance criteria:

- User can follow companies.
- Reqon prioritizes followed companies.
- User can view new jobs from followed companies.

## PR 12: AI+ enrichment hook

Build:

- optional enrichment queue
- AI job summary hook
- AI fit score hook
- skills extraction hook
- user review-only output

Acceptance criteria:

- Core crawler works without AI.
- AI enrichment can be run on selected jobs.
- AI results are stored separately from source-of-truth job data.

---

# 15. Copyable Agent Prompt

```text
We are adding Reqon Career Graph as a major product differentiator.

Context:
Reqon is a job search command center with a board, scout/search, Chrome extension, local/cloud tiers, and optional AI+ capabilities. Career Graph should let Reqon build a proprietary database of company career sites and open jobs organized by vertical, company, and job type.

Important product principle:
This is an ethical, public-source crawler. It must not bypass logins, captchas, Cloudflare, authentication, robots.txt, or anti-bot protections. It should prefer public ATS endpoints and predictable public career pages. It should store source attribution and timestamps. It should never auto-apply.

Core feature:
Build a Career Graph that stores:
- verticals
- companies
- career_sources
- jobs
- crawl_runs
- company_discovery_events

It should support these discovery sources:
1. Curated seed companies.
2. User-submitted jobs.
3. Jobs imported from job boards or emails.
4. Jobs clipped through the browser extension.
5. Companies followed by users.
6. Existing companies already present in the user's pipeline.

Spider-web discovery loop:
When a job is added to Reqon, extract the company name and source URL. Match or create a company record. Attempt to resolve the company website and discover its public career source. If a supported ATS/career source is found, queue a crawl. Store all discovered open roles for that company. Let the user view “other open roles at this company.”

Example:
A LinkedIn email contains a Microsoft Product Manager role. The user adds it to Reqon. Reqon detects Microsoft, finds or confirms Microsoft's career site, indexes other Microsoft roles, and lets the user browse other Microsoft openings by role type, location, and freshness.

MVP requirements:
- Data models and persistence for Career Graph objects.
- APIs for companies, verticals, jobs, career sources, crawl runs, and job ingestion.
- Manual seed import.
- Job ingestion endpoint that triggers company discovery.
- Company matching and normalization.
- Career source detector.
- Crawler framework with adapter interface.
- First adapters: Greenhouse, Lever, Ashby.
- Jobs Explorer UI.
- Company Directory UI.
- Company Detail UI.
- Add discovered job to pipeline.
- Basic crawler health/status.
- Deduping and first_seen/last_seen/status handling.

Build in PR-sized slices:
1. Schema/storage/API foundation.
2. UI shell for Career Graph dashboard, Company Directory, Jobs Explorer, Company Detail, Vertical Detail.
3. Job ingestion spider-web foundation.
4. Company resolver and career source detector.
5. Crawler framework.
6. Greenhouse adapter.
7. Lever adapter.
8. Ashby adapter.
9. Jobs Explorer filters and add-to-pipeline.
10. Deterministic role/seniority/remote classification.
11. Follow companies and Hidden Jobs feed.
12. Optional AI+ enrichment hooks.

Acceptance criteria for the first milestone:
- I can seed 25 companies across several verticals.
- I can manually add/import a job and have Reqon create or match the company.
- Reqon can crawl Greenhouse, Lever, and Ashby career boards.
- Jobs are normalized into one schema.
- Jobs can be searched by company, vertical, and role type.
- A discovered job can be added to the Reqon pipeline.
- Crawl runs are logged and debuggable.
- Repeated crawls do not create duplicate jobs.
- Removed jobs eventually become stale/closed.
```

---

# 16. Launch Narrative

Reqon launch messaging should emphasize this as a product advantage:

> Most job tools help you organize jobs after you find them. Reqon helps you discover direct-from-company opportunities, understand where companies are hiring, and turn those roles into a managed application pipeline.

Even stronger:

> Reqon does not just track your job search. It builds a living map of where opportunities are opening across the companies and industries you care about.

