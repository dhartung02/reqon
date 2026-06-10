# Reqon — Visual identity (locked)

**Direction chosen: Concept A — Reticle Q ("Reconnaissance").** Strategic, sharp, confident — a
tactical OS for career management, not a standard utility app. This is the canonical visual spec;
the input brief is [BRAND-BRIEF.md](BRAND-BRIEF.md). Pronunciation stays **"REE-kon"**; tagline
**"Recon for your career."**

> Implementation note: the **Emerald Command** palette below is the single source of truth for the
> app's dark theme — encoded as tokens in [`app/src/theme.ts`](app/src/theme.ts). The board UI
> (`public/index.html`) can be migrated to these values in a later pass.

---

## 1. Master logo & glyph construction

The identity lives in the **Q** — the organic curve of the letter balanced with the mechanical
precision of a reticle.

- **Body:** a perfect geometric circle — a complete perimeter implying total situational awareness.
- **Reticle tail:** a single precise diagonal dash cleaving the lower-right quadrant, extending
  slightly into and out of the circle — a crosshair marker on a tactical scope.
- **Wordmark:** Spline Sans (or a close geometric sans), **heavy weight (Bold / Extra Bold)**,
  **ALL CAPS** — command, finality, precision (avoids the "friendly startup" lowercase vibe).
- **Kerning:** wide letter-spacing for a premium, high-data-density feel.

## 2. Palette — "Emerald Command" (dark-mode only)

| Role | Name | Hex | Usage |
|---|---|---|---|
| Canvas | Obsidian Black | `#0B0C0E` | Core background |
| Elements | Command Gray | `#16181C` | UI cards, board containers, inputs |
| Primary accent | Tactical Emerald | `#00E5A3` | Highest scores (Tier A), live scouting indicators, the logo glyph |
| Secondary accent | Radar Amber | `#FFB800` | Tier B scores / pending alerts only — **never the logo** |
| Tier C / muted | Recon Muted | `#64748B` | Tier C roles, deactivated data points |
| Type (high) | Clean White | `#E2E8F0` | Primary content text |

## 3. Application & scalability

| Placement | Mark | Implementation |
|---|---|---|
| iOS app icon | Reticle Q glyph only | Obsidian Black bg, glyph in Tactical Emerald; optional subtle outer "signal bloom" glow to hint at AI |
| Chrome ext. (16px) | Simplified glyph | Drop inner reticle lines — circle-and-tail geometry only, solid Tactical Emerald, high-contrast on any browser bg |
| Mac/Windows menu bar | Simplified monochrome glyph | Pure white / system color; thicken geometry slightly at 16px for clarity |
| Sync server favicon | Simplified monochrome glyph | White-on-dark for the self-hosted dashboard |

## 4. Brand-family hierarchy

The primary wordmark is bold, geometric, all-caps; sub-brands complement that weight without
competing. **Rule:** sub-brand names render in **Tactical Emerald** (the A-Tier status color) to
signify operational status.

- **REQON** — primary brand: all caps, bold.
- **REQON CLIP** · **REQON SCOUT** · **REQON SYNC** — same font, bold but slightly thinner than
  the main brand.
