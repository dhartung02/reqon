// Reqon brand tokens as a Tailwind theme extension — canonical reference for any Tailwind-based
// surface (web, a future NativeWind app layer). Mirrors BRAND.md §3 + brand/tokens.{json,css}.
// The native app currently consumes these via app/src/theme.ts (React Native StyleSheet).
module.exports = {
  theme: {
    extend: {
      colors: {
        reqon: {
          canvas: '#0B0C0E',   // deep premium obsidian — core background
          element: '#16181C',  // surface containers: cards, pipeline boards, extension popups
          emerald: '#00E5A3',  // Tier A / Signal Acquired / core Reticle Q
          amber: '#FFB800',    // Tier B / Warning / Syncing / Scout Active
          muted: '#64748B',    // Tier C / secondary text / suppressed noise
          text: {
            high: '#E2E8F0',   // high-contrast primary data text
            base: '#94A3B8',   // standard descriptive text
          },
        },
      },
      fontFamily: {
        sans: ['"Spline Sans"', 'sans-serif'], // UI, metrics, data grids, pipeline tracking
        serif: ['"Fraunces"', 'serif'],        // editorial headers, north-star lines
      },
      letterSpacing: {
        command: '0.18em', // all-caps wordmark/label tracking
      },
    },
  },
};
