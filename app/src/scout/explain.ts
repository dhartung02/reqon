import { PRIORITY_KW, SECONDARY_KW, bandAdj, remoteMode } from './scoring';
import type { Role } from '../model';

// Deterministic "why this score" rationale, derived from the row's stored fields (title, fit, prob,
// tier, location). Mirrors the scout's own signals so the score is legible. Note: only the title is
// stored, not the full job description — so domain hits are read from the title, with an honest
// fallback when the fit clearly came from the description at scout time.
export type RationaleTone = 'good' | 'bad' | 'neutral';
export interface RationaleLine {
  text: string;
  tone: RationaleTone;
}

/** Compact remote-posture badge for list rows. null when the location is unknown. */
export interface RemoteBadge {
  label: string;
  tone: RationaleTone;
}
export function remoteBadge(location?: string): RemoteBadge | null {
  if (!location || !location.trim()) return null;
  const rm = remoteMode(location);
  if (rm === 'remote') return { label: 'Remote', tone: 'good' };
  if (rm === 'flex') return { label: 'Hybrid', tone: 'neutral' };
  return { label: 'On-site', tone: 'bad' };
}

const found = (text: string, kws: string[]) => kws.filter((k) => text.includes(k));
const quote = (xs: string[]) => xs.slice(0, 3).map((x) => `“${x}”`).join(', ');

export function explainScore(role: Pick<Role, 'role' | 'fit' | 'prob' | 'tier' | 'location' | 'score'>): RationaleLine[] {
  const title = role.role.toLowerCase();
  const lines: RationaleLine[] = [];

  // Domain match
  const pri = found(title, PRIORITY_KW);
  const sec = found(title, SECONDARY_KW);
  if (pri.length) lines.push({ text: `Strong domain match — ${quote(pri)} in the title`, tone: 'good' });
  else if (sec.length) lines.push({ text: `Adjacent domain — ${quote(sec)} in the title`, tone: 'neutral' });
  else if (role.fit >= 6.8) lines.push({ text: 'Domain signal came from the job description at scout time, not the title', tone: 'neutral' });
  else lines.push({ text: `Few domain keywords matched — fit ${role.fit}`, tone: 'bad' });

  // Seniority band
  const band = bandAdj(title);
  if (band > 0) lines.push({ text: 'Seniority above target (Principal / Director) — lifts interview odds', tone: 'good' });
  else if (band < 0) lines.push({ text: 'Below target seniority (Manager-level) — lowers interview odds', tone: 'bad' });
  else lines.push({ text: 'Seniority on target (Senior / Staff / Lead) — neutral', tone: 'neutral' });

  // Remote posture
  const rm = remoteMode(role.location);
  if (rm === 'remote') lines.push({ text: 'Remote — matches your remote-only preference', tone: 'good' });
  else if (rm === 'flex') lines.push({ text: 'Hybrid / flex — acceptable if genuinely remote-friendly', tone: 'neutral' });
  else lines.push({ text: 'On-site — penalized (you’re remote-only)', tone: 'bad' });

  // Tier / expected value
  lines.push({ text: `Tier ${role.tier} — expected value ${role.score.toFixed(1)} (fit ${role.fit} × prob ${role.prob} ÷ 10)`, tone: 'neutral' });

  return lines;
}
