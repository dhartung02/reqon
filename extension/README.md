# Job Pipeline CRM — Chrome Companion (WP-1)

A desktop companion: **clip** a posting, see a **fit/EV overlay** on the page, **fill the
application** from your Reqon profile + saved answers, and **write Applied status back** to your
self-hosted CRM — so the board stays current without manual bookkeeping. **Apply-assist fills
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

## Use
- **Clip** — toolbar icon clips the current tab to the CRM (works on any site via `activeTab`);
  the server auto-enriches it. Re-clipping a posting you already track reports "Already tracked."
- **Overlay** — on supported boards (Greenhouse / Ashby / Lever / LinkedIn jobs / simplify.jobs)
  a small panel shows tier · fit · prob · EV · status if the posting is tracked, or a **Clip**
  button if not. Tracked + not-yet-applied rows get a **✓ Mark applied (today)** button.
- **Fill** — the overlay's **✎ Fill** button fills the page's factual fields (name / email / phone /
  LinkedIn / GitHub / location / website) from your profile and inserts matching **saved answers**
  into question fields (conservative keyword match — leaves a field blank rather than guess wrong).
  Everything is highlighted; **EEO / consent / passwords are never touched and nothing is submitted.**
  Available on the supported boards (where the overlay injects).
- **Offline** — if the server is unreachable, clips and status updates queue locally and flush
  automatically (≈1 min) once it's back.

## Privacy / scope
- Talks **only** to the origin you configure (default `localhost`); requests host permission for
  any non-default origin you set. No third-party calls; fill never touches passwords / EEO / consent
  and never submits.

## Dev notes
- `lib.js` (`postingId` / `reqKey` / `sameReq` / `matchRow`) is kept identical to `server.js`
  and verified against the repo's shared fixtures: `node tests/run-extension-vectors.js`.
- `bg.js` is the only network surface (API client + 60s row cache + offline queue);
  `content.js` is the page overlay; `options.*` is config.
