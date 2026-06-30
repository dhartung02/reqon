# Subscription & Tier Model

Living reference for reqon's freemium tier structure. Update this file whenever a new feature is added or a tier assignment changes.

## Tiers

| Tier | Label | Target user | How set |
|---|---|---|---|
| `free` | Reqon Free | Self-hosted, evaluating | Default; `TIER=free` env var |
| `cloud` | Reqon Cloud | Active job searcher, multi-device | `TIER=cloud`; paid subscription via RevenueCat |
| `ai` | Reqon AI | Power user, wants AI assistance | `TIER=ai`; paid subscription; superset of cloud |

**AI is a superset of Cloud** — holding an `ai` tier also grants every Cloud feature. Enforce this in `lib/capabilities.js` with `caps.cloud = caps.cloud || caps.ai`.

---

## Feature matrix

| Feature | Free | Cloud | AI | Surface(s) | Notes |
|---|---|---|---|---|---|
| Pipeline view, status tracking | ✓ | ✓ | ✓ | all | Core CRM |
| Manual add / edit roles | ✓ | ✓ | ✓ | all | |
| Scoring (fit / prob / tier / EV) | ✓ | ✓ | ✓ | all | Shared via `@reqon/core` |
| Action items (Today cards) | ✓ | ✓ | ✓ | web, app | |
| Role limit | 25 | unlimited | unlimited | all | Soft cap on free |
| Excel export | ✓ | ✓ | ✓ | web | |
| Cloud sync / multi-device | ✗ | ✓ | ✓ | app, ext | Requires cloud deployment |
| QR pairing (board ↔ app) | ✗ | ✓ | ✓ | web, app | |
| Scout (automated discovery) | ✗ | ✓ | ✓ | web, app | `scout.py` + board APIs |
| Email scout (LinkedIn/Indeed leads) | ✗ | ✓ | ✓ | web | `scout_email.py` |
| Gmail response ingest | ✗ | ✓ | ✓ | web, app | `mail_ingest.py` |
| Notifications (email / SMS / Slack) | ✗ | ✓ | ✓ | web | `DIGEST_CHANNELS` |
| Interview guides (grounded) | ✗ | ✓ | ✓ | web, app, ext | Auto-generated on stage entry |
| Pipeline health & analytics | ✗ | ✓ | ✓ | web, app | `/api/pipeline-health` |
| Follow-up recommendations | ✗ | ✓ | ✓ | web, app | `/api/reqs/:key/followup` |
| AI draft (cover / screening / TY) | ✗ | ✗ | ✓ | web, ext | `/api/assist` kind cover/screening/thankyou |
| AI auto-score (fit / prob) | ✗ | ✗ | ✓ | web | `/api/assist/score` |
| AI map-fields autofill | ✗ | ✗ | ✓ | web | `/api/assist/map-fields` |
| AI interview guide + web research | ✗ | ✗ | ✓ | web, app | `POST /api/reqs/:key/guide?research=1` |
| AI profile summary draft | ✗ | ✗ | ✓ | web | `/api/profile/draft-summary` |

---

## Architecture (how gating works)

### Server
- `TIER` env var on the deployment sets the baseline (`free | cloud | ai`)
- `lib/capabilities.js` — single manifest mapping tier → capability booleans
- `GET /api/me` returns `{ user, tier, caps }` — the app fetches this at login
- Protected routes call `requireFeature('key')` → 402 `{ error:'upgrade_required', requires, tier }` if tier doesn't cover it

### Client (React Native app)
- `lib/capabilities.ts` mirrors the server manifest for offline gate checks
- `useCapabilities()` hook reads from the sync store (populated from `/api/me`)
- `<Gate feature="aiDraft">` wrapper renders the feature or an upgrade prompt
- Never hard-code `if (tier === 'ai')` — always go through the capability key

### Web board
- `data-feature="key"` attributes on gated controls (auto-locked by JS)
- Same `requireFeature()` enforcement at the API level

---

## Upgrade path

**Now (no payment infra):** `TIER=cloud` on Render, managed manually. Flip to `TIER=ai` for the owner account.

**When charging:** Wire **RevenueCat** (React Native SDK) on mobile + **Stripe** on web. On purchase/renewal, RevenueCat calls a server webhook → updates `user.tier` in `users.json` (or a future subscription table) → next `/api/me` call reflects the new tier. The capability system stays unchanged.

---

## Build sequence (what needs to happen before gating is worth implementing)

1. **M3 schema + SQLite store** — tracking fields (`thankYouSent`, `interview`, `followup`, etc.) in `app/src/model.ts`; without this, half the features to gate don't exist yet in the app
2. **`lib/capabilities.js` + `/api/me`** — server-side manifest + endpoint
3. **`lib/capabilities.ts` + `<Gate>` component** — client-side hook and wrapper
4. Wire gated features one by one as they're built for the app
5. **RevenueCat** when the first paid tier is ready to launch publicly

---

## Changelog

| Date | Change |
|---|---|
| 2026-06-29 | Initial draft — tier model, feature matrix, architecture notes |
