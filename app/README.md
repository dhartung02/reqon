# Reqon — iOS app (React Native / Expo)

The mobile command center for the Reqon job-search pipeline. Local-first; works with no
backend, syncs with the optional self-hosted server (Reqon Sync) when configured. Part of the
`job-pipeline-crm` monorepo — see the repo-root [ROADMAP.md](../ROADMAP.md) (Phase 2) and
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
- **Full Xcode** (App Store) for the iOS simulator — *not yet installed on this machine* (only
  Command Line Tools). Until it's installed, the JS layer (tests, typecheck, Metro bundling) works,
  but `expo run:ios` / the simulator does not.
- Apple Developer account ($99/yr) is **not** needed for the simulator — only later, for the
  Share Extension on-device and APNs push (WP-3).

## Commands

```bash
cd app
npm install            # once
npm test               # jest — shared-core parity vectors (no Xcode needed)
npx tsc --noEmit       # typecheck (no Xcode needed)
npx expo start         # Metro dev server (Expo Go / web)
npx expo run:ios       # build to the iOS simulator  ← needs full Xcode
```

## Status

- **M0 shared core** ✅ (repo) · **M1 engine wiring** ✅ — Expo SDK 56 / RN 0.85 / React 19
  scaffolded; `@reqon/core` wired and proven by green vectors + clean tsc; dark-themed proof-of-life
  `App.tsx` scores a sample row through the shared core.
- **Next:** M1 simulator boot (after Xcode), then M2 (local store via `expo-sqlite` + the real
  Today / lists / detail UI).

## Config

- App name **Reqon**, slug/scheme `reqon`, bundle id `com.reqon.app`, dark UI. Icons under
  `assets/` are Expo placeholders — pending the brand assets (see [../BRAND-BRIEF.md](../BRAND-BRIEF.md)).
- Native `ios/` and `android/` folders are generated (`expo prebuild`) and gitignored.
