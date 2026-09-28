/**
 * 便の形の見た目（7段階）。**絵文字もイラスト画像も使わない**（自前のSVG・線幅1.8）。
 *
 * 名前だけを7つ並べると「硬い便」と「やや硬い便」がどう違うのか読めない。
 * かといって写実的に描くとグロくなる（キャラのグロさを消した §10-3 と同じ問題）ので、
 * **形の特徴だけを図形に落とす**：分かれているか／表面が割れているか／輪郭があるか。
 * 色は付けない（茶色を足すと一気に生々しくなるし、theme に無い色が増える）。
 */
import React from 'react';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { colors } from '../lib/theme';
import type { StoolForm } from '../lib/types';

/** 横長の枠。1〜7で幅を変えないので、並べたときに大きさが比較にならない */
const VIEW = { w: 40, h: 24 };

export default function StoolFormIcon({
  form,
  size = 40,
  color = colors.textMuted,
}: {
  form: StoolForm;
  size?: number;
  color?: string;
}) {
  const stroke = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  /** 4（普通便）の輪郭。2・3もこれを土台にして、内側の線だけで違いを出す */
  const sausage = 'M11 7h18a5 5 0 0 1 0 10H11a5 5 0 0 1 0-10z';

  return (
    <Svg
      width={size}
      height={(size * VIEW.h) / VIEW.w}
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      // 意味は隣の名前と説明が持つ。読み上げでは飾りとして飛ばす
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {form === 1 ? (
        <>
          {/* ばらばらの小さいかたまり */}
          <Circle cx={11} cy={12} r={3.2} {...stroke} />
          <Circle cx={20} cy={12} r={3.2} {...stroke} />
          <Circle cx={29} cy={12} r={3.2} {...stroke} />
        </>
      ) : null}

      {form === 2 ? (
        <>
          {/* ごつごつ＝かたまりが連なっている */}
          <Path d={sausage} {...stroke} />
          <Path d="M16 7.6v8.8M21 7.6v8.8M26 7.6v8.8" {...stroke} />
        </>
      ) : null}

      {form === 3 ? (
        <>
          {/* 表面のひび割れ */}
          <Path d={sausage} {...stroke} />
          <Path d="M15 10l1.6 2.6M20 9.4l1.6 2.6M25.5 10.6l1.6 2.6" {...stroke} />
        </>
      ) : null}

      {form === 4 ? <Path d={sausage} {...stroke} /> : null}

      {form === 5 ? (
        <>
          {/* やわらかいかたまりが分かれている */}
          <Ellipse cx={14} cy={12} rx={7} ry={4.8} {...stroke} />
          <Ellipse cx={28} cy={12} rx={5} ry={4.2} {...stroke} />
        </>
      ) : null}

      {form === 6 ? (
        // 輪郭が崩れている（どろっと）
        <Path d="M9 10c4-3 19-3 23 0 2 2 1 6-2 6.6-5 1-14 1-19 0C8 16 7 12 9 10z" {...stroke} />
      ) : null}

      {form === 7 ? (
        <>
          {/* 固形がない＝水面の線だけ */}
          <Path d="M7 11q3-3 6 0t6 0t6 0t6 0" {...stroke} />
          <Path d="M7 16q3-3 6 0t6 0t6 0t6 0" {...stroke} />
        </>
      ) : null}
    </Svg>
  );
}
