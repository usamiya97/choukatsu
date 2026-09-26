/**
 * 表示ルールのテスト。守りたいのは「小数点を出さない」「0g食品にちゃんと0gと答える」
 * 「禁止食品をヒントに出さない」の3つ。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  bannedLabels,
  fiberOf,
  fillRatio,
  gramsOf,
  modulation,
  progressWord,
  remainHint,
  servingLabel,
  stepCount,
} from './format.ts';
import type { Caution, Serving } from './types.ts';

const load = <T,>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../data/generated/${name}.json`, import.meta.url), 'utf8'));
const servings = load<Serving[]>('servings');
const cautions = load<Caution[]>('cautions');

test('進捗の文言に小数点が出ない', () => {
  const words = [0, 0.4, 3.7, 14.3, 17.9, 18, 25.2].map((v) => progressWord(v, 18));
  for (const w of words) assert.ok(!/\d\.\d/.test(w), w);
  assert.equal(progressWord(14.3, 18), '今日は 18g目標の 7割くらい');
  assert.equal(progressWord(18.0, 18), '今日は目標に届きました');
  assert.equal(progressWord(25.2, 18), '今日は目標に届きました', '超過を責めず達成として扱う');
});

test('メーターの塗りは0..1で止まる（超過してもはみ出さない）', () => {
  assert.equal(fillRatio(-5, 18), 0);
  assert.equal(fillRatio(9, 18), 0.5);
  assert.equal(fillRatio(30, 18), 1);
});

test('残りは「あと○○分」で言う。数値では言わない', () => {
  const hint = remainHint(3.5, servings, { cautions });
  assert.ok(hint);
  assert.equal(hint.mode, 'close');
  assert.ok(hint.text.startsWith('あと '), hint.text);
  // 残り3.5gに近い1品が選ばれている
  assert.ok(Math.abs(hint.serving.total - 3.5) < 0.6, `${hint.serving.label} ${hint.serving.total}`);
});

test('1品では届かない距離のときは「あと○○分」と言わない（それだけで届くように読める）', () => {
  // 何も記録していない日の残り18g。プリセット最大の1品(パスタ7.5g)でも届かない
  const hint = remainHint(18, servings, { cautions });
  assert.ok(hint);
  assert.equal(hint.mode, 'start');
  assert.ok(hint.text.startsWith('まずは '), hint.text);
  assert.ok(!hint.text.includes('あと'), hint.text);
});

test('達成していれば「あと」は出さない', () => {
  assert.equal(remainHint(0, servings, { cautions }), null);
  assert.equal(remainHint(-2, servings, { cautions }), null);
});

test('0g食品(tier Z)と禁止食品はヒントに出さない', () => {
  const banned = bannedLabels(cautions, 'soluble');
  assert.ok(banned.size > 0);
  for (let remain = 0.2; remain < 18; remain += 0.2) {
    const hint = remainHint(remain, servings, { cautions, axis: 'soluble' });
    if (!hint) continue;
    assert.notEqual(hint.serving.tier, 'Z');
    assert.ok(!banned.has(hint.serving.label), hint.serving.label);
  }
});

test('ユーザーが苦手と答えた食品はヒントに出ない', () => {
  const hint = remainHint(4, servings, { cautions, excluded: servings.map((s) => s.label) });
  assert.equal(hint, null, '全部除外したら何も出さない（嘘の候補を作らない）');
});

test('表示名は内部名ではない（(ゆで)などを出さない）', () => {
  for (const s of servings) {
    assert.ok(!/[（(](ゆで|素干し|白米に混ぜる)[)）]/.test(servingLabel(s)), servingLabel(s));
  }
});

test('見た目の変調パラメータは0..1.2に収まる', () => {
  const targets = { soluble: 6, insoluble: 12 };
  const m = modulation({ total: 40, soluble: 20, insoluble: 20 }, targets);
  assert.equal(m.satRatio, 1.2);
  assert.equal(m.bulkRatio, 1.2);
  const zero = modulation({ total: 0, soluble: 0, insoluble: 0 }, targets);
  assert.equal(zero.satRatio, 0);
});

test('量の刻みは0.5。範囲外には出さない', () => {
  assert.equal(stepCount(1, 1), 1.5);
  assert.equal(stepCount(1, -1), 0.5);
  assert.equal(stepCount(0.5, -1), 0.5, '最小0.5より下げない');
  assert.equal(stepCount(10, 1), 10, '最大10より上げない');
  // 端数が入っても刻みに丸める
  assert.equal(stepCount(1.2, 1), 1.5);
});

test('量からグラムと繊維量が出る', () => {
  const natto = servings.find((s) => s.label === '納豆')!;
  assert.equal(gramsOf(natto, 1), natto.servingG);
  assert.equal(gramsOf(natto, 0.5), Math.round(natto.servingG / 2));
  assert.ok(Math.abs(fiberOf(natto, 2) - natto.total * 2) < 1e-9);
});

test('2個以上は「× 2」と書く（単位を勝手に変えない）', () => {
  const natto = servings.find((s) => s.label === '納豆')!;
  assert.equal(servingLabel(natto, 1), `${natto.displayName} ${natto.unitLabel}`);
  assert.equal(servingLabel(natto, 2), `${natto.displayName} ${natto.unitLabel} × 2`);
  assert.equal(servingLabel(natto, 0.5), `${natto.displayName} ${natto.unitLabel} × 0.5`);
});
