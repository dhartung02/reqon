# Reqon Clip — Chrome Companion (WP-1)

A desktop companion for the self-hosted Reqon board: **clip** a posting, see a **fit/EV overlay**,
**autofill** applications from your profile + saved answers, **draft** open-ended answers with AI,
**score** roles, open **interview prep guides**, and a board-synced **analytics side panel** — all
writing back to your board so it stays current without manual bookkeeping. **Apply-assist fills
factual fields + matching saved answers only — never passwords / EEO / consent, and never
submits.** (You review, then submit yourself.)

## Install (unpacked)
1. Chrome → `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `extension/` folder.
3. Click the extension's **Details → Extension options** (or right-click the toolbar icon →
   Options) and set:
   - **Server origin** — `http://localhost:8787` (local), or your tunnel's HTTPS URL.
   - **Access token** — your **APP_TOKEN** (full access; status write-back uses `PATCH`, which
     the scoped ingest token can't reach).
   - **Test connection** should report the board row count.

Supported boards (where the overlay + apply-assist inject): Greenhouse · Ashby · Lever · LinkedIn ·
Simplify · Workable · SmartRecruiters · Recruitee · Teamtailor · Personio.

## Use
- **Clip** — toolbar icon clips the current tab to the board (works on any site via `activeTab`);
  the server auto-enriches it. Re-clipping a posting you already track reports "Already tracked."
- **Overlay** — a small panel shows tier · fit · prob · EV · status if the posting is tracked, or a
  **Clip** button if not. Tracked rows get **✓ Mark applied**; interview-stage rows get
  **📋 Interview guide / Generate**. Toggle the overlay off in the popup/options if you don't want it.
- **Autofill** — fills factual fields (name / email / phone / LinkedIn / GitHub / location / website)
  from your profile and inserts matching **saved answers**; the side panel's **⚡ Autofill** adds an
  AI pass (`map_fields`) for fields the keyword matcher misses (≥0.6 confidence). Everything is
  highlighted; **EEO / consent / passwords are never touched and nothing is submitted.**
- **Offline** — if the server is unreachable, clips and status updates queue locally and flush
  automatically (≈1 min) once it's back.

## Side panel (Chrome 116+)
Open from the popup → **📊 Open analytics sidebar**:
- **Pipeline analytics** — tier mix, status buckets, applied-this-week, avg EV, top opportunities.
- **This page** — tracked record or Clip, status dropdown, **✨ Score with AI** (apply to board),
  **⚡ AI-assisted autofill**, and the interview guide for interview-stage roles.
- **Keyword coverage** — résumé↔JD keyword match, with **Suggest how to close the gaps** (tailoring).
- **AI assist** — draft a cover note / screening / reusable answer; **Insert into page** or **Copy**.
- **AI usage** — calls vs cap, tokens (today / 7d / 30d), $ estimate + budget bar (if a rate is set).

AI features require an OpenAI key configured on the board (see the repo's Configuration).

## Privacy / scope
- Talks **only** to the origin you configure (default `localhost`); requests host permission for
  any non-default origin you set. AI calls go through the board (which holds the key) — the extension
  never calls OpenAI directly. Fill never touches passwords / EEO / consent and never submits.

## Dev notes
- `lib.js` (`postingId` / `reqKey` / `sameReq` / `matchRow` / `bestAnswerMatch`) is kept identical to
  `server.js` and unit-tested: `node --test extension/tests/*.test.js`.
- `bg.js` is the only network surface (API client + 60s row cache + offline queue, plus assist /
  score / map-fields / set-status / guide proxies); `content.js` is the overlay + apply-assist + JD
  extraction; `sidepanel.*` is the side panel; `popup.*` and `options.*` are config.
