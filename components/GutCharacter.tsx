import React from 'react';
import Svg, { Path, Circle, Ellipse, G, Defs, RadialGradient, Stop } from 'react-native-svg';

/**
 * 腸モチーフのキャラクター。
 *
 * 設計上の制約（DESIGN.md §2, §4 / 企画メモ 第13章）:
 *  - 臓器の形をなぞらない（ひだ・血管・内壁の質感を入れない）
 *    → 左側の二重のくびれだけで「とぐろ」を暗示し、それ以外は丸い生き物にする
 *  - 色は「血色」で表す（肌色系）。ただし彩度を抑え明度を高く保ち、生々しい赤・生肉の色域に入れない
 *    → 段階が上がる＝血色が良くなる、という読ませ方。まわりの菌は補色寄りの緑にして本体と分離する
 *  - 顔を付ける（表情があるものは臓器ではなくキャラとして認識される）
 *
 * 画像5枚の切り替えではなく1コンポーネントで表現している。
 * 段階の境界で不連続に変わるのではなく、中間状態を滑らかに出せるようにするため。
 */

export type GutCharacterProps = {
  /** 1..5 — 直近7日の総量平均で決まる段階（ヒステリシス適用後の値を渡す） */
  stage: 1 | 2 | 3 | 4 | 5;
  /** 0..1.2 — today_soluble / 6。色の鮮やかさ。v2で使用（v1は1.0固定でよい） */
  satRatio?: number;
  /** 0..1.2 — today_insoluble / 12。体のふくらみ。v2で使用（v1は1.0固定でよい） */
  bulkRatio?: number;
  /** 累積ユニーク食品数（0..プリセット数）。まわりの菌の数に反映（減らない） */
  floraCount?: number;
  size?: number;
  /**
   * まばたき中は目を閉じる。アニメーションの状態は外（GutCharacterLive）が持ち、
   * この部品は渡された状態を描くだけにしている（静止画としてもテストできるようにするため）。
   */
  blink?: boolean;
  /**
   * まわりの菌だけを描く（本体と顔を描かない）。
   * 菌だけを別レイヤーでゆっくり公転させるために、GutCharacterLive が使う。
   */
  bodyHidden?: boolean;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 段階ごとのベース。ピンク系（hue 347〜350）で「血色」を表す。
 * 色相はほぼ固定し、彩度と明度で進行を表す（実際の血色も色相ではなく彩度で変わる）。
 * 明度を73%以上に保ち彩度を46%までに抑えることで、生肉・内臓の色域に入らないようにしている。
 * ピンクは同じ明度でも桃色より重く見えるため、肌色版より明度を4ポイント上げてある。
 */
const BASE = {
  1: { hue: 350, sat: 10, light: 81, squash: 1.10, eye: 'closed', mouth: 'none' },
  2: { hue: 350, sat: 19, light: 79, squash: 1.05, eye: 'small', mouth: 'none' },
  3: { hue: 349, sat: 28, light: 77, squash: 1.00, eye: 'open', mouth: 'small' },
  4: { hue: 348, sat: 37, light: 75, squash: 0.97, eye: 'open', mouth: 'smile' },
  5: { hue: 347, sat: 46, light: 73, squash: 0.95, eye: 'happy', mouth: 'smile' },
} as const;

/** まわりの菌の色。本体（肌色）と分離させるため補色寄りの緑にする */
const FLORA_HUE = 158;

export default function GutCharacter({
  stage,
  satRatio = 1,
  bulkRatio = 1,
  floraCount = 0,
  size = 200,
  blink = false,
  bodyHidden = false,
}: GutCharacterProps) {
  const b = BASE[stage];
  // 段階1は元から目を閉じている（寝ている）ので、まばたきの対象にしない
  const eye = blink && b.eye !== 'closed' ? 'closed' : b.eye;

  // v2: 2軸で変調する。v1では satRatio=bulkRatio=1 なのでベースそのまま。
  const st = clamp(satRatio, 0, 1.2) / 1.2;
  const bt = clamp(bulkRatio, 0, 1.2) / 1.2;

  // 菌のごはん(水溶性) → 血色。足りないと血の気が引いた肌色になる
  const sat = clamp(b.sat * lerp(0.45, 1.2, st), 0, 54);
  const light = clamp(b.light + lerp(5, -2, st), 68, 88);

  // おそうじ(不溶性) → かさ。横の可動域を大きく取り「しぼむ / ふくらむ」を明確に読ませる
  const bulkX = lerp(0.72, 1.18, bt);
  const bulkY = lerp(0.82, 1.08, bt);

  const body = `hsl(${b.hue}, ${sat}%, ${light}%)`;
  const shade = `hsl(${b.hue + 3}, ${clamp(sat + 6, 0, 58)}%, ${Math.max(light - 14, 52)}%)`;
  const line = `hsl(${b.hue - 4}, ${clamp(sat + 2, 14, 40)}%, 38%)`;

  // まわりの菌（図鑑軸）。質が上限でも幅で伸び続けるので段階5の後も増える。
  const dots = Math.min(Math.floor(floraCount / 4), 30);

  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <RadialGradient id="glow" cx="38%" cy="30%" r="72%">
          <Stop offset="0%" stopColor="#fff" stopOpacity={stage >= 4 ? 0.5 : 0.22} />
          <Stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* まわりの菌。本体と色を分けて、かさの変化と混ざらないようにする */}
      <G opacity={0.75}>
        {Array.from({ length: dots }).map((_, i) => {
          const a = (i / Math.max(dots, 1)) * Math.PI * 2 + 0.4;
          const r = 82 + (i % 3) * 7;
          return (
            <Circle
              key={i}
              cx={100 + Math.cos(a) * r}
              cy={100 + Math.sin(a) * r * 0.92}
              r={i % 4 === 0 ? 3.2 : 2.2}
              fill={`hsl(${FLORA_HUE}, ${clamp(28 + sat * 0.4, 24, 48)}%, ${lerp(62, 50, st)}%)`}
            />
          );
        })}
      </G>

      {bodyHidden ? null : (
      <G
        transform={`translate(100 104) scale(${bulkX.toFixed(3)} ${(b.squash * bulkY).toFixed(3)}) translate(-100 -104)`}
      >
        {/* 本体。左側の二重のくびれだけが「とぐろ」の暗示 */}
        <Path
          d="M100 32 C142 32 172 62 172 102 C172 148 143 174 100 174
             C71 174 46 157 39 132 C34 113 50 107 50 97
             C50 83 34 79 39 63 C46 43 71 32 100 32 Z"
          fill={body}
          stroke={line}
          strokeWidth={2.2}
          strokeOpacity={0.55}
        />
        {/* 下側のやわらかい影。臓器の質感ではなく立体感のためだけに置く */}
        <Path
          d="M52 140 C72 166 132 168 160 138 C150 164 126 176 100 176 C74 176 60 162 52 140 Z"
          fill={shade}
          opacity={0.28}
        />
        <Path
          d="M100 32 C142 32 172 62 172 102 C172 148 143 174 100 174
             C71 174 46 157 39 132 C34 113 50 107 50 97
             C50 83 34 79 39 63 C46 43 71 32 100 32 Z"
          fill="url(#glow)"
        />

        {/* 顔 */}
        {eye === 'closed' ? (
          <>
            <Path d="M78 100 q8 6 16 0" stroke={line} strokeWidth={3} fill="none" strokeLinecap="round" />
            <Path d="M112 100 q8 6 16 0" stroke={line} strokeWidth={3} fill="none" strokeLinecap="round" />
          </>
        ) : eye === 'happy' ? (
          <>
            <Path d="M78 104 q8 -9 16 0" stroke={line} strokeWidth={3.4} fill="none" strokeLinecap="round" />
            <Path d="M112 104 q8 -9 16 0" stroke={line} strokeWidth={3.4} fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <Ellipse cx={86} cy={100} rx={eye === 'small' ? 2.6 : 4} ry={eye === 'small' ? 3.4 : 5} fill={line} />
            <Ellipse cx={120} cy={100} rx={eye === 'small' ? 2.6 : 4} ry={eye === 'small' ? 3.4 : 5} fill={line} />
          </>
        )}

        {b.mouth === 'smile' && (
          <Path d="M92 120 q11 11 22 0" stroke={line} strokeWidth={3.2} fill="none" strokeLinecap="round" />
        )}
        {b.mouth === 'small' && (
          <Path d="M96 119 q6 6 12 0" stroke={line} strokeWidth={2.8} fill="none" strokeLinecap="round" />
        )}

        {/* 段階5のつや */}
        {stage === 5 && (
          <>
            <Circle cx={142} cy={70} r={4.5} fill="#fff" opacity={0.85} />
            <Circle cx={152} cy={84} r={2.4} fill="#fff" opacity={0.6} />
          </>
        )}
      </G>
      )}
    </Svg>
  );
}

// 段階の解決（ヒステリシス付き）は lib/state.ts の resolveStage が唯一の定義。
// ここに同じ式を置くと閾値が二重管理になるので持たない。
