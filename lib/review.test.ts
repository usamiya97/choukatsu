/**
 * 週の振り返りのテスト。
 *
 * ここで縛るのは「未記録日を0として平均しない」「小数点を出さない」
 * 「比べる材料が無い週を勝手に比べない」「共有テキストに禁止語と出典漏れが無い」。
 * 共有テキストは**数字が端末の外に出る唯一の経路**なので、検査を厚くしてある。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ATTRIBUTION } from './format.ts';
import { bannedWordsIn } from './safety.ts';
import {
  REVIEW_DAYS,
  compareWeeks,
  dayLine,
  previousWeekKey,
  reviewText,
  shortDate,
  signed,
  weekReview,
} from './review.ts';
import { putStool } from './stool.ts';
import { targetsOf } from './targets.ts';
import type { Logs, Serving, StoolLog } from './types.ts';

const servings: Serving[] = JSON.parse(
  readFileSync(new URL('../data/generated/servings.json', import.meta.url), 'utf8')
);
const find = (label: string) => servings.find((s) => s.label === label)!;
const TARGETS = targetsOf(25);

/** 2026-09-29 は火曜 */
const TODAY = '2026-09-29';
const day = (n: number) => {
  const d = new Date(2026, 8, 29 - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const logsWith = (entries: Record<string, string[]>): Logs =>
  Object.fromEntries(
    Object.entries(entries).map(([date, labels]) => [
      date,
      labels.map((label, i) => ({ label, count: 1, at: `${date}T0${i}:00:00.000Z` })),
    ])
  );

/** 1日で目標25gを超える組み合わせ（6タップ・到達テストと同じ） */
const ACHIEVED = ['パスタ(ゆで)', 'もち麦ごはん', '納豆', 'ごぼう(ゆで)', 'ブロッコリー', '干し柿'];

test('日付は曜日つきで出す。年は出さない', () => {
  assert.equal(shortDate('2026-09-29'), '9/29(火)');
  assert.equal(shortDate('2026-01-04'), '1/4(日)');
});

test('窓は直近7日。新しい順に並べる（今日が先頭）', () => {
  const r = weekReview({}, {}, servings, TODAY, TARGETS);
  assert.equal(r.days.length, REVIEW_DAYS);
  assert.equal(r.days[0].key, TODAY);
  assert.equal(r.to, TODAY);
  assert.equal(r.from, day(6));
  assert.equal(previousWeekKey(TODAY), day(7), '比較相手は7日前を端とする窓');
});

test('8日前の記録は窓に入らない', () => {
  const r = weekReview(logsWith({ [day(7)]: ACHIEVED }), {}, servings, TODAY, TARGETS);
  assert.equal(r.logDays, 0);
  assert.equal(r.avgTotal, 0);
});

test('平均は記録した日だけで出す（未記録日を0として割らない）', () => {
  const logs = logsWith({ [TODAY]: ['もち麦ごはん'], [day(3)]: ['もち麦ごはん'] });
  const r = weekReview(logs, {}, servings, TODAY, TARGETS);
  assert.equal(r.logDays, 2);
  assert.ok(Math.abs(r.avgTotal - find('もち麦ごはん').total) < 1e-9, '2日の平均＝1日ぶん');
  assert.ok(Math.abs(r.sumTotal - find('もち麦ごはん').total * 2) < 1e-9);
  // 2軸の平均も合計が総量に一致する（比率方式の不変条件）
  assert.ok(Math.abs(r.avgSoluble + r.avgInsoluble - r.avgTotal) < 1e-9);
});

test('目標に届いた日を数える。記録が無い日は届いた扱いにしない', () => {
  const logs = logsWith({ [TODAY]: ACHIEVED, [day(1)]: ['レタス'] });
  const r = weekReview(logs, {}, servings, TODAY, TARGETS);
  assert.equal(r.reachedDays, 1);
  assert.equal(r.days[0].reached, true);
  assert.equal(r.days[1].reached, false);
  assert.equal(r.days[2].logged, false);
  assert.equal(r.days[2].reached, false);
});

test('食物繊維とお通じが同じ日の行に並ぶ', () => {
  const stool: StoolLog = putStool({}, day(1), 2, 4, '2026-09-28T21:00:00.000Z');
  const r = weekReview(logsWith({ [day(1)]: ACHIEVED }), stool, servings, TODAY, TARGETS);
  assert.equal(r.days[1].key, day(1));
  assert.equal(r.days[1].stool?.count, 2);
  assert.match(dayLine(r.days[1]), /9\/28\(月\).*○ ／ 2回・普通便/);
  assert.match(dayLine(r.days[0]), /記録なし ／ お通じの記録なし/, '今日は両方とも未記録');
});

test('行の数字に小数点を出さない', () => {
  const r = weekReview(logsWith({ [TODAY]: ACHIEVED }), {}, servings, TODAY, TARGETS);
  assert.doesNotMatch(dayLine(r.days[0]), /\d+\.\d/);
});

test('前の7日に記録が無ければ比べない（0gと比べて「増えた」と言わない）', () => {
  const now = weekReview(logsWith({ [TODAY]: ACHIEVED }), {}, servings, TODAY, TARGETS);
  const prev = weekReview({}, {}, servings, previousWeekKey(TODAY), TARGETS);
  const diff = compareWeeks(now, prev);
  assert.equal(diff.avgTotal, null);
  assert.equal(diff.reachedDays, null);
  assert.equal(diff.stoolCount, null);
  assert.match(reviewText(now, prev, TARGETS), /前の7日は記録がないので、くらべていません/);
});

test('前の7日と比べられるときは差を符号つきで出す', () => {
  const logs = logsWith({ [TODAY]: ACHIEVED, [day(8)]: ['レタス'] });
  const now = weekReview(logs, {}, servings, TODAY, TARGETS);
  const prev = weekReview(logs, {}, servings, previousWeekKey(TODAY), TARGETS);
  const diff = compareWeeks(now, prev);
  assert.ok((diff.avgTotal ?? 0) > 0, '今週のほうが多い');
  assert.equal(diff.reachedDays, 1);
  assert.equal(signed(4.2, 'g'), '+4g');
  assert.equal(signed(-2, '日'), '−2日');
  assert.equal(signed(0.2, 'g'), '±0g', '丸めて0なら±0（嘘の増減を出さない）');
});

test('お通じの差は、どちらの週にも記録があるときだけ出す', () => {
  let stool: StoolLog = putStool({}, TODAY, 2, 4);
  const onlyNow = compareWeeks(
    weekReview({}, stool, servings, TODAY, TARGETS),
    weekReview({}, stool, servings, previousWeekKey(TODAY), TARGETS)
  );
  assert.equal(onlyNow.stoolCount, null, '前の7日にお通じの記録が無い');

  stool = putStool(stool, day(8), 1, 3);
  const both = compareWeeks(
    weekReview({}, stool, servings, TODAY, TARGETS),
    weekReview({}, stool, servings, previousWeekKey(TODAY), TARGETS)
  );
  assert.equal(both.stoolCount, 1, '2回 − 1回');
});

test('共有テキストは禁止語なし・小数点なし・出典つき', () => {
  const stool = putStool(putStool({}, TODAY, 1, 4), day(8), 3, 6);
  const logs = logsWith({ [TODAY]: ACHIEVED, [day(2)]: ['レタス'], [day(8)]: ACHIEVED });
  const now = weekReview(logs, stool, servings, TODAY, TARGETS);
  const prev = weekReview(logs, stool, servings, previousWeekKey(TODAY), TARGETS);
  const text = reviewText(now, prev, TARGETS);

  assert.deepEqual(bannedWordsIn(text), [], text);
  assert.doesNotMatch(text, /\d+\.\d/, '小数点を出さない');
  assert.ok(text.includes(ATTRIBUTION), '数字が端末の外に出るので出典を必ず付ける');
  assert.match(text, /記録 2日/);
  assert.match(text, /目標25gに届いた日 1日/);
  assert.match(text, /お通じ 記録1日・のべ1回・多かった形 普通便/);
  // 因果を書かない
  assert.doesNotMatch(text, /ため|おかげ|効/);
});

test('記録が1件も無い週でも文が壊れない', () => {
  const empty = weekReview({}, {}, servings, TODAY, TARGETS);
  const text = reviewText(empty, empty, TARGETS);
  assert.match(text, /記録 0日/);
  assert.match(text, /お通じ 記録なし/);
  assert.deepEqual(bannedWordsIn(text), []);
});
