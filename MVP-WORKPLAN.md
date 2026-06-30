# Reqon MVP workplan — your working doc

A task-by-task plan to ship the MVP: **iOS app (free companion) in the App Store** + **reqon.app
selling Reqon Cloud & Reqon AI self-serve via Stripe**. Companion analysis: `MVP-READINESS.md`.

**Owner key:** **[YOU]** = founder action (accounts, money, legal, Apple, secrets, decisions) ·
**[CLAUDE]** = I can build/draft it · **[YOU+CLAUDE]** = I draft/build, you provide creds or final sign-off.

**Decisions locked (2026-06-28):**
- iOS = **free companion** (app signs into a web-purchased account; no in-app purchase → no Apple cut).
- Data store = **JSON + nightly offsite backups** for the beta; Postgres later before scaling.
- **Ship Phase 0 first:** an early-access waitlist → invite-based free private beta to gather feedback
  *before* building Stripe or going to the App Store.
- **Brevo** is the email/contacts platform (waitlist capture + confirmation + invite emails).
- Beta access uses the **existing** multi-user + `license="ai"` grant — **no billing needed** to run it.
- Account creation flow = **invite email → "create your account" page** (set password), not a bare waitlist.

---

## Phasing (reslotted around the beta)

- **Phase 0 — Early access + private beta (now):** waitlist + invite + create-account, free `ai` grant.
  Validates demand + gathers feedback. *Defers* Stripe, App Store, and payment-grade legal.
- **Phase 1 — Paid web launch:** Stripe self-serve (Workstream C) + open signup, informed by beta.
- **Phase 2 — App Store:** iOS free companion (Workstream E).

## Critical path (within each phase)

Phase 0: light privacy/consent line → waitlist capture (Brevo) → invite + create-account flow.
Phase 1+: legal (long pole, start drafting during beta) → Stripe → hardening. Phase 2: iOS.

---

## Workstream 0 — Early access + private beta  *(Phase 0 — do first)*

Flow: **visitor joins waitlist → (you approve) → Brevo sends an invite → they click → create-account
page (set password) → account created with a free `ai` beta grant → signed in to the board.**

