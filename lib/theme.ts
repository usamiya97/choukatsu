/**
 * デザイントークン。画面に生の色・生の数値を書かず、必ずここを経由する。
 *
 * スタイルの方針は Soft UI 寄り（やわらかい影＋十分なコントラスト）。
 * 配色はピンク（ローズ）系。キャラ本体もピンク(hue 347〜350・明度73〜81%)なので、
 * **UIは「ごく淡い地」と「深いローズ」の2極だけ**に置き、キャラと同じ明度帯を空けている。
 * 中間の明るいピンクをUIに足すとキャラが地に溶けて段階が読めなくなる（ここが唯一の禁止事項）。
 * 色で意味を持たせるのは達成/未達の2つだけに絞っている。
 *
 * ライト固定にしている理由: キャラの色は明るい地の上での「血色」として
 * hue/sat/light を決めており（components/GutCharacter.tsx）、暗い地に置くと
 * 同じ値が「くすみ」に反転して、段階の読み方が崩れる。
 * ダークを出すならキャラの色域から作り直す必要があるので v1 では持たない
 * （app.json も userInterfaceStyle: "light" で固定してある）。
 */
export const colors = {
  bg: '#FDF4F7',
  card: '#FFFFFF',
  border: '#F0DCE5',
  /** 本文。bg に対して 15.1:1 */
  text: '#2A1C22',
  /** 補助テキスト。bg に対して 6.2:1（小さい字でも AA を満たす） */
  textMuted: '#6E5560',
  /** 達成の色。bg に対して 3.6:1（図形としてはOK・文字には使わない） */
  accent: '#DB4A87',
  /**
   * 文字を乗せる面と、進捗バーの塗り。
   * 白文字で 6.9:1 / accentSoft のトラックに対して 5.5:1。
   * accent をバーの塗りに使うとトラックとの差が 3:1 を切る
   */
  accentStrong: '#A62462',
  /** accentStrong の押下。白文字 9.0:1。画面ごとに生の暗いピンクを書かない */
  accentPressed: '#8A1A50',
  accentSoft: '#F7DFEA',
  /** タップできる面 */
  tap: '#FAF0F4',
  tapPressed: '#F7DFEA',
  badge: '#F5ECEF',
  /** 注意色。accentStrong と明度が近いので、色だけで削除を伝えない（必ずアイコン＋文字を添える） */
  danger: '#A33A31',
  /** トーストの地。text と同じ色の 92%（透けすぎると下の文字と混ざって読めない） */
  scrim: 'rgba(42,28,34,0.92)',
  /** scrim の不透明版。コントラスト計算用（透明度込みの実測はこの色に近い） */
  scrimHex: '#2A1C22',
} as const;

/**
 * 2軸（菌のごはん／おそうじ）の色。**キャラのどこに効くかと対応させる。**
 * soluble は「まわりの菌」と同じ緑(hue 158)、insoluble は本体と同じローズ。
 * 言葉だけでは2軸を覚えられないので、色でキャラと結びつける。
 *
 * 2つの塗りは明度がほぼ同じ（互いに 1.2:1）で、**色相でしか区別できない**。
 * だから軸のバーには必ず名前を添える（色だけで意味を持たせない）。
 * colors と同じ制約: 塗りは明度62%以下・トラックは90%以上（キャラの帯を空ける）。
 */
export const axisColors = {
  /** 塗り対トラック 4.9:1 / 白地に文字として 5.8:1 */
  soluble: { fill: '#1F7259', track: '#DFF0EA' },
  /** 塗り対トラック 5.5:1 */
  insoluble: { fill: colors.accentStrong, track: colors.accentSoft },
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
    shadowColor: '#2A1C22',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#2A1C22',
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
