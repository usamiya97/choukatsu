/**
 * 配色のコントラスト比を固定するテスト。
 *
 * 色は「あとで少し明るくしよう」で簡単に壊れるので、比率を数値で縛っておく。
 * 基準は WCAG 2.1: 本文 4.5:1 / 大きい文字 3:1 / 図形(バー・アイコン) 3:1。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colors, hit, space, type } from './theme.ts';

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
