# Reqon MVP readiness — go-to-market analysis

Date: 2026-06-28. Scope of "viable MVP": **iOS app in the App Store** + **reqon.app website selling
Reqon Cloud and Reqon AI as self-serve subscriptions**. Assessment is grounded in the codebase, not
aspirational. Effort figures are rough engineering estimates (exclude legal counsel / Apple review time).

## TL;DR

The product is built and good. What's missing is the **commercialization layer**: nobody can pay,
nobody can self-register, there are no legal docs, and the iOS app isn't packaged for the store.
None of these are deep technical problems — they're well-understood plumbing. Realistic effort to a
**gated paid beta**: ~2–4 focused weeks of build + legal docs + Apple review. Two strategic decisions
gate the shape of the work (iOS monetization model; when to move off the JSON-file store).

## Readiness scorecard

| Pillar | State | Confidence |
|---|---|---|
| Core product (CRM across web/app/extension) | ✅ Built & tested | High |
| Entitlements / tier model | ✅ Built (PR #81), enforced server-side | High |
| Multi-user data isolation | ✅ Built & tested (`test_multiuser_isolation.js`) | High |
| Deploy topology (api / cloud / marketing split) | 🟡 Configured; live state unconfirmed | Med |
| **Billing (Stripe)** | ❌ Not started — marketing copy only | High |
| **Self-serve signup / login / password reset** | ❌ Not started — accounts are admin-provisioned | High |
| **iOS App Store packaging** | 🟡 ~50% — builds, but blockers remain | High |
| **Legal (privacy policy, ToS, account deletion)** | ❌ Not started | High |
| Production data store (durability/scale) | 🟡 JSON-on-disk, single instance, no offsite backup | High |
| Observability / rate limiting / abuse control | ❌ None | High |

## Where we are (the good news)

- **The whole product works.** Web board (reference), mobile web, RN app (now at tracking-field
  parity), Chrome extension. Local-first app via expo-sqlite works fully offline — a real free tier.
- **Entitlements engine is done** (`core/entitlements.js`, PR #81): free / cloud / ai packages, owner &
  Local-Pro grants, server enforcement via `requireFeature` → 402, `GET /api/entitlements`, and UI
  gating on all three surfaces. AI is modeled as a superset of Cloud, matching the pricing page.
- **Multi-tenancy is real and tested.** Per-user namespaces (AsyncLocalStorage + path resolver),
  scrypt passwords, signed sessions, per-user API tokens, per-user OpenAI keys, AI cost caps,
  admin impersonation with audit log.
- **Deploy architecture is sound.** Three Render roles (`api` / `cloud` proxy / `marketing`),
  HTTPS via Let's Encrypt, secrets as env vars, `SESSION_SECRET` cross-process support.
- **Marketing site shipped** (PR #80): branded, with a real pricing page (Cloud $15–18, AI $30–36,
  14-day trial, "payments via Stripe").

## What's left (the gaps)

### 1. Billing — Stripe (❌ ~12–18h)
No payment code exists; the pricing page is copy. Need:
- Stripe SDK + products/prices (Cloud, AI; monthly + annual).
- Checkout (hosted Checkout is fastest) + Billing Portal (manage/cancel/update card).
- Webhook handler (`checkout.session.completed`, `customer.subscription.{created,updated,deleted}`,
  `invoice.payment_{succeeded,failed}`) that writes subscription state to the user record.
- Subscription fields on the user: `stripeCustomerId`, `subscriptionId`, `paidPlan`, `paymentStatus`,
  `trialStartedAt` / `trialEndsAt`.
- **Wire it to entitlements:** `resolvePlan` must derive `license` from subscription/trial state
  instead of a static admin field. (~1–2h once the fields exist — the model is ready for it.)

### 2. Self-serve accounts (❌ ~10–14h)
Today account creation is admin-only (`POST /api/users` requires admin); there is no public signup,
email verification, or password reset. Need:
- Public `POST /api/auth/signup` (email + password) → creates user, starts the 14-day trial.
- Email verification (token link) — SMTP send path already exists (welcome email).
- Forgot-/reset-password flow.
- Signup + checkout handoff on the marketing site (or the board).

### 3. iOS App Store (🟡 ~1–2 weeks incl. assets + review)
The app builds (EAS configured, bundle id `com.reqon.app`), works offline, and has a privacy
manifest. Blockers before submission:
- **Stable Expo SDK** — currently a canary build (`expo ^57.0.0-canary`); pin a release.
- `ios.buildNumber`, a real `splash` config, and **brand icon/splash** (current icons are Expo
  placeholders).
- App Store **screenshots** + listing metadata.
- **Privacy Policy URL** (Apple requires it) + privacy "nutrition label".
- **In-app account deletion** — Apple mandates it for any app with sign-up (today delete is admin-only).
- Decide native push (server APNs sender is built but inert; app-side registration not wired) — a soft
  item, can ship without it.
- **Monetization model (decision):** see Strategic decisions below.

### 4. Legal / trust (❌ ~legal-dependent; drafting ~1–2 days)
None exist and several are hard blockers:
- **Privacy Policy** (App Store blocker; must disclose Render hosting + OpenAI sub-processing + retention).
- **Terms of Service** (subscriptions, liability, acceptable use — no auto-apply, no scraping).
- **In-app + web account deletion** endpoint that cascades to all user data.
- Substantiate marketing claims ("data stays yours", "never sold", "payments via Stripe").
- GDPR DPA chain (Render + OpenAI) if selling into the EU; data export beyond `.xlsx`.

### 5. Production hardening (🟡 ~ varies; partially deferrable)
- **Data store:** per-tenant JSON files on one mounted disk — no concurrency safety beyond the
  PUT guard, **no offsite backup**, no horizontal scale. Fine for a small gated beta; the #1
  reliability/scale risk for real growth. Migrate to Postgres before scaling (namespacing makes this
  tractable). (~1 week when you do it.)
- **No rate limiting / abuse protection** — a single user can exhaust the shared OpenAI key or disk.
  Add per-IP + per-user limits before opening signup. (~0.5–1 day)
- **No error tracking / metrics** (add Sentry + structured logs). (~half day)
- `SESSION_SECRET` must be set on both api + cloud (else sessions break across the split). Document it.
- `render.yaml` marketing service is mis-typed (`static` vs `web`) — fix before re-applying the blueprint.

## Strategic decisions (need your call)

1. **iOS monetization.** Apple requires **IAP (15–30% cut)** for digital subscriptions purchased or
   unlocked *in-app*. Two MVP paths:
   - **(Recommended) Free companion / free tier.** The app is the free local CRM; it *signs in* to a
     Cloud/AI account you bought on the web. No in-app purchase, no upsell prompts → no IAP, no Apple
     cut, far less work. Allowed under the multiplatform-service guideline.
   - **Full IAP.** Sell Cloud/AI inside the app too. More revenue surface, but adds StoreKit/RevenueCat,
     receipt validation, and Apple's cut — defer past MVP.
2. **Data store timing.** Ship the gated beta on the current JSON store (add offsite backup + the PUT
   guard is enough for low volume), or migrate to Postgres first. Recommend: beta on JSON with nightly
   offsite snapshots; Postgres before any real marketing push.
3. **Free-tier shape.** Confirm what "Free" includes (local app + manual web board?) vs. what requires
   Cloud (sync, scout, delivery). The entitlements catalog already encodes a sensible default.

## Recommended MVP sequence (critical path)

1. **Legal docs** (privacy + ToS) — longest lead time; start now, runs in parallel with everything.
2. **Self-serve signup + login + password reset + account deletion** (also satisfies the Apple
   deletion requirement).
3. **Stripe**: products → Checkout → webhook → wire subscription state into `resolvePlan`.
4. **Pre-signup hardening**: rate limiting, offsite backups, `SESSION_SECRET`, Sentry.
5. **iOS packaging** (free-companion model): stable SDK, brand assets, screenshots, privacy URL,
   in-app delete, submit to TestFlight → App Store.
6. **Confirm the live deploy** (api/cloud/marketing actually serving; DNS; disk attached).

Items 1–4 gate the **web** launch (sell Cloud/AI). Item 5 gates the **App Store**. They can run in
parallel; legal is the long pole.
