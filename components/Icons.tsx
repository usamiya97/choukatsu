/**
 * 画面で使う小さなアイコン。絵文字は使わない（pro-rules: Icons & Visual Elements）。
 * 線の太さ 1.8・サイズは icon トークンから、と TabIcon と同じ規則に揃えている。
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { colors, icon } from '../lib/theme';

type IconProps = { size?: number; color?: string };

const base = (color: string) => ({
  stroke: color,
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

export function PlusIcon({ size = icon.sm, color = colors.accentStrong }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" {...base(color)} />
    </Svg>
  );
}

export function TrashIcon({ size = icon.sm, color = colors.textMuted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" {...base(color)} />
    </Svg>
  );
}

export function ChevronRightIcon({ size = icon.sm, color = colors.textMuted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 5l7 7-7 7" {...base(color)} />
    </Svg>
  );
}

export function CloseIcon({ size = icon.sm, color = colors.textMuted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" {...base(color)} />
    </Svg>
  );
}

export function CheckIcon({ size = icon.sm, color = colors.accentStrong }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 13l4 4L19 7" {...base(color)} />
    </Svg>
  );
}
