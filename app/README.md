# Reqon — iOS app (React Native / Expo)

The mobile command center for the Reqon job-search pipeline. Local-first; works with no
backend, syncs with the optional self-hosted server (Reqon Sync) when configured. Part of the
`reqon` monorepo — see the repo-root [ROADMAP.md](../ROADMAP.md) (Phase 2) and
[WORKPLAN.md](../WORKPLAN.md) (WP-2) for scope and milestones.

## Architecture: one shared core, never re-ported

The app does **not** re-implement scoring / dedupe / sync in Swift or TS. It imports the exact
same module the server and Chrome extension use — repo-root [`core/crm-core.js`](../core/crm-core.js) —
through the `@reqon/core` alias:

- **Runtime (Metro):** [`metro.config.js`](metro.config.js) watches the monorepo root and maps
  `@reqon/core` → `../core/crm-core.js`.
- **Tests (jest):** [`jest.config.js`](jest.config.js) maps the same alias.
- **Types:** [`types/reqon-core.d.ts`](types/reqon-core.d.ts) is the ambient declaration (kept in
  sync with the JS source — that file is the single source of truth).

The parity test [`__tests__/core-vectors.test.ts`](__tests__/core-vectors.test.ts) runs the shared
fixtures in [`../tests/vectors/`](../tests/vectors) — the same ones the server asserts — so the app
and server can't silently drift.

## Prerequisites

- Node 20+ (repo uses 24 LTS), already covered by the monorepo.
- **Day-to-day dev runs in Expo Go** — `npx expo start`, scan with the device/simulator. No
  custom native modules are used, so Expo Go is sufficient for everything currently shipped.
- A **dev build** (EAS or `expo run:ios` with full Xcode + an Apple Developer account, $99/yr)
  is required only for the remaining dev-build-gated work: the native Share Extension, on-device
  push (APNs), and local notifications.

## Commands

```bash
cd app
npm install            # once
npm test               # jest — shared-core parity vectors (no Xcode needed)
npx tsc --noEmit       # typecheck (no Xcode needed)
npx expo start         # Metro dev server (Expo Go / web)
npx expo run:ios       # build to the iOS simulator  ← needs full Xcode
```

## Status — shipped (runs in Expo Go)

WP-2 (Phase 2) is shipped, and the app grew well past it. All merged to `main`, `tsc` clean,
60 jest tests on the pure logic.

- **Core + store** — `@reqon/core` shared module (scoring/dedupe/tier/sync), `expo-sqlite`
  local store with `id`/`updatedAt`/`deleted`, two-way `/api/sync`.
- **Screens** — Today command center; pipeline lanes (search · sort incl. salary · filters:
  no-onsite / verified / hide-Tier-C); role detail with tracking edits + "why this score"
  rationale; bulk status actions; Analytics (KPIs · tier mix · application funnel + conversion).
- **Settings (synced)** — Profile (full CV + EEO + résumé upload→parse), Search criteria,
  Tiers & rules (synced override of the core thresholds), Saved answers, Build CV, "How scoring
  works" guide, sync config, on-device scout toggle, **Light/Dark/System**.
- **Apply-assist** — in-app browser fills factual fields + saved answers (auto-match or manual);
  never EEO/consent/submit.
- **Scout** — on-device multi-ATS (Greenhouse/Ashby/Lever) poll → score → dedupe → add.
- **CV** — server-generated **.docx + PDF**, AI-or-deterministic summary, per-role tailoring.

**Open (dev-build-gated — needs EAS/Xcode, not Expo Go):** native Share Extension (M3),
on-device push registration (WP-3; the server APNs sender is built + inert until configured),
local notifications (M5).

## Config

- App name **Reqon**, slug/scheme `reqon`, bundle id `com.reqon.app`, dark UI. Icons under
  `assets/` are Expo placeholders — pending the brand assets (see [../BRAND-BRIEF.md](../BRAND-BRIEF.md)).
- Native `ios/` and `android/` folders are generated (`expo prebuild`) and gitignored.
