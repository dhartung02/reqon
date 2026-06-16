import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { fonts, useThemedStyles, type Palette } from '../theme';

// Plain-language reference for how the scores are computed. Static content — mirrors the scout
// scorer (scoreFit / scoreProb), the shared core (computeTier), and the server's /api/assist prompt.
// Reached from Settings → "How scoring works".

interface Block {
  heading: string;
  body: string[];
}

const BLOCKS: Block[] = [
  {
    heading: 'Fit (0–10)',
    body: [
      'How well a role matches your domains and résumé. Driven by keywords in the title and job description.',
      'A priority domain in the title (CDP, data platform, AI/LLM/MCP, identity/IAM, martech, API/developer platform) scores ~8.5+. A secondary domain (pricing, usage-billing, catalog, commerce) scores ~7. Matches only in the description score ~6.8–7.5. Generic platform/enterprise terms score ~6. Nothing relevant scores ~5.',
      'Your Search-criteria keywords feed this too — adding one makes it count as a priority signal.',
    ],
  },
  {
    heading: 'Interview probability (0–10)',
    body: [
      'The odds of landing a screen — not just whether you fit, but whether they’re likely to talk to you.',
      'Starts near the fit score, then adjusts: seniority band (Principal / Director lift it, plain Manager lowers it), remote posture (remote helps, on-site is penalized since you’re remote-only), and a bump for Acxiom-heritage / referral paths.',
    ],
  },
  {
    heading: 'Expected value (EV) — the “Score”',
    body: [
      'EV = fit × prob ÷ 10. It blends “how good a match” with “how likely a conversation” into one ranking number — the “Score” shown on each card and used to sort.',
      'Example: fit 8 × prob 7 ÷ 10 = 5.6.',
    ],
  },
  {
    heading: 'Tiers A / B / C',
    body: [
      'Tier A needs all three: EV ≥ 5.2, fit ≥ 8, and prob ≥ 6.5 — a strong match they’re likely to screen.',
      'Tier B is EV ≥ 4.0. Anything below falls to Tier C.',
      'These thresholds are yours to tune in Settings → Tiers & rules.',
    ],
  },
  {
    heading: '“Minimum fit” vs the tier bars',
    body: [
      'These look similar but do different jobs. Search criteria → “Minimum fit” (default 6.0) is the floor for a role to be surfaced at all. Tier A’s “min fit 8.0” is the higher bar to be labelled top-tier.',
      'Also note the units differ: minimum fit is a fit score (0–10), while Tier A’s “min expected value 5.2” is an EV (fit × prob ÷ 10) — so 6.0 and 5.2 aren’t directly comparable.',
    ],
  },
  {
    heading: 'Scout merge tier',
    body: [
      'Controls how selective the scout is when it auto-adds finds: “A only” keeps just top-tier, “A & B” adds strong + solid, “All tiers” keeps everything it scores.',
    ],
  },
  {
    heading: 'AI draft assistant — what it sees',
    body: [
      'Runs on your connected server (needs an OpenAI key); it’s off when no server is set. It drafts a cover note (~150–220 words) or a screening answer (~120–180 words).',
      'Context it’s given: your name, the target company/role, the role’s job description, and — as the only source of facts — your profile’s narrative library. It’s instructed to write first-person and PM-level, stay honest, and never invent employers, metrics, or titles.',
      'It’s capped per day, logged, and never auto-submitted — every draft is yours to review, edit, and send.',
    ],
  },
];

export function ScoringGuideScreen({ onBack }: { onBack: () => void }) {
  const { styles } = useThemedStyles(makeStyles);
  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.scroll}>
      <View style={styles.headRow}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹ Settings</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>How scoring works</Text>
      <Text style={styles.intro}>Every role gets a Fit and an Interview-probability score; together they set Expected value and the A/B/C tier. Here’s what each means.</Text>

      {BLOCKS.map((b) => (
        <View key={b.heading} style={styles.block}>
          <Text style={styles.heading}>{b.heading}</Text>
          {b.body.map((p, i) => (
            <Text key={i} style={styles.body}>{p}</Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.canvas },
  scroll: { padding: 24, gap: 20, paddingBottom: 48 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: c.emerald },
  title: { fontFamily: fonts.serif, fontSize: 26, fontWeight: '600', color: c.textHigh, marginTop: -8 },
  intro: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase, lineHeight: 20, marginTop: -8 },
  block: { gap: 6 },
  heading: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase', color: c.emerald },
  body: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase, lineHeight: 21 },
});
