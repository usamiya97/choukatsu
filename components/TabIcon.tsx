/**
 * タブのアイコン。4枚しかないので自前のSVGで持つ。
 *
 * ルール（pro-rules: Icons & Visual Elements）:
 *  - 絵文字は使わない（端末のフォント依存で見え方が変わり、色も制御できない）
 *  - 線の太さは全アイコンで 1.8 に統一。サイズは icon トークンから取る
 *  - 選択中は塗りを足すのではなく**同じ線のまま色だけ変える**
 *    （塗りと線が混ざると階層が読めなくなる）
 */
import React from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { icon } from '../lib/theme';

export type TabName = 'home' | 'log' | 'dex' | 'settings';

const STROKE = 1.8;

export default function TabIcon({
  name,
  color,
  size = icon.md,
}: {
  name: TabName;
  /** タブバーから渡ってくる色。RNの ColorValue をそのまま受ける */
  color: ColorValue;
  size?: number;
}) {
  const common = {
    stroke: color as string,
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' ? (
        <>
          <Path d="M4 10.5 12 4l8 6.5" {...common} />
          <Path d="M6 10v9h12v-9" {...common} />
        </>
      ) : name === 'log' ? (
        <>
          <Path d="M12 6v12" {...common} />
          <Path d="M6 12h12" {...common} />
          <Circle cx={12} cy={12} r={9} {...common} />
        </>
      ) : name === 'dex' ? (
        <>
          <Path d="M5 5h9a3 3 0 0 1 3 3v11H8a3 3 0 0 1-3-3z" {...common} />
          <Path d="M17 8h2v11H8" {...common} />
          <Path d="M9 9h5" {...common} />
        </>
      ) : (
        <>
          <Circle cx={12} cy={12} r={3} {...common} />
          <Path
            d="M12 3.5v2M12 18.5v2M4.9 7.8l1.7 1M17.4 15.2l1.7 1M4.9 16.2l1.7-1M17.4 8.8l1.7-1"
            {...common}
          />
        </>
      )}
    </Svg>
  );
}
