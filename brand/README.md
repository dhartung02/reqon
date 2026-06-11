# Reqon brand assets

Canonical, cross-surface brand sources. Spec: [../BRAND.md](../BRAND.md).

## Vector masters (SVG — source of truth)

| File | What | Used by |
|---|---|---|
| `logo-full-dark.svg` | Full lockup (glyph-as-"O" + Fraunces tagline) for **dark** bg | marketing, docs, app splash |
| `logo-full-light.svg` | Full lockup for **light** bg (dark wordmark, deeper `#008F66` glyph) | light docs, email |
| `glyph-emerald.svg` | Standalone Reticle Q, Tactical Emerald, transparent bg | iOS icon, hero marks |
| `glyph-monochrome.svg` | Reticle Q, `currentColor` (default white) | menu bar, favicon, system alerts |
| `reqon-icon-extension.svg` | Emerald glyph in a `#16181C` container | Chrome extension icon |
| `reqon-app-icon.svg` | iOS icon composition (glyph on Obsidian + glow) | `app/assets/icon.png` source |
| `reqon-clip.svg` · `reqon-sync.svg` · `reqon-scout.svg` | Sub-brand lockups (suffix colored per role) | per-product UI/docs |
| `tokens.json` · `tokens.css` · `tailwind.config.js` | Emerald Command palette | build pipelines, web, board |

## Generated bitmaps (`rsvg-convert` from the SVGs above)

- `app/assets/icon.png` (1024) + `app/assets/favicon.png` (48)
- `extension/icons/icon{16,32,48,128}.png` — wired in `extension/manifest.json`

Regenerate after editing a master:
```bash
rsvg-convert -w 1024 -h 1024 brand/reqon-app-icon.svg     -o app/assets/icon.png
rsvg-convert -w 48   -h 48   brand/reqon-app-icon.svg     -o app/assets/favicon.png
for s in 16 32 48 128; do rsvg-convert -w $s -h $s brand/reqon-icon-extension.svg -o extension/icons/icon$s.png; done
```

## Reference renders (`reference/`)

The designer's approved presentation slides (2816×1536) — the visual target the vectors track:
`app-icon-render.png`, `extension-icon-render.png`, `wordmark-render.png`.

## Asset-checklist status

| Requested | Status |
|---|---|
| `logo-full-light/dark.svg` | ✅ here |
| `glyph-emerald.svg` / `glyph-monochrome.svg` | ✅ here |
| Sub-brand SVGs (Clip/Sync/Scout) | ✅ here |
| Extension `icon{16,32,48,128}.png` | ✅ `extension/icons/`, wired |
| **Fonts** (`SplineSans`/`Fraunces` woff2 + `@font-face`) | ⏳ **need the font binaries** — OFL/free, but not in repo. App will load via `expo-font`; can fetch on request. |
| `sync-dashboard-hero.png` | ⏳ deferred — no setup screen consumes it yet |
| App Store hero + screenshots | ⏳ deferred — needs the Apple Developer account / submission |

## Notes

- SVGs are code-built from the [BRAND.md](../BRAND.md) spec to match the approved renders; the
  designer's outlined masters can replace them in place (keep filenames), then re-run the rasterize.
- The full + sub-brand lockups use **live text** (Spline Sans / Fraunces) — exact only where those
  fonts are available; outline them for pixel-final delivery.
- App consumes the palette via [`../app/src/theme.ts`](../app/src/theme.ts); `BRAND.md` §3 is the
  token source of truth.
