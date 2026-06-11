# Reqon brand assets

Canonical, cross-surface brand sources. Spec: [../BRAND.md](../BRAND.md).

## Vector masters (SVG — source of truth)

| File | What | Used by |
|---|---|---|
| `reqon-glyph.svg` | Full Reticle Q — ring micro-gaps + center crosshair + tail (emerald) | iOS icon, large/hero marks |
| `reqon-glyph-mono.svg` | Simplified, `currentColor` (default white) | menu bar, favicon, small contexts |
| `reqon-icon-extension.svg` | Emerald glyph in a `#16181C` container | Chrome extension |
| `reqon-app-icon.svg` | iOS icon composition — glyph on Obsidian + signal-bloom glow | `app/assets/icon.png` source |
| `reqon-wordmark.svg` | REQON lockup (glyph as the "O") + Fraunces tagline — **reference** | marketing, docs |
| `tokens.json` / `tokens.css` | Emerald Command palette | build pipelines, board UI, web |

## Generated bitmaps (`rsvg-convert` from the SVGs above)

- `app/assets/icon.png` — 1024×1024 iOS app icon
- `app/assets/favicon.png` — 48×48 web favicon
- `extension/icons/icon{16,32,48,128}.png` — Chrome extension icons (wired in `extension/manifest.json`)

Regenerate after editing a master SVG:
```bash
rsvg-convert -w 1024 -h 1024 brand/reqon-app-icon.svg     -o app/assets/icon.png
rsvg-convert -w 48   -h 48   brand/reqon-app-icon.svg     -o app/assets/favicon.png
for s in 16 32 48 128; do rsvg-convert -w $s -h $s brand/reqon-icon-extension.svg -o extension/icons/icon$s.png; done
```

## Reference renders (`reference/`)

The designer's approved presentation renders (2816×1536 slides) — the visual target the vector
masters track: `app-icon-render.png`, `extension-icon-render.png`, `wordmark-render.png`. These are
mockup boards, not crop-ready exports; the production assets above are derived to match them.

## Notes

- The SVGs are **code-built from the BRAND.md vector spec** to match the approved designer renders.
  They are faithful working masters — when the designer delivers their own outlined vector files,
  replace these in place (keep the filenames) and re-run the rasterize commands above.
- `reqon-wordmark.svg` uses **live text** (Spline Sans / Fraunces) — it renders exactly only where
  those fonts are available; the designer's outlined master is the pixel-final wordmark.
- The app consumes the palette through [`../app/src/theme.ts`](../app/src/theme.ts); keep the token
  sources in sync — `BRAND.md` §3 is the source of truth.
