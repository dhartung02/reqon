# Reqon brand assets

Canonical, cross-surface brand sources. Spec: [../BRAND.md](../BRAND.md).

| File | What | Used by |
|---|---|---|
| `tokens.json` | Emerald Command palette (JSON) | design tooling, build pipelines |
| `tokens.css` | Same palette as `:root` CSS vars | board UI (`public/index.html`), web |
| `reqon-glyph.svg` | Full Reticle Q (emerald, micro-gaps + tail) | iOS icon, large/hero marks |
| `reqon-glyph-mono.svg` | Simplified, `currentColor` (default white) | menu bar, favicon, 16px contexts |
| `reqon-icon-extension.svg` | Emerald glyph in a `#16181C` container | Chrome extension `default_icon` |

## Notes

- The SVGs are **code-built from the BRAND.md vector spec** (100×100 grid, circle d=80, 10px
  stroke, 45° tail, 1.5×-stroke clearance). They are faithful working masters — when the designer
  delivers their own vector files, replace these in place (keep the filenames).
- The app consumes the palette through [`../app/src/theme.ts`](../app/src/theme.ts); keep the three
  token sources (`tokens.json`, `tokens.css`, `theme.ts`) in sync — `BRAND.md` §3 is the source of truth.
- **Rasterizing for Expo / extension:** the iOS app icon and the extension PNGs still need to be
  exported to PNG from these SVGs (Expo `assets/icon.png`, extension `icons/*.png`). Not yet done —
  pending the designer's final master or a rasterization pass.
