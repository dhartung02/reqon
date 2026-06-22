# Reqon Clip — extension improvement plan

The extension's edge over Simplify: it **syncs to a board you own**. Anything Simplify shows on a
posting, Reqon Clip can show *and* write back to your self-hosted pipeline. This plan grows the
extension from "clip + overlay + fill" into a board-synced apply cockpit.

## Data sources (all already exist)

- `GET /api/reqs` — every requisition (tier, fit, prob, status, dates, link). Powers analytics.
- `GET /api/profile` — applicant fields, saved answers, and **`keywords`** (resume-derived
  `{kw, weight}`, the same set the scout scores on). Powers fill + keyword coverage.
- `GET /api/health` — liveness/row count.
- `POST /api/reqs/quickadd` — clip. `PATCH /api/reqs/:key` — status writes.

All server I/O goes through `bg.js` (the only context with host permissions). The side panel and
content script message `bg.js`; they never fetch the server directly.

## Phase 1 — Side panel + analytics + this-page record ✅ (built)

- `chrome.sidePanel` (MV3, Chrome 114+) — a persistent sidebar, opened from the popup.
- **Analytics** computed from `/api/reqs`: totals, tier mix (A/B/C), status buckets, applied this
  week, average EV, and a ranked "top opportunities to apply" action list (highest-EV, not yet
  applied). Same data your in-app AnalyticsScreen uses — no new infra.
- **This page**: the current tab's tracked record (tier/fit/prob/EV/status) or a Clip button, plus
  an **⚡ Autofill standard fields** button that fills factual fields + matching saved answers on the
  open posting (messages the page's content script; same engine as the overlay's Fill, works even
  when the overlay is hidden). Never touches passwords/EEO/consent; never submits.
- `bg.js` gains a `reqs` message returning all rows (reuses the 60s cache).

## Phase 2 — JD keyword coverage ✅ (built)

Simplify-style "your resume has X of N keywords", board-synced:

- Content script extracts the job-description text from the page and tokenizes it (reusing the
  `_tokenize` stopword logic in `lib.js`).
- Ranks the JD's salient terms, intersects them with your **resume keywords** (`profile.keywords`).
- Shows coverage % + the **missing** keywords (actionable: terms in the JD not in your resume).
- **Caveat (accuracy):** JD text extraction is per-site and heuristic (Greenhouse/Ashby/Lever/
  LinkedIn differ); coverage is a guide, not a grade. It compares against resume-derived keywords,
  not the full resume text.

## Phase 3 — AI assist + consumption monitor ✅ (built)

Uses the OpenAI integration already in `server.js` (`openaiChat` → `/v1/chat/completions`, model
`OPENAI_MODEL`/`gpt-5.4-mini`, `/api/assist`, daily cap, per-call token logging).

- **AI draft for open-ended questions** — side-panel card: pick kind (reusable answer / screening /
  cover), paste the question, Draft. The page's JD (via the `jdText` content message) and the tracked
  role ground it; the server drafts **only from your narrative library**. Shows the draft + Copy +
  token/call count. Human-in-the-loop; **never auto-submits**.
- **Consumption monitor** — new `GET /api/assist/usage` aggregates the token log: calls today vs
  cap, tokens today / 7d / 30d, model, and — when you set `OPENAI_PRICE_PER_1M` — a $ estimate and
  (with `ASSIST_MONTHLY_BUDGET`) a budget bar. Links to the OpenAI dashboard.
- **Budget reality (honest):** OpenAI does **not** expose your remaining credit balance via the API
  key (old `dashboard/billing` endpoints are browser-session-only). So cost is *estimated* from
  measured tokens × a rate you supply; the authoritative balance stays on platform.openai.com/usage.
  We never hardcode a model price.

### Still deferred
- **Resume / cover tailoring** (suggestions, not rewrites) — higher effort, separate go/no-go.
- Splitting prompt/completion token pricing (the API returns total tokens; we estimate blended).

## Phase 4 — Responses API + interview prep guide ✅ (built)

- **Responses API migration** — `openaiChat()` now calls `/v1/responses` (instructions/input,
  `output_text` parse, `input`+`output` token usage). Backward-compatible `{content, tokens}`;
  accepts `tools` for built-in tools + function calling, returns `toolCalls`. `OPENAI_USE_CHAT=true`
  falls back to `/chat/completions`. This unlocks web_search / file_search / structured outputs.
- **Interview prep guide** — auto-generated the first time a role enters an interview stage
  (Recruiter Screen / Hiring Manager / Panel / Offer), via BOTH the board's whole-state `PUT` and the
  per-row `PATCH`. Grounded in the candidate's narratives + the role's JD; stored as Markdown in
  `agent/interview-guides/` and attached to the row via `guideAt`. Served as a styled page at
  `GET /api/reqs/:key/guide`; force-rebuild via `POST`. Board card shows **📋 Interview guide** (or
  **Generate guide**). New data-model field: `guideAt` (ISO timestamp).
- **Mail-ingest trigger** — `mail_ingest.py` already *detected* interview emails (review-only). It
  now ALSO advances a confident, single-match, still-"Applied" row to **Recruiter Screen** (gated by
  `--no-advance-interviews`), which fires the guide build server-side. Offers stay review-only.
- **High-value tool wired:** the guide generator passes the `web_search` tool when
  `ASSIST_WEB_SEARCH=true` (current company context). Function-calling capability is in `openaiChat`;
  wiring it into structured autofill/scoring + file_search grounding of narratives are the next steps.

## Guardrails (unchanged)

- Apply-assist fills factual fields + matching saved answers only — never passwords / EEO / consent,
  and **never submits**.
- Overlay is opt-out (`overlayEnabled`). The side panel is opened explicitly.
- Branding: Reqon "Emerald Command" palette (emerald `#00DF8F`, lime `#C8FF49`, obsidian).
