import Svg, { Circle, Line } from 'react-native-svg';
import { darkColors } from '../theme';

type Variant = 'reticle' | 'solid';

interface Props {
  size?: number;
  color?: string;
  /** 'reticle' = dashed scope ring + tail (headers/large); 'solid' = bold ring + tail (small/16px). */
  variant?: Variant;
}

// The Reticle Q, on a 100×100 grid (BRAND.md §2). 'reticle' renders the 12/3/6/9 micro-gaps via a
// dash pattern; 'solid' drops them for ultra-low-resolution legibility (extension / tiny sizes).
// The glyph is the brand mark — it stays Tactical Emerald in both light and dark themes.
export function ReqonGlyph({ size = 24, color = darkColors.emerald, variant = 'reticle' }: Props) {
  const solid = variant === 'solid';
  const stroke = solid ? 14 : 10;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Circle
        cx={50}
        cy={50}
        r={solid ? 38 : 35}
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={solid ? undefined : '70 15 70 15'}
      />
      <Line
        x1={50}
        y1={50}
        x2={solid ? 80 : 75}
        y2={solid ? 80 : 75}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </Svg>
  );
}
