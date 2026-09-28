/**
 * ローカル辞書のテスト。守りたいのは4つ。
 *  1. 短いキーの誤爆を最長一致で防ぐ（「煎餅」が「餅」にならない）
 *  2. 数量が次の品目に漏れない（これが漏れると勝手に3倍記録される）
 *  3. 同じ食材を2回記録しない（「ごぼうのきんぴら」）
 *  4. 助詞・時間帯・助数詞をLLMに渡さない（無駄な課金になる）
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookup, readCount, resolveMeal } from './lexicon.ts';

const names = (text: string, learned = {}) =>
  resolveMeal(text, learned).hits.map((h) => `${h.serving.displayName}×${h.count}`);

test('最長一致で短いキーの誤爆を防ぐ', () => {
  // 「餅」も「柿」も単独のキーだが、より長いキーがあるならそちらを採る
  assert.deepEqual(names('煎餅'), ['せんべい×1']);
  assert.deepEqual(names('干し柿'), ['干し柿×1']);
  assert.deepEqual(names('もち'), ['もち×1']);
});

test('ひらがな・カタカナ・全角半角の揺れを吸収する', () => {
  for (const q of ['ごぼう', 'ゴボウ', 'ｺﾞﾎﾞｳ', '牛蒡']) {
    assert.equal(lookup(q)?.label, 'ごぼう(ゆで)', q);
  }
});

test('文をまとめて走査する（助詞で割らない）', () => {
  assert.deepEqual(names('朝は納豆ごはん'), ['納豆×1', 'ごはん×1']);
});

test('数量を読む。0.5刻みで0.5〜10に収める', () => {
  assert.deepEqual(names('もち麦ごはん2杯'), ['もち麦ごはん×2']);
  assert.deepEqual(names('ブロッコリー半分'), ['ブロッコリー×0.5']);
  assert.deepEqual(names('納豆三パック'), ['納豆×3']);
  // 範囲外と刻み外は丸める
  assert.equal(readCount('x', 0, 1), 1);
  assert.equal(readCount('ごはん0.3', 0, 3), 0.5);
  assert.equal(readCount('ごはん99', 0, 3), 10);
  assert.equal(readCount('ごはん2.4', 0, 3), 2.5);
});

/**
 * いちばん危ない取り違え。前の品目の「3杯」を次の品目が拾うと、
 * 納豆1パックが3パックになって記録される。
 */
test('数量が次の品目に漏れない', () => {
  assert.deepEqual(names('もち麦ごはん3杯、納豆'), ['もち麦ごはん×3', '納豆×1']);
  assert.deepEqual(names('ごはん2杯とブロッコリー'), ['ごはん×2', 'ブロッコリー×1']);
});

test('同じ食材を2回記録しない（入れ子は長い方を採る）', () => {
  // 走査は左から進むので、素のままなら「ごぼう」→「きんぴらごぼう」で2件当たる
  assert.deepEqual(names('ごぼうのきんぴら'), ['きんぴらごぼう×1']);
});

test('助詞・時間帯・助数詞はLLMに渡さない', () => {
  const r = resolveMeal('今日の朝は、もち麦ごはん2杯と納豆1パックを食べました');
  assert.deepEqual(r.unresolved, [], `未解決: ${r.unresolved.join('/')}`);
});

test('辞書に無い語だけが未解決として残る', () => {
  const r = resolveMeal('朝は納豆ごはんとサラダ');
  assert.deepEqual(r.unresolved, ['サラダ']);
  assert.ok(r.hits.length === 2);
});

test('学習辞書はプリセットを上書きしない', () => {
  // 「ごはん」はプリセットのキーなので、学習辞書が別の品目を指しても勝てない
  const learned = { ゴハン: 'もち麦ごはん' };
  assert.deepEqual(names('ごはん', learned), ['ごはん×1']);
  // プリセットに無い語なら学習辞書が効く
  assert.deepEqual(names('ポテサラ', { ポテサラ: 'じゃがいも' }), ['じゃがいも×1']);
});

test('当たり率は当たった文字の割合', () => {
  assert.equal(resolveMeal('ラーメン').coverage, 1);
  assert.ok(resolveMeal('昼はポテトサラダとコロッケを食べた').coverage < 0.3);
  assert.equal(resolveMeal('').coverage, 0);
});
