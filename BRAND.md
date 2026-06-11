# Reqon — Visual identity (locked)

**Direction: Concept A — Reticle Q ("Reconnaissance").** Strategic, sharp, confident — a tactical
OS for career management, not a standard utility app. This is the canonical visual spec; the input
brief is [BRAND-BRIEF.md](BRAND-BRIEF.md). Pronunciation **"REE-kon"**; tagline **"Recon for your
career."**

> Canonical assets + tokens live in [`brand/`](brand/): `tokens.json`, `tokens.css`, and the
> Reticle Q SVGs. The app consumes the palette via [`app/src/theme.ts`](app/src/theme.ts); the
> board UI (`public/index.html`) can migrate to these values in a later pass.
> The SVGs in `brand/` are **code-built from the spec below** — faithful working masters the
> designer can validate or replace with their own vector files.

---

## 1. Wordmark

Projects absolute control, executive judgment, high data density.

- **Typeface:** Spline Sans — or a high-precision geometric sans (Geist Sans, Inter).
- **Weight:** Bold / Extra Bold for the primary letters (R, E, O, N).
- **Case:** ALL CAPS, strictly (sheds the "friendly startup" / consumer-utility vibe).
- **Tracking:** +15% to +20% (`0.15em`–`0.2em`) — letters breathe; premium-dashboard feel.

## 2. The "Q" — custom-modified, not typed straight

- **Body:** perfect geometric circle; stroke weight and cap-height match R/E/O/N.
- **Reticle tail:** a razor-sharp, uniform diagonal hashmark at **exactly 45°** (top-left →
  bottom-right) cleaving the lower-right quadrant — a crosshair marker on a tactical scope.
- **Clearance:** a hard, clean gap separates the tail from the body by **1.5× the stroke width** —
  negative space that stops the letter "mudding up" at small sizes.

### Glyph vector spec (100×100 grid)

- **Outer perimeter:** perfect circle, center `(50,50)`, **diameter 80px**.
- **Stroke width:** consistent **10px**.
- **Tail:** **10px** thick, **25px** long, at **45°**, starting just inside the lower-right baseline
  and projecting outward.
- **Tactical breaks (optional, high-res only — e.g. iOS icon):** micro-gaps at the **12 / 3 / 6 / 9
  o'clock** positions to mimic a targeting-scope reticle.

## 3. Palette — "Emerald Command" (dark-mode only)

| Token key | Name | Hex | Usage |
|---|---|---|---|
| `canvas` | Obsidian Black | `#0B0C0E` | Core background |
| `element` | Command Gray | `#16181C` | Cards, pipeline containers, inputs |
| `emerald` | Tactical Emerald | `#00E5A3` | Tier A / live "signal acquired" / **the glyph** |
| `amber` | Radar Amber | `#FFB800` | Tier B / pending sync action — **never the logo** |
| `muted` | Recon Muted | `#64748B` | Tier C / background technical details |
| `text-high` | Clean White | `#E2E8F0` | High-contrast crisp technical typography |

Authoritative token files: [`brand/tokens.json`](brand/tokens.json), [`brand/tokens.css`](brand/tokens.css).

## 4. Application & scalability

| Surface | Asset variant | Scale / contrast rules |
|---|---|---|
| iOS app icon | Full Reticle Q (Emerald) | Centered on pure `#0B0C0E`; subtle crisp outer glow (`drop-shadow`) on the emerald lines for an "active radar" luminance |
| Chrome ext. (16px) | Simplified Reticle Q | **Drop all micro-gaps / internal detail** — solid bold circle + pronounced tail; legible on any toolbar |
| Mac/Windows menu bar | Monochrome native icon | Solid white / system color; **thicken stroke ~15%** to fight subpixel rendering in OS bars |
| Sync server favicon | Simplified monochrome | Pure white glyph on a `#16181C` grid for visibility in crowded tabs |

**Extension contrast fix (required).** Job boards swing between blinding-light and custom-dark
themes; a bare emerald/transparent icon vanishes on dark toolbars. The Chrome `default_icon`
bundle must house the emerald Reticle Q inside a solid rounded-rect **`#16181C`** container so the
mark always sits in its own crisp perimeter. → [`brand/reqon-icon-extension.svg`](brand/reqon-icon-extension.svg).

## 5. Sub-brand family

Strict suffix pattern; the secondary word is always a **lighter weight (Regular/Medium)** than
**REQON** (Bold) so focus stays on the parent. The suffix color signals the product's role:

| Lockup | Suffix color | Intent |
|---|---|---|
| **REQON CLIP** (Chrome extension) | Tactical Emerald | Lightweight, active capture plugin |
| **REQON SYNC** (self-hosted backend) | Recon Muted | Quiet, background data-layer infrastructure |
| **REQON SCOUT** (automated sweeper) | Radar Amber | Active processing — crawling/scanning for hits |
