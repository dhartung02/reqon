# Surface parity + freemium tiering — implementation plan

Status: COMPLETE (commits 1–8) · Branch `feat/surface-parity-tiering` · One PR, multiple commits.

Shipped: shared entitlements core + tests; server enforcement + `/api/entitlements`;
web-board gating + plan badge; app full tracking-field parity; app extended action items;
app entitlements context + AI gating + plan badge; extension tracking editor + AI gating;
docs. All suites green except a pre-existing, unrelated `test_marketing_role.js` assertion.

Source: cross-surface gap analysis (artifact `0939bac9`) + live code recon (2026-06-27).

## Goals

1. **Feature parity** across the four surfaces, as far as makes sense per surface:
   - **Web board** = reference (100%).
   - **Mobile web** = same file, already ~96% → close the polish gap.
   - **React Native app** = bring to near-parity with the web board *capabilities*
     (tracking fields, timeline, pipeline health, follow-up reco, full action items).
   - **Chrome extension** = stays a focused clip+apply tool (no scout/analytics/job-search),
     but gains the tracking-field edits + entitlement-aware AI gating.
2. **Freemium tiering** — a single shared entitlements model that every surface consumes:
   - **Free** (core): pipeline, add/edit, status, local scoring, tracking fields, local
     analytics, Excel export, timeline, action items.
   - **Cloud package**: hosted multi-device sync, digest/push/email/SMS/Slack delivery,
     Gmail ingest, server scout, cloud backups, QR pairing.
   - **AI package**: AI drafts, AI auto-score, map-fields autofill, interview-guide
     generation + company research, follow-up recommendations, profile summary draft.
   - **Local Pro** unlock ("point it at your own server"): self-host ⇒ all packages.
   - **Owner** account: everything, always.

## Entitlements model (the headline)

`core/entitlements.js` — pure, dependency-free, mirrors `core/crm-core.js`. Re-exported through
`@reqon/core` so the server (`require`), the app (Metro alias), and the extension all share ONE
catalog. Each feature is tagged with the package that unlocks it (`free` | `cloud` | `ai`).

- `FEATURES` — `{ featureKey: 'free' | 'cloud' | 'ai' }` catalog.
- `resolvePlan(signals)` — normalizes `{ isOwner, selfHostSingleUser, localProUnlock, license }`
  into `{ owner, pro, cloud, ai, packages, tier }`. Cascade: owner ⇒ pro ⇒ cloud+ai.
  A self-hosted single-user instance is implicitly **Local Pro** (you own the box).
- `hasFeature(plan, key)` / `featureMap(plan)` — gate checks. Owner/Pro pass everything;
  unknown keys fail-open (forward-compatible for older clients).
- `requiredPackage(key)` + labels — drive upgrade CTAs.

### Server
- `GET /api/entitlements` → `{ ok, plan, features }`.
- `requireFeature('ai_draft' | 'scout' | ...)` guard on AI/cloud endpoints.
- License resolved from owner detection (`store.OWNER` / user role) + `REQON_LICENSE` setting +
  `LOCAL_PRO` env + MULTIUSER. Self-host single-user defaults to Local Pro (full).
- License surfaced in `settingsPayload()`; settable by owner/admin via `PUT /api/settings`.

### Surfaces consume entitlements
- **Web board**: fetch on load, lock/hide gated controls, plan badge + upgrade affordance.
- **App**: `useEntitlements()` context + `<Gate>` component + upgrade sheet; gate AI modals,
  scout, digest delivery.
- **Extension**: fetch on load, gate AI buttons (score/draft/guide) with an upgrade CTA.

## App parity work (closes the real M2 gaps)

Model + expo-sqlite columns + RoleDetailScreen editors (dependency-free, ISO text inputs):
`interview`, `followup`, `thankYouSent`, `cover`, `resume`, `referral`, `recruiterEmail`,
`rejection`, `sector`, `remote`. Plus:
- Role **timeline** view (`GET /api/reqs/:key/timeline`).
- **Pipeline health** surfaced in Analytics/Today (`GET /api/pipeline-health`).
- **Follow-up recommendation** in the detail screen (`GET /api/reqs/:key/followup`).
- **Full action-items** set (drop the app subset filter; respect TYPE_SURFACES).

## Extension parity work
- Sidepanel row detail gains a small tracking-field editor (followup/interview/referral/
  recruiterEmail/thankYouSent/rejection) via the existing `patchFields` path.
- Entitlement-aware AI buttons.

## Commit plan (one PR)
1. `core/entitlements.js` + ESM + types + tests (the shared contract).
2. Server: `/api/entitlements`, `requireFeature`, license resolution + settings.
3. Web board: entitlement fetch + UI gating + plan badge.
4. App: tracking-field model + sqlite + detail editors + AddRole.
5. App: timeline + pipeline health + follow-up reco + full action items.
6. App: entitlements context + gating + plan UI.
7. Extension: tracking-field editor + AI gating.
8. Docs: CLAUDE.md multi-screen + entitlements section; refresh gap analysis; tests green.

## Open questions (parked for review — see end of session)
Collected as I go; presented at the end rather than blocking.
