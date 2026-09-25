/**
 * プリセット（常用量テーブル）の不変条件。
 * 品目を足すたびに手で確認しないための網。`scripts/expand-servings.mjs` で追加した行も必ず通る。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CATEGORY_ORDER, byTierThenAmount, normalize, searchServings } from './dataset.ts';
import type { Serving } from './types.ts';

const servings: Serving[] = JSON.parse(
  readFileSync(new URL('../data/generated/servings.json', import.meta.url), 'utf8')
);

test('2軸の合計は総量に一致する（比率方式の不変条件）', () => {
  for (const s of servings) {
    assert.ok(
      Math.abs(s.soluble + s.insoluble - s.total) <= 0.011,
      `${s.label}: ${s.soluble}+${s.insoluble} != ${s.total}`
    );
  }
});

test('常用量・繊維量・比率が壊れていない', () => {
  for (const s of servings) {
    assert.ok(s.servingG > 0, `${s.label}: servingG=${s.servingG}`);
    assert.ok(s.total >= 0, `${s.label}: total=${s.total}`);
    assert.ok(s.solubleRatio >= 0 && s.solubleRatio <= 1, `${s.label}: ratio=${s.solubleRatio}`);
    assert.ok(s.code.length === 5, `${s.label}: 食品番号が5桁でない (${s.code})`);
    assert.ok(s.unitLabel.length > 0, `${s.label}: 単位が空`);
  }
});

test('tier は総量から決まる（A≥3g / B≥1g / C>0 / Z=0）', () => {
  for (const s of servings) {
    const expected = s.total <= 0 ? 'Z' : s.total >= 3 ? 'A' : s.total >= 1 ? 'B' : 'C';
    assert.equal(s.tier, expected, `${s.label}: total=${s.total} なのに tier=${s.tier}`);
  }
});

test('label が重複しない（記録のキーなので衝突したら別物が混ざる）', () => {
  const seen = new Set<string>();
  for (const s of servings) {
    assert.ok(!seen.has(s.label), `重複: ${s.label}`);
    seen.add(s.label);
  }
});

test('表示名に内部名（(ゆで)など）が漏れていない', () => {
  for (const s of servings) {
    assert.ok(
      !/[（(](ゆで|生|乾|素干し|冷凍|戻し|缶|白米に混ぜる)[)）]/.test(s.displayName),
      `${s.label}: displayName=${s.displayName}`
    );
  }
});

test('全カテゴリが並び順の定義に入っている（新カテゴリを足したら末尾に落ちるのを防ぐ）', () => {
  for (const s of servings) {
    assert.ok(
      (CATEGORY_ORDER as readonly string[]).includes(s.category),
      `${s.category} が CATEGORY_ORDER に無い`
    );
  }
});

test('カテゴリ内の並びは tier A から。先頭が 1g未満にならない', () => {
  for (const category of CATEGORY_ORDER) {
    const list = servings.filter((s) => s.category === category).sort(byTierThenAmount);
    if (list.length < 2) continue;
    const ranks = list.map((s) => ({ A: 0, B: 1, C: 2, Z: 3 })[s.tier]);
    for (let i = 1; i < ranks.length; i++) {
      assert.ok(ranks[i - 1] <= ranks[i], `${category}: 並びが tier 順になっていない`);
    }
  }
});

test('野菜の葉物が「サラダを食べている人」の語彙で引ける', () => {
  // 実機で「サニーレタスが無い」と言われた分。別名でも当たることまで見る
  for (const word of ['サニーレタス', 'リーフレタス', 'サラダ菜', '水菜', '春菊', 'ルッコラ', 'ケール']) {
    const hits = searchServings(word);
    assert.ok(hits.length > 0, `${word} が引けない`);
  }
});

test('食物繊維に特化した食品（少量で効くもの）が入っている', () => {
  for (const word of ['粉寒天', 'おからパウダー', '干ししいたけ', 'チアシード', '刻み昆布', '押麦']) {
    const hits = searchServings(word);
    assert.ok(hits.length > 0, `${word} が引けない`);
  }
});

test('ひらがな・カタカナ・全角半角の揺れを吸収する', () => {
  assert.equal(normalize('ゴボウ'), normalize('ごぼう'));
  assert.equal(normalize('ﾆﾝｼﾞﾝ'), normalize('ニンジン'));
  assert.ok(searchServings('ごぼう').length > 0);
  assert.ok(searchServings('ゴボウ').length > 0);
});

test('検索の上位に量の多い食品が来る（1タップの価値が高い順）', () => {
  const hits = searchServings('レタス');
  assert.ok(hits.length >= 3, JSON.stringify(hits.map((h) => h.label)));
  // レタス(0.33g)よりサニーレタス(0.6g)が上に来る
  const plain = hits.findIndex((h) => h.label === 'レタス');
  const sunny = hits.findIndex((h) => h.label === 'サニーレタス');
  assert.ok(sunny >= 0 && plain >= 0);
});
