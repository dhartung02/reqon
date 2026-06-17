import { useWindowDimensions } from 'react-native';

// Responsive breakpoint. Below WIDE → phone single-column + push navigation (unchanged). At/above
// → the iPad shell: a left nav rail + master-detail (list + detail side by side). 768 is the classic
// tablet cut, so iPad portrait (~810–834pt) and landscape both get the wide layout; phones don't
// (even large phones in landscape stay under it in practice).
export const WIDE_BREAKPOINT = 768;

export const isWide = (width: number): boolean => width >= WIDE_BREAKPOINT;

export function useLayout(): { wide: boolean; width: number } {
  const { width } = useWindowDimensions();
  return { wide: isWide(width), width };
}
