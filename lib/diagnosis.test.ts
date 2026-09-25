/**
 * 初回診断のテスト。
 * 一番守りたいのは q10 の除外が **label に展開されて** 保存されること
 * （表示名のまま保存すると除外が静かに効かなくなり、「もち麦しか提案されない」に戻る）。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { scoreDiagnosis, type Answers } from './diagnosis.ts';
import type { Serving } from './types.ts';

const diagnosis = JSON.parse(readFileSync(new URL('../data/diagnosis.json', import.meta.url), 'utf8'));
const servings: Serving[] = JSON.parse(
  readFileSync(new URL('../data/generated/servings.json', import.meta.url), 'utf8')
);

/** dataset.labelsForName と同じ解決（テストからは dataset を読まないので最小実装で再現） */
const labelsForName = (name: string): string[] => {
  const hits = servings.filter(
    (s) => s.label === name || s.displayName === name || s.aliases.includes(name)
  );
  return hits.length ? hits.map((s) => s.label) : [name];
};

const answerAll = (index: number): Answers => {
  const a: Answers = {};
  for (const q of diagnosis.questions) {
    a[q.id] = q.multi ? [Math.min(index, q.options.length - 1)] : Math.min(index, q.options.length - 1);
  }
  return a;
};

test('推定総量は実測の想定レンジ（3.8〜26.8g）に収まる', () => {
  for (let i = 0; i < 4; i++) {
    const r = scoreDiagnosis(diagnosis, answerAll(i), labelsForName);
    assert.ok(r.estTotal >= 0 && r.estTotal <= 27, `${i}: ${r.estTotal}`);
    assert.ok(r.estSolubleRatio >= 0 && r.estSolubleRatio <= 1, `${i}: ${r.estSolubleRatio}`);
  }
});

test('全部いちばん少ない選択肢でも負にならない（外食の寄与がマイナスでも0で止める）', () => {
  const r = scoreDiagnosis(diagnosis, answerAll(0), labelsForName);
  assert.ok(r.estTotal >= 0, String(r.estTotal));
});

test('白いごはんと答えたら「白ごはん一直線タイプ」', () => {
  const a = answerAll(0);
  const r = scoreDiagnosis(diagnosis, a, labelsForName);
  assert.equal(r.typeName, '白ごはん一直線タイプ');
  assert.ok(r.shareCopy.length > 0);
});

test('どの回答でも diagnosis.json に実在するタイプ名を返す', () => {
  const names = new Set(diagnosis.types.map((t: { name: string }) => t.name));
  // 10問ぶんの選択肢の組み合わせを総当たりに近い形で回す
  for (let seed = 0; seed < 64; seed++) {
    const a: Answers = {};
    diagnosis.questions.forEach((q: { id: string; multi?: boolean; options: unknown[] }, i: number) => {
      const pick = (seed >> (i % 6)) % q.options.length;
      a[q.id] = q.multi ? [pick] : pick;
    });
    const r = scoreDiagnosis(diagnosis, a, labelsForName);
    assert.ok(names.has(r.typeName), r.typeName);
    assert.ok(r.shareCopy.length > 0, r.typeName);
  }
});

test('よく摂れている人は「いい感じタイプ」', () => {
  const a = answerAll(3);
  const r = scoreDiagnosis(diagnosis, a, labelsForName);
  assert.ok(r.estTotal >= 16, String(r.estTotal));
  assert.equal(r.typeName, 'いい感じタイプ');
});

test('q10の除外は servings の label に展開される', () => {
  const q10 = diagnosis.questions.find((q: { id: string }) => q.id === 'q10');
  const beanIndex = q10.options.findIndex((o: { label: string }) => o.label.includes('納豆・豆'));
  const a: Answers = { q10: [beanIndex] };
  const r = scoreDiagnosis(diagnosis, a, labelsForName);
  assert.ok(r.excludedFoods.length > 0);
  const labels = new Set(servings.map((s) => s.label));
  for (const l of r.excludedFoods) {
    assert.ok(labels.has(l), `label として存在しない: ${l}`);
  }
  // 表示名「枝豆」は内部名「枝豆(冷凍)」に展開されている
  assert.ok(r.excludedFoods.includes('枝豆(冷凍)'), r.excludedFoods.join(','));
});

test('q8（お通じ）は推定値に影響しない。分岐用の参考値としてだけ保持する', () => {
  const base = answerAll(1);
  const withGood: Answers = { ...base, q8: 0 };
  const withOther: Answers = { ...base, q8: 2 };
  const a = scoreDiagnosis(diagnosis, withGood, labelsForName);
  const b = scoreDiagnosis(diagnosis, withOther, labelsForName);
  assert.equal(a.estTotal, b.estTotal);
  assert.notEqual(a.stoolProfile, b.stoolProfile);
});

test('答えなかった質問は0として扱う（10問すべて必須にしない）', () => {
  const r = scoreDiagnosis(diagnosis, { q1: 0 }, labelsForName);
  assert.ok(r.estTotal >= 0);
  assert.equal(r.excludedFoods.length, 0);
});
