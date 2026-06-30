import { View, Text, StyleSheet } from 'react-native';
import { alpha, fonts, tierColor, useThemedStyles, type Palette } from '../theme';
import { tierWord, type Role } from '../model';

// The signature fit dial: a ringed circle in the tier color with the score in Fraunces,
// and the plain match-strength word (Strong / Possible / Long shot) beneath it. Replaces the
// old "TIER A" badge + "Score: X/10" text. Pure presentation — derives everything from props.
export function ScoreCircle({ score, tier, size = 46 }: { score: number; tier: Role['tier']; size?: number }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const accent = tierColor(tier, c);
  const ringWidth = size >= 80 ? 3 : 2;
  const num = Math.round(size * 0.36);
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, borderWidth: ringWidth, borderColor: accent, backgroundColor: alpha(c.textHigh, 0.04) },
        ]}
      >
        <Text style={[styles.score, { color: accent, fontSize: num }]}>{score.toFixed(1)}</Text>
      </View>
      <Text style={[styles.word, { color: accent }]}>{tierWord(tier)}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', gap: 4 },
    circle: { alignItems: 'center', justifyContent: 'center' },
    score: { fontFamily: fonts.serif, fontWeight: '600' },
    word: { fontFamily: fonts.sans, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  });
