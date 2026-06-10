// Emerald Command — the locked Reqon palette (Concept A · Reticle Q). Single source of truth for
// the app's dark theme; mirrors the table in ../../BRAND.md. Dark-mode only by design.
import type { Tier } from '@reqon/core';

export const colors = {
  canvas: '#0B0C0E', // Obsidian Black — core background
  surface: '#16181C', // Command Gray — cards, containers, inputs
  emerald: '#00E5A3', // Tactical Emerald — Tier A, live scouting, the glyph
  amber: '#FFB800', // Radar Amber — Tier B / pending alerts (never the logo)
  muted: '#64748B', // Recon Muted — Tier C, deactivated data points
  text: '#E2E8F0', // Clean White — primary content
} as const;

/** Score-tier → accent color, per the Emerald Command spec. */
export const tierColor = (tier: Tier): string =>
  tier === 'A' ? colors.emerald : tier === 'B' ? colors.amber : colors.muted;
