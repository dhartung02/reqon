// Best-effort salary extraction from free-text job descriptions / Ashby comp summaries.
// Board APIs rarely expose structured pay (Ashby sometimes does; Greenhouse/Lever almost never),
// so the salary floor is enforced only when a figure is actually found — an unknown salary is
// NEVER treated as a fail (we don't want to silently drop good roles that just omit pay).

// Require a leading "$" so retirement-plan mentions like "401k" / "403b" don't read as salary.
const K_RE = /\$\s?(\d{2,3})\s?[kK]\b/g; // $180k
const FULL_RE = /\$\s?(\d{3}(?:,\d{3})+|\d{6,7})\b/g; // $180,000 / $180000

/**
 * Return the highest plausible annual USD salary found in `text`, or null if none.
 * Picks the max so a posted range ("$150k–$200k") is judged on its top (the candidate anchors
 * to the top of band). Ignores values below $1,000 to skip hourly/other noise.
 */
export function parseMaxSalary(text?: string): number | null {
  if (!text) return null;
  let max = 0;
  let m: RegExpExecArray | null;
  K_RE.lastIndex = 0;
  while ((m = K_RE.exec(text))) {
    const v = parseInt(m[1], 10) * 1000;
    if (v >= 1000) max = Math.max(max, v);
  }
  FULL_RE.lastIndex = 0;
  while ((m = FULL_RE.exec(text))) {
    const v = parseInt(m[1].replace(/,/g, ''), 10);
    if (v >= 1000) max = Math.max(max, v);
  }
  return max > 0 ? max : null;
}

/**
 * True when this posting should be skipped for being below the floor. Only skips when a salary is
 * found AND it is clearly below the floor; unknown salary → keep (return false).
 */
export function belowSalaryFloor(text: string | undefined, floor: number): boolean {
  if (!floor || floor <= 0) return false;
  const max = parseMaxSalary(text);
  return max != null && max < floor;
}
