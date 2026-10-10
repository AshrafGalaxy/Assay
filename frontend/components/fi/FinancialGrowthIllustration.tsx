import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Rect,
  Circle,
  Path,
  Line,
  Defs,
  LinearGradient,
  Stop,
  G,
} from 'react-native-svg';

export function FinancialGrowthIllustration() {
  return (
    <View style={styles.container} pointerEvents="none">
      <Svg width={140} height={132} viewBox="0 0 140 132" fill="none">
        <Defs>
          {/* Soft Ambient Gold Glow */}
          <LinearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FBF4DF" stopOpacity="0.85" />
            <Stop offset="100%" stopColor="#FAF0D0" stopOpacity="0.25" />
          </LinearGradient>

          {/* 3D Bar Gold Gradient */}
          <LinearGradient id="goldBarGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#ECC85A" />
            <Stop offset="45%" stopColor="#D4A428" />
            <Stop offset="100%" stopColor="#B38715" />
          </LinearGradient>

          {/* Bar Highlight Sheen */}
          <LinearGradient id="barSheen" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
          </LinearGradient>
        </Defs>

        {/* 1. Ambient Background Aura Glow Circle */}
        <Circle cx="88" cy="62" r="50" fill="url(#glowGrad)" />

        {/* 2. White Document Sheet */}
        <G transform="translate(18, 14)">
          {/* Card Base */}
          <Rect
            x="0"
            y="0"
            width="68"
            height="80"
            rx="9"
            fill="#FFFFFF"
            stroke="#F0EFE8"
            strokeWidth="1.2"
          />
          {/* Document Content Lines */}
          <Line x1="10" y1="14" x2="38" y2="14" stroke="#E3E3DB" strokeWidth="2.5" strokeLinecap="round" />
          <Line x1="10" y1="22" x2="28" y2="22" stroke="#E8E8E0" strokeWidth="2" strokeLinecap="round" />
        </G>

        {/* 3. Ascending 3D Gold Bar Chart Pillars */}
        <G>
          {/* Bar 1 (Shortest) */}
          <Rect x="74" y="68" width="10" height="25" rx="3.5" fill="url(#goldBarGrad)" />
          <Rect x="74" y="68" width="10" height="6" rx="3" fill="url(#barSheen)" />

          {/* Bar 2 */}
          <Rect x="88" y="54" width="10" height="39" rx="3.5" fill="url(#goldBarGrad)" />
          <Rect x="88" y="54" width="10" height="7" rx="3" fill="url(#barSheen)" />

          {/* Bar 3 */}
          <Rect x="102" y="40" width="10" height="53" rx="3.5" fill="url(#goldBarGrad)" />
          <Rect x="102" y="40" width="10" height="8" rx="3" fill="url(#barSheen)" />

          {/* Bar 4 (Tallest) */}
          <Rect x="116" y="24" width="10" height="69" rx="3.5" fill="url(#goldBarGrad)" />
          <Rect x="116" y="24" width="10" height="9" rx="3" fill="url(#barSheen)" />
        </G>

        {/* 4. Ascending Golden Trend Arrow Line */}
        <G>
          <Path
            d="M 32 78 C 54 74, 76 60, 92 42 S 114 20, 122 14"
            fill="none"
            stroke="#C9991D"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* Arrow Head */}
          <Path
            d="M 112 11 L 126 10 L 124 24 Z"
            fill="#C9991D"
          />
        </G>

        {/* 5. Foreground Deep Navy Mini-Card with Gold Badge */}
        <G transform="translate(68, 70)">
          {/* Navy Card Body */}
          <Rect
            x="0"
            y="0"
            width="58"
            height="38"
            rx="8"
            fill="#0F172A"
          />
          {/* Mini Gold Sparkle Badge */}
          <Path
            d="M 12 11 Q 14 14 17 14 Q 14 14 12 17 Q 10 14 7 14 Q 10 14 12 11 Z"
            fill="#D6A928"
          />
          {/* Gold Account Metric Line */}
          <Line x1="22" y1="12" x2="50" y2="12" stroke="#D6A928" strokeWidth="2" strokeLinecap="round" />
          <Line x1="22" y1="18" x2="42" y2="18" stroke="rgba(255, 255, 255, 0.45)" strokeWidth="1.8" strokeLinecap="round" />
          <Line x1="8" y1="26" x2="48" y2="26" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1.6" strokeLinecap="round" />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 140,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