| # | Task | Owner | Notes |
|---|---|---|---|
| 0.1 | Brevo account: API key, **verified sender** (DKIM/SPF on a reqon.app address), 2 contact lists (Waitlist, Beta) | **[YOU]** | Provide `BREVO_API_KEY`, `BREVO_SENDER_EMAIL/NAME`, `BREVO_WAITLIST_LIST_ID`, `BREVO_BETA_LIST_ID`. |
| 0.2 | (Optional) Brevo transactional **templates** for confirmation + invite emails | **[YOU]** | Lets you edit copy in Brevo (template IDs → env). Else I send inline HTML. |
| 0.3 | `lib/brevo.js` client — add/upsert contact (`POST /v3/contacts`), send email (`POST /v3/smtp/email`) | **[CLAUDE]** | Env-configured; no-ops cleanly if unset. |
| 0.4 | Early-access form on the marketing site (email, name, role, biggest pain) + consent checkbox | **[CLAUDE]** | |
| 0.5 | `POST /api/waitlist` → validate, upsert Brevo contact (Waitlist list), store locally, send confirmation | **[CLAUDE]** | Local `agent/waitlist.json` for the admin view + dedupe. |
| 0.6 | Admin view of waitlist + **Approve → invite** (signed token email via Brevo) | **[CLAUDE]** + **[YOU]** approve | Manual approve = you control cohort size + cadence. |
| 0.7 | `/join?token=…` **create-account page** (email locked, set display name + password, accept terms) | **[CLAUDE]** | The "normal signup" experience. |
| 0.8 | `POST /api/auth/accept-invite` → verify token, create user `license="ai"` + `beta:true`, sign in | **[CLAUDE]** | Reuses multi-user + entitlements (PR #81). Move Brevo contact → Beta list. |
| 0.9 | Light **privacy/consent** line for email capture (not the full ToS) | **[YOU+CLAUDE]** | I draft; covers CAN-SPAM unsubscribe + EU consent. |
| 0.10 | Recruit + invite the first beta cohort; collect feedback | **[YOU]** | |

Defaults (say if you want different): manual approve · password auth (email from token) · single
confirmation email (not double opt-in) · invite token signed with `SESSION_SECRET`, 14-day expiry, single-use.

---

## Workstream A — Legal & trust  *(blocks both web + App Store)*

| # | Task | Owner | Notes |
|---|---|---|---|
| A1 | Decide entity + counsel/generator (Termly, iubenda, or a lawyer) | **[YOU]** | A generator is fine for MVP; lawyer review before scale. |
| A2 | Draft **Privacy Policy** (discloses Render hosting, OpenAI sub-processing + 30-day retention, Stripe, user rights) | **[YOU+CLAUDE]** | I draft a strong starting point; you/counsel finalize + publish. App Store **requires** the URL. |
| A3 | Draft **Terms of Service** (subscriptions, billing, no-auto-apply warranty, acceptable use, no scraping) | **[YOU+CLAUDE]** | Same: I draft, you finalize. |
| A4 | Publish `/privacy` + `/terms` pages + footer links on marketing site | **[CLAUDE]** | Static pages in `marketing/`. |
| A5 | Substantiate marketing claims ("data stays yours", "never sold") or soften copy | **[YOU+CLAUDE]** | Must match the policy you publish. |
| A6 | GDPR DPA chain (Render + OpenAI) — only if selling into the EU at launch | **[YOU]** | Defer if US-only beta. |

## Workstream B — Self-serve accounts  *(blocks web launch + App Store delete rule)*

| # | Task | Owner | Notes |
|---|---|---|---|
| B1 | Public `POST /api/auth/signup` (email+password → user, start 14-day trial) | **[CLAUDE]** | Builds on existing `lib/users.js` + multi-user. |
| B2 | Email verification (token link) | **[CLAUDE]** | SMTP send path already exists (welcome email). |
| B3 | Forgot- / reset-password flow | **[CLAUDE]** | Token email + reset form. |
| B4 | **Account self-delete** (cascades profile/rows/backups) — web + in-app | **[CLAUDE]** | Apple **mandates** in-app delete for sign-up apps. |
| B5 | Signup UI on marketing site + handoff to checkout | **[CLAUDE]** | |
| B6 | Transactional email provider (or confirm SMTP sender deliverability) | **[YOU]** | e.g. Postmark/SES; provide creds. Free Gmail SMTP won't scale/deliver well. |

## Workstream C — Billing (Stripe)  *(blocks web launch)*

| # | Task | Owner | Notes |
|---|---|---|---|
| C1 | Create Stripe account; business/tax/bank details | **[YOU]** | |
| C2 | Create Products + Prices: Cloud ($15 yr / $18 mo), AI ($30 yr / $36 mo) | **[YOU]** | Tag each price with `metadata.plan = cloud|ai` for the webhook. |
| C3 | Provide Stripe secret key + webhook signing secret as env vars | **[YOU]** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` on reqon-api. |
| C4 | Stripe SDK + hosted **Checkout** (start trial / subscribe) | **[CLAUDE]** | Fastest path; no PCI burden. |
| C5 | **Billing Portal** (manage/cancel/update card) | **[CLAUDE]** | One Stripe API call → redirect. |
| C6 | **Webhook** handler (`checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`) | **[CLAUDE]** | Writes subscription state to the user record. |
| C7 | Add subscription fields to user (`stripeCustomerId`, `subscriptionId`, `paidPlan`, `paymentStatus`, `trialEndsAt`) | **[CLAUDE]** | |
| C8 | **Wire subscription/trial state into `resolvePlan`** (drives `license` automatically) | **[CLAUDE]** | The entitlements model is already shaped for this — small change. |
| C9 | Trial-expiry handling + reminder emails (3d/1d/0d) | **[CLAUDE]** | |

## Workstream D — Production hardening  *(before opening public signup)*

| # | Task | Owner | Notes |
|---|---|---|---|
| D1 | Set `SESSION_SECRET` on **both** reqon-api + reqon-cloud | **[YOU]** | Else sessions break across the split. |
| D2 | Rate limiting (per-IP + per-user) on auth + AI + write endpoints | **[CLAUDE]** | Prevents abuse / OpenAI-key exhaustion. |
| D3 | **Nightly offsite backups** of the data dir (e.g. S3/B2) | **[YOU+CLAUDE]** | I write the job; you provide the bucket + creds. Today backups sit on the same disk. |
| D4 | Error tracking (Sentry) + basic structured logging | **[YOU+CLAUDE]** | You create the Sentry project/DSN; I wire it. |
| D5 | Fix `render.yaml` marketing service (`static` → `web`) | **[CLAUDE]** | Stops the blueprint breaking on re-apply. |
| D6 | Per-tenant guardrails (disk/AI caps already partly exist — confirm defaults) | **[CLAUDE]** | |

## Workstream E — iOS App Store (free companion)  *(blocks App Store only)*

| # | Task | Owner | Notes |
|---|---|---|---|
| E1 | Apple Developer Program enrollment ($99/yr) | **[YOU]** | Required to ship. |
| E2 | Pin a **stable Expo SDK** (currently a `57 canary`) | **[CLAUDE]** | Hard blocker for a release build. |
| E3 | `ios.buildNumber`, real `splash` config, min iOS version | **[CLAUDE]** | |
| E4 | **Brand icon + splash** (replace Expo placeholders) | **[YOU]** | Designer or brand assets; I can wire whatever you provide. |
| E5 | In-app **account deletion** screen (calls B4) | **[CLAUDE]** | Apple requirement. |
| E6 | Sign-in screen for a Cloud/AI account (no purchase prompts in-app) | **[CLAUDE]** | Keeps it IAP-free per the free-companion decision. |
| E7 | App Store screenshots + listing copy + privacy "nutrition label" | **[YOU+CLAUDE]** | I draft copy + generate screenshots; you upload in App Store Connect. |
| E8 | Privacy Policy URL in App Store Connect (from A2/A4) | **[YOU]** | |
| E9 | EAS production build + signing | **[YOU+CLAUDE]** | I run `eas build`; signing certs need your Apple credentials. |
| E10 | TestFlight → submit → respond to review | **[YOU]** | I help with any rejection fixes. |
| E11 | (Optional, post-MVP) native push registration | **[CLAUDE]** | Server APNs sender already built; app-side not wired. Ship without it. |

## Workstream F — Confirm live deploy

| # | Task | Owner | Notes |
|---|---|---|---|
| F1 | Verify api/cloud/marketing actually serving at the domains | **[YOU+CLAUDE]** | `DEPLOYMENT_STATUS.md` is prescriptive, not confirmed. |
| F2 | DNS (Cloudflare) + persistent disk attached + env vars set | **[YOU]** | |
| F3 | End-to-end smoke test: signup → trial → checkout → entitlement unlocks feature | **[YOU+CLAUDE]** | The acceptance test for "can someone actually pay and get value." |

---

## Rough effort (engineering only; excludes legal counsel + Apple review)

| Workstream | Claude build | Your effort |
|---|---|---|
| A Legal | drafts ~0.5 day | review/publish + counsel |
| B Accounts | ~10–14h | email provider creds |
| C Billing | ~12–18h | Stripe setup + products |
| D Hardening | ~1–1.5 days | provision Sentry/bucket/secrets |
| E iOS | ~1–2 days code | Apple acct, assets, uploads, review |
| F Deploy | shared | DNS/secrets/disk |

**To a gated paid beta: ~2–4 weeks**, gated mostly by legal turnaround, brand assets, and Apple review — not by code.

## Suggested first sprint (when you say go)
- **You:** start A1 (legal path), C1–C2 (Stripe account + products), E1 (Apple enrollment), E4 (brand assets).
- **Claude:** B1–B5 (accounts), A2–A4 (draft legal + pages), D5 (render.yaml) — none of which need your accounts to begin.
