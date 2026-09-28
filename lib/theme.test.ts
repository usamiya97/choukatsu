/**
 * 配色のコントラスト比を固定するテスト。
 *
 * 色は「あとで少し明るくしよう」で簡単に壊れるので、比率を数値で縛っておく。
 * 基準は WCAG 2.1: 本文 4.5:1 / 大きい文字 3:1 / 図形(バー・アイコン) 3:1。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { axisColors, colors, hit, space, type } from './theme.ts';

/** 相対輝度（WCAG の定義） */
function luminance(hex: string): number {
  const ch = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** HSL の明度（%）。キャラの明度帯とUIの明度帯が重ならないことを見るために使う */
function lightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return ((Math.max(r, g, b) + Math.min(r, g, b)) / 2) * 100;
}

const WHITE = '#FFFFFF';

test('本文と補助テキストは 4.5:1 以上（背景・カード・タップ面のすべてで）', () => {
  for (const [name, bg] of [
    ['bg', colors.bg],
    ['card', colors.card],
    ['tap', colors.tap],
    ['badge', colors.badge],
  ] as const) {
    assert.ok(contrast(colors.text, bg) >= 4.5, `text on ${name}: ${contrast(colors.text, bg).toFixed(2)}`);
    assert.ok(
      contrast(colors.textMuted, bg) >= 4.5,
      `textMuted on ${name}: ${contrast(colors.textMuted, bg).toFixed(2)}`
    );
  }
});

test('塗りボタンの白文字は 4.5:1 以上', () => {
  assert.ok(contrast(WHITE, colors.accentStrong) >= 4.5, contrast(WHITE, colors.accentStrong).toFixed(2));
  assert.ok(contrast(WHITE, colors.scrimHex) >= 4.5, 'トーストの白文字');
});

test('進捗バーはトラックとの差が 3:1 以上（図形の基準）', () => {
  const ratio = contrast(colors.accentStrong, colors.accentSoft);
  assert.ok(ratio >= 3, `fill vs track: ${ratio.toFixed(2)}`);
});

test('accent は文字色に使わない前提（3:1 は超えるが 4.5:1 は超えない）', () => {
  // ここが 4.5 を超えたら「accentは図形専用」という制約を緩めてよい、という記録
  const ratio = contrast(colors.accent, colors.bg);
  assert.ok(ratio >= 3, `図形としては使える: ${ratio.toFixed(2)}`);
  assert.ok(ratio < 4.5, `文字には使えない: ${ratio.toFixed(2)}`);
});

test('押下色の白文字も 4.5:1 以上（accentStrong と同じ扱い）', () => {
  assert.ok(contrast(WHITE, colors.accentPressed) >= 4.5, contrast(WHITE, colors.accentPressed).toFixed(2));
});

/**
 * ピンク配色で唯一守らないといけない制約。
 * キャラ本体は明度73〜81%のピンク（components/GutCharacter.tsx の BASE）。
 * UIの面をそこまで暗くしたり、塗りをそこまで明るくしたりすると、
 * キャラが背景やボタンに溶けて「段階」が読めなくなる。だから中間帯を空けておく。
 */
test('UIの色はキャラの明度帯(73〜81%)に入らない', () => {
  for (const [name, c] of [
    ['bg', colors.bg],
    ['card', colors.card],
    ['tap', colors.tap],
    ['tapPressed', colors.tapPressed],
    ['badge', colors.badge],
    ['accentSoft', colors.accentSoft],
  ] as const) {
    assert.ok(lightness(c) >= 90, `面 ${name} は明るいまま: ${lightness(c).toFixed(1)}%`);
  }
  for (const [name, c] of [
    ['accent', colors.accent],
    ['accentStrong', colors.accentStrong],
    ['accentPressed', colors.accentPressed],
  ] as const) {
    assert.ok(lightness(c) <= 62, `塗り ${name} は暗いまま: ${lightness(c).toFixed(1)}%`);
  }
});

/**
 * 2軸のバー（components/AxisBars.tsx）。
 * 塗り同士は色相でしか区別できないので、**色だけで意味を持たせない**のが前提。
 * ここで縛るのは「バー自体が見えること」と「名前を軸の色で書けること」。
 */
test('2軸のバーは塗りとトラックの差が 3:1 以上、名前は文字として 4.5:1 以上', () => {
  for (const axis of ['soluble', 'insoluble'] as const) {
    const { fill, track } = axisColors[axis];
    assert.ok(contrast(fill, track) >= 3, `${axis} 塗り対トラック: ${contrast(fill, track).toFixed(2)}`);
    assert.ok(contrast(fill, colors.card) >= 4.5, `${axis} 名前をカード上に: ${contrast(fill, colors.card).toFixed(2)}`);
    assert.ok(contrast(fill, colors.bg) >= 4.5, `${axis} 名前を地の上に: ${contrast(fill, colors.bg).toFixed(2)}`);
    // キャラの明度帯(73〜81%)を空ける制約は軸の色にも効く
    assert.ok(lightness(fill) <= 62, `${axis} 塗りが明るすぎる: ${lightness(fill).toFixed(1)}%`);
    assert.ok(lightness(track) >= 90, `${axis} トラックが暗すぎる: ${lightness(track).toFixed(1)}%`);
  }
});

test('削除など注意色も 4.5:1 以上', () => {
  assert.ok(contrast(colors.danger, colors.card) >= 4.5, contrast(colors.danger, colors.card).toFixed(2));
});

test('タップ領域の最小値は 44pt 以上、余白は4の倍数', () => {
  assert.ok(hit.min >= 44, String(hit.min));
  for (const [name, v] of Object.entries(space)) {
    assert.equal(v % 4, 0, `${name}=${v} は4の倍数ではない`);
  }
});

test('本文は16px以上・行間1.4以上（読めない字を作らない）', () => {
  assert.ok(type.body.fontSize >= 16, String(type.body.fontSize));
  assert.ok(type.body.lineHeight / type.body.fontSize >= 1.4);
  // 最小サイズでも12px（これ未満は本文として使わない）
  assert.ok(type.tiny.fontSize >= 12, String(type.tiny.fontSize));
});
