/**
 * 2軸の目標と偏り判定のテスト。
 * 守りたいのは「1:2が総量とつながっていること」と「量だけ見て整っていると言わないこと」。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  SOLUBLE_CAP_G,
  SOLUBLE_SHARE_IDEAL,
  SOLUBLE_SHARE_MIN,
  axisTargets,
  balanceOf,
  solubleShare,
  targetsOf,
} from './targets.ts';
import type { Serving, Totals } from './types.ts';

const servings: Serving[] = JSON.parse(
  readFileSync(new URL('../data/generated/servings.json', import.meta.url), 'utf8')
);
const find = (label: string) => servings.find((s) => s.label === label)!;
const dayOf = (labels: string[]): Totals =>
  labels.reduce(
    (a, label) => {
      const s = find(label);
      return {
        total: a.total + s.total,
        soluble: a.soluble + s.soluble,
        insoluble: a.insoluble + s.insoluble,
      };
    },
    { total: 0, soluble: 0, insoluble: 0 }
  );

test('目標18gでは従来の 6g / 12g に一致する（配分の根拠を崩していない）', () => {
  assert.deepEqual(axisTargets(18), { soluble: 6, insoluble: 12 });
});

test('2軸の目標は総量から1:2で出る。合計は必ず総量に一致する', () => {
  for (const total of [18, 21, 25, 30]) {
    const { soluble, insoluble } = axisTargets(total);
    assert.equal(soluble + insoluble, total, `目標${total}g で合計が総量と一致しない`);
    assert.ok(soluble > 0 && insoluble > soluble, `目標${total}g で水溶性が不溶性を超えている`);
  }
});

test('水溶性の目標は8gで打ち止め（毎日狙える範囲に留める）', () => {
  assert.equal(axisTargets(21).soluble, 7);
  assert.equal(axisTargets(25).soluble, SOLUBLE_CAP_G);
  assert.equal(axisTargets(30).soluble, SOLUBLE_CAP_G);
  // 上限に当たるまでは理想比どおり
  assert.ok(Math.abs(axisTargets(18).soluble / 18 - SOLUBLE_SHARE_IDEAL) < 1e-9);
  assert.ok(Math.abs(axisTargets(21).soluble / 21 - SOLUBLE_SHARE_IDEAL) < 0.01);
});

test('既定の目標25gなら 8g / 17g', () => {
  assert.deepEqual(targetsOf(25), { total: 25, soluble: 8, insoluble: 17 });
});

test('量を満たしていても比が1:3より悪ければ「菌のごはんが少なめ」と判定する', () => {
  // 実データ: 豆と乾物を積んだ日。総量39.5g 水溶8.2g 不溶31.2g = 1:3.8（割合21%）
  // 旧実装（各軸の閾値だけ）では both = 「きれいに整っています」と言ってしまっていたケース
  const skewed = dayOf([
    'いんげん豆(ゆで)',
    'おから',
    '干し柿',
    'ごぼう(ゆで)',
    'ブロッコリー',
    'もち麦ごはん',
    '納豆',
    'ひよこ豆(ゆで)',
  ]);
  const targets = targetsOf(25);
  assert.ok(skewed.soluble >= targets.soluble, `水溶性の量は足りている前提: ${skewed.soluble.toFixed(2)}g`);
  assert.ok(skewed.insoluble >= targets.insoluble, '不溶性の量も足りている前提');
  assert.ok(solubleShare(skewed) < SOLUBLE_SHARE_MIN, `割合 ${(solubleShare(skewed) * 100).toFixed(0)}%`);
  assert.equal(balanceOf(skewed, targets), 'soluble-low', '量だけ見て「整っている」と言ってはいけない');
});

test('菌のごはんに寄りすぎた日は「かさが足りない」と判定する', () => {
  // もち麦・パスタ中心の日。総量25.8g 水溶12.1g 不溶13.8g（割合47%）
  // 総量は目標に届いているが、おそうじ17gに足りない
  const solubleHeavy = dayOf(['パスタ(ゆで)', 'もち麦ごはん', 'らっきょう', '納豆', 'ブロッコリー']);
  const targets = targetsOf(25);
  assert.ok(solubleHeavy.total >= targets.total);
  assert.ok(solubleShare(solubleHeavy) >= SOLUBLE_SHARE_MIN);
  assert.equal(balanceOf(solubleHeavy, targets), 'insoluble-low');
});

test('目標25gの 8g / 17g はプリセットだけで同時に届く', () => {
  const day = dayOf([
    'もち麦ごはん',
    'パスタ(ゆで)',
    'らっきょう',
    '納豆',
    'ごぼう(ゆで)',
    'ブロッコリー',
    '干し柿',
  ]);
  const targets = targetsOf(25);
  assert.ok(day.total >= targets.total, `総量 ${day.total.toFixed(1)}g`);
  assert.ok(day.soluble >= targets.soluble, `菌のごはん ${day.soluble.toFixed(1)}g`);
  assert.ok(day.insoluble >= targets.insoluble, `おそうじ ${day.insoluble.toFixed(1)}g`);
  assert.equal(balanceOf(day, targets), 'both');
});

test('4つの判定が出そろう（コーチのトリガーが全部使われる）', () => {
  const targets = targetsOf(18);
  assert.equal(balanceOf({ total: 20, soluble: 7, insoluble: 13 }, targets), 'both');
  assert.equal(balanceOf({ total: 18, soluble: 4, insoluble: 14 }, targets), 'soluble-low');
  assert.equal(balanceOf({ total: 18, soluble: 8, insoluble: 10 }, targets), 'insoluble-low');
  assert.equal(balanceOf({ total: 5, soluble: 1, insoluble: 4 }, targets), 'none');
});

test('記録が無い日は割合0でも「偏っている」と言わない（0gを罰しない）', () => {
  const empty = { total: 0, soluble: 0, insoluble: 0 };
  assert.equal(solubleShare(empty), 0);
  // 量が足りていないので none（＝総量の話をする）。soluble-low にはしない
  assert.equal(balanceOf(empty, targetsOf(25)), 'none');
});
