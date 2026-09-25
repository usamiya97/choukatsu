/**
 * デザイントークン。画面に生の色・生の数値を書かず、必ずここを経由する。
 *
 * スタイルの方針は Soft UI 寄り（やわらかい影＋十分なコントラスト）。
 * 配色は「キャラが主役」なので、UIは彩度を落とした青緑〜灰で受け、
 * 色で意味を持たせるのは達成/未達の2つだけに絞っている。
 *
 * ライト固定にしている理由: キャラの色は明るい地の上での「血色」として
 * hue/sat/light を決めており（components/GutCharacter.tsx）、暗い地に置くと
 * 同じ値が「くすみ」に反転して、段階の読み方が崩れる。
 * ダークを出すならキャラの色域から作り直す必要があるので v1 では持たない
 * （app.json も userInterfaceStyle: "light" で固定してある）。
 */
export const colors = {
  bg: '#F7F9F8',
  card: '#FFFFFF',
  border: '#E3E9E7',
  /** 本文。bg に対して 14.0:1 */
  text: '#1E2A28',
  /** 補助テキスト。bg に対して 5.3:1（小さい字でも AA を満たす） */
  textMuted: '#5A6B68',
  /** 達成の色。まわりの菌の色(hue 158)と揃える。bg に対して 3.2:1（図形としてはOK・文字には使わない） */
  accent: '#2F9E7E',
  /**
   * 文字を乗せる面と、進捗バーの塗り。
   * 白文字で 5.8:1 / accentSoft のトラックに対して 4.9:1。
   * accent をバーの塗りに使うとトラックとの差が 2.8:1 で、図形の 3:1 を切る
   */
  accentStrong: '#1F7259',
  accentSoft: '#DCEFE8',
  /** タップできる面 */
  tap: '#F0F4F3',
  tapPressed: '#DCEFE8',
  badge: '#EEF2F1',
  danger: '#A33A31',
  /** トーストの地。text と同じ色の 92%（透けすぎると下の文字と混ざって読めない） */
  scrim: 'rgba(30,42,40,0.92)',
  /** scrim の不透明版。コントラスト計算用（透明度込みの実測はこの色に近い） */
  scrimHex: '#1E2A28',
} as const;

/** 4/8 のリズム。セクション間は lg 以上を使う */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** 最小タップ領域。iOS 44pt / Android 48dp に合わせて 48 を採用 */
export const hit = { min: 48 } as const;

export const icon = { sm: 18, md: 24, lg: 28 } as const;

/** 重なり順。画面ごとに好きな数字を書かない */
export const z = { base: 0, sticky: 10, toast: 30, modal: 50 } as const;

/**
 * モーション。マイクロインタラクションは 150〜300ms に収める。
 * idle は「生きている」ことを見せるための常時アニメなので、これだけ長い。
 */
export const motion = {
  fast: 150,
  base: 220,
  slow: 300,
  /** 呼吸1往復。段階が低いほど遅い（寝ている→起きている） */
  breath: { min: 2200, max: 4200 },
} as const;

/** やわらかい影。Androidは elevation、iOSは shadow* を使う */
export const elevation = {
  card: {
    shadowColor: '#1E2A28',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#1E2A28',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const;

/**
 * 本文16px・行間1.5 を基準にする。
 * 数字だけの大きい表示は maxFontSizeMultiplier で上限を掛ける（最大文字サイズで崩れるため）。
 */
export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800' as const, color: colors.text },
  title: { fontSize: 20, lineHeight: 28, fontWeight: '700' as const, color: colors.text },
  headline: { fontSize: 17, lineHeight: 25, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const, color: colors.text },
  small: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  tiny: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  /** セクション見出し。小さくても読めるよう text 色＋太字にする */
  label: { fontSize: 14, lineHeight: 21, fontWeight: '700' as const, color: colors.text },
} as const;
