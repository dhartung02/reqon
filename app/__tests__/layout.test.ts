import { isWide, WIDE_BREAKPOINT } from '../src/useLayout';

describe('isWide breakpoint', () => {
  it('phones are narrow', () => {
    expect(isWide(390)).toBe(false); // iPhone portrait
    expect(isWide(430)).toBe(false); // large phone portrait
    expect(isWide(WIDE_BREAKPOINT - 1)).toBe(false);
  });
  it('tablets are wide', () => {
    expect(isWide(WIDE_BREAKPOINT)).toBe(true);
    expect(isWide(810)).toBe(true); // iPad portrait
    expect(isWide(1194)).toBe(true); // iPad landscape
  });
});
