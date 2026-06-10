// Emerald Command — the locked Reqon palette (Concept A · Reticle Q). Single source of truth for
// the app's dark theme; token keys mirror brand/tokens.json + BRAND.md §3. Dark-mode only by design.
import type { Tier } from '@reqon/core';

export const colors = {
  canvas: '#0B0C0E', // Obsidian Black — core background
  element: '#16181C', // Command Gray — cards, pipeline containers, inputs
  emerald: '#00E5A3', // Tactical Emerald — Tier A, live "signal acquired", the glyph
  amber: '#FFB800', // Radar Amber — Tier B / pending sync action (never the logo)
  muted: '#64748B', // Recon Muted — Tier C, background technical details
  textHigh: '#E2E8F0', // Clean White — high-contrast crisp typography
} as const;

/** Score-tier → accent color, per the Emerald Command spec. */
export const tierColor = (tier: Tier): string =>
  tier === 'A' ? colors.emerald : tier === 'B' ? colors.amber : colors.muted;
