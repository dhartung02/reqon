import Svg, { Circle, Line } from 'react-native-svg';
import { colors } from '../theme';

// Minimal monochrome gear (settings) — ring + 8 radial teeth. On-brand, no icon-font dependency.
const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function SettingsIcon({ size = 18, color = colors.textBase }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={5} stroke={color} strokeWidth={2} />
      {ANGLES.map((a) => {
        const r = (a * Math.PI) / 180;
        return (
          <Line
            key={a}
            x1={12 + Math.cos(r) * 7.5}
            y1={12 + Math.sin(r) * 7.5}
            x2={12 + Math.cos(r) * 10.5}
            y2={12 + Math.sin(r) * 10.5}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );
}
