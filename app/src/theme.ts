// Emerald Command — the Reqon palette (Concept A · Reticle Q). Token keys mirror brand/tokens.json
// + BRAND.md §3. Dark is the primary identity; a light variant keeps the same accent hues, darkened
// where needed for contrast on a pale canvas. The active palette is resolved at runtime by the
// ThemeProvider (light / dark / system) and consumed via useTheme()/useThemedStyles() — never import
// a static `colors` object, so styles rebuild when the scheme changes.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Tier } from '@reqon/core';

export const darkColors = {
  canvas: '#0B0C0E', // Obsidian Black — core background
  element: '#16181C', // Command Gray — cards, pipeline containers, inputs
  emerald: '#00E5A3', // Tactical Emerald — Tier A, live "signal acquired", the glyph
  amber: '#FFB800', // Radar Amber — Tier B / pending sync action (never the logo)
  active: '#2DD4BF', // teal — in-interview statuses
  danger: '#F87171', // coral — rejected / error
  muted: '#64748B', // Recon Muted — Tier C, suppressed noise, secondary text
  textHigh: '#E2E8F0', // Clean White — high-contrast primary data text
  textBase: '#94A3B8', // standard descriptive text
} as const;

// Light variant — same roles, tuned for a pale canvas. Accents are darkened so they read as text /
// borders on white; element is the raised (card) surface, canvas the recessed page.
export const lightColors: Record<keyof typeof darkColors, string> = {
  canvas: '#F4F6F9', // recessed page
  element: '#FFFFFF', // raised cards / inputs
  emerald: '#00936B', // darkened Tactical Emerald — readable on white
  amber: '#B45309', // darkened Radar Amber
  active: '#0D9488', // darkened teal
  danger: '#DC2626', // coral → red-600
  muted: '#64748B', // slate-500 — secondary / Tier C (works on both)
  textHigh: '#0B1220', // near-black primary data text
  textBase: '#475569', // slate-600 descriptive text
};

export type Palette = typeof darkColors;
export type Scheme = 'light' | 'dark';
export type SchemePref = 'light' | 'dark' | 'system';

/** Brand typefaces (bundled TTFs, loaded via expo-font in App.tsx). */
export const fonts = { sans: 'SplineSans', serif: 'Fraunces' } as const;

/** Append an alpha channel to a 6-digit hex (#RRGGBB → #RRGGBBAA) for tint fills/borders. */
export const alpha = (hex: string, a: number): string =>
  hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');

/** Score-tier → accent color, per the Emerald Command spec. Pass the active palette. */
export const tierColor = (tier: Tier, c: Palette): string =>
  tier === 'A' ? c.emerald : tier === 'B' ? c.amber : c.muted;

// ---- runtime theme (light / dark / system) ----
const SCHEME_KEY = 'reqon.scheme';

interface ThemeValue {
  colors: Palette;
  scheme: Scheme; // the resolved concrete scheme
  pref: SchemePref; // the user's choice (system = follow OS)
  setScheme: (p: SchemePref) => void;
}

const ThemeContext = createContext<ThemeValue>({
  colors: darkColors,
  scheme: 'dark',
  pref: 'system',
  setScheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme(); // live OS scheme: 'light' | 'dark' | null
  const [pref, setPref] = useState<SchemePref>('system');

  useEffect(() => {
    SecureStore.getItemAsync(SCHEME_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPref(v);
    });
  }, []);

  const setScheme = useCallback((p: SchemePref) => {
    setPref(p);
    SecureStore.setItemAsync(SCHEME_KEY, p);
  }, []);

  const scheme: Scheme = pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  const colors = scheme === 'light' ? (lightColors as Palette) : darkColors;

  const value = useMemo<ThemeValue>(() => ({ colors, scheme, pref, setScheme }), [colors, scheme, pref, setScheme]);
  return createElement(ThemeContext.Provider, { value }, children);
}

/** The active palette. */
export function useTheme(): Palette {
  return useContext(ThemeContext).colors;
}

/** Scheme state + setter for the chooser / StatusBar. */
export function useScheme(): { pref: SchemePref; scheme: Scheme; setScheme: (p: SchemePref) => void } {
  const { pref, scheme, setScheme } = useContext(ThemeContext);
  return { pref, scheme, setScheme };
}

/** Build StyleSheet from the active palette + grab the palette for inline colors, in one hook.
 *  Usage:  const { c, styles } = useThemedStyles(makeStyles);  // makeStyles = (c) => StyleSheet.create({...}) */
export function useThemedStyles<T>(make: (c: Palette) => T): { c: Palette; styles: T } {
  const c = useTheme();
  const styles = useMemo(() => make(c), [c]);
  return { c, styles };
}
