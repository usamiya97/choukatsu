/**
 * 状態モデルのテスト。`npm test`（tsx --test）で走る。
 * UIを立てずに、設計の不変条件（弱らせない/ちらつかせない）だけを検証する。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  computeGutState,
  dateKey,
  dayTotals,
  daysSinceLastLog,
  floraCount,
  floraDots,
  indexServings,
  lastNDays,
  recentMissStreak,
  resolveStage,
  shiftDays,
  stageScore,
  weekLogDays,
} from './state.ts';
import type { Logs, Serving, Stage } from './types.ts';

const servings: Serving[] = JSON.parse(readFileSync(new URL('../data/generated/servings.json', import.meta.url), 'utf8'));
const byLabel = indexServings(servings);
const mochi = servings.find((s) => s.label === 'もち麦ごはん')!;
const natto = servings.find((s) => s.label === '納豆')!;

const TODAY = '2026-09-25';
const day = (n: number) => shiftDays(TODAY, -n);

/** 日付 → 記録したプリセットのlabel配列、という形でテスト用の記録を組む */
function logsWith(entries: Record<string, string[]>): Logs {
  const logs: Logs = {};
  for (const [date, labels] of Object.entries(entries)) {
    logs[date] = labels.map((label, i) => ({ label, count: 1, at: `${date}T0${i}:00:00.000Z` }));
  }
  return logs;
}

test('日付キーはローカル日付。月末をまたいでも崩れない', () => {
  assert.equal(dateKey(new Date(2026, 8, 25, 23, 59)), '2026-09-25');
  assert.equal(shiftDays('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(lastNDays('2026-09-25', 3), ['2026-09-25', '2026-09-24', '2026-09-23']);
});

test('今日の総量は常用量×個数の合計', () => {
  const logs = logsWith({ [TODAY]: ['もち麦ごはん', '納豆'] });
  const t = dayTotals(logs, TODAY, byLabel);
  assert.ok(Math.abs(t.total - (mochi.total + natto.total)) < 1e-9);
  // 2軸の合計は必ず総量に一致する（比率方式の不変条件）
  assert.ok(Math.abs(t.soluble + t.insoluble - t.total) < 1e-9);
});

test('未記録日を0として平均に入れない（記録しなかったことを罰しない）', () => {
  // 4日前に1日だけ記録。間の3日は未記録
  const logs = logsWith({ [day(4)]: ['もち麦ごはん'] });
  const score = stageScore(logs, TODAY, byLabel);
  assert.equal(score.loggedDays, 1);
  assert.ok(Math.abs(score.score - mochi.total) < 1e-9, '未記録日で薄まらない');
});

test('今日の記録は7日平均に入れない（朝いちばんにキャラが弱って見えるのを防ぐ）', () => {
  const logs = logsWith({
    [day(1)]: ['もち麦ごはん', 'もち麦ごはん'], // 12.6g
    [TODAY]: ['レタス'], // 今日はまだ0.33g
  });
  const score = stageScore(logs, TODAY, byLabel);
  assert.equal(score.usedToday, false);
  assert.ok(score.score > 12, `今日の少量で平均が落ちない (${score.score})`);
});

test('記録初日だけは今日を使う（何も動かないと記録した意味が見えない）', () => {
  const logs = logsWith({ [TODAY]: ['もち麦ごはん'] });
  const score = stageScore(logs, TODAY, byLabel);
  assert.equal(score.usedToday, true);
  assert.ok(score.score > 0);
});

test('ヒステリシス: 上がる閾値と下がる閾値が1.5gずれている', () => {
  // 上がる: 4/8/12/16
  assert.equal(resolveStage(3.9, 1), 1);
  assert.equal(resolveStage(4.0, 1), 2);
  assert.equal(resolveStage(8.0, 1), 3);
  assert.equal(resolveStage(12.0, 1), 4);
  assert.equal(resolveStage(16.0, 1), 5);
  // 下がる: 2.5/6.5/10.5/14.5。閾値を割るまで維持する
  assert.equal(resolveStage(15.0, 5), 5);
  assert.equal(resolveStage(14.4, 5), 4);
  assert.equal(resolveStage(11.0, 4), 4);
  assert.equal(resolveStage(10.4, 4), 3);
  assert.equal(resolveStage(7.0, 3), 3);
  assert.equal(resolveStage(6.4, 3), 2);
  assert.equal(resolveStage(3.0, 2), 2);
  assert.equal(resolveStage(2.4, 2), 1);
});

test('境界を往復してもちらつかない（12.0 ⇄ 11.0 を10往復）', () => {
  let stage: Stage = 3;
  stage = resolveStage(12.0, stage);
  assert.equal(stage, 4);
  for (let i = 0; i < 10; i++) {
    stage = resolveStage(11.0, stage);
    assert.equal(stage, 4, '11.0gでは降格しない');
    stage = resolveStage(12.0, stage);
    assert.equal(stage, 4);
  }
});

test('大きく跳ねたら複数段いっぺんに上がる／下がる', () => {
  assert.equal(resolveStage(18.0, 1), 5);
  assert.equal(resolveStage(0.0, 5), 1);
});

test('図鑑は累積でユニーク。同じものを何度食べても増えない', () => {
  const logs = logsWith({
    [day(2)]: ['納豆', '納豆'],
    [day(1)]: ['納豆', 'もち麦ごはん'],
  });
  assert.equal(floraCount(logs), 2);
  assert.equal(floraDots(3), 0);
  assert.equal(floraDots(4), 1);
  assert.equal(floraDots(200), 30, '上限30で止まる');
});

test('週の記録日数は0..7。連続していなくてもよい', () => {
  const logs = logsWith({ [TODAY]: ['納豆'], [day(3)]: ['納豆'], [day(9)]: ['納豆'] });
  assert.equal(weekLogDays(logs, TODAY), 2, '9日前は7日窓の外');
});

test('最後の記録からの日数', () => {
  assert.equal(daysSinceLastLog({}, TODAY), null);
  assert.equal(daysSinceLastLog(logsWith({ [day(4)]: ['納豆'] }), TODAY), 4);
});

test('未達の連鎖は記録がある日だけを数える（未記録日で切れない）', () => {
  const logs = logsWith({
    [day(1)]: ['レタス'],
    [day(3)]: ['レタス'], // day(2) は未記録
    [day(4)]: ['レタス'],
  });
  assert.equal(recentMissStreak(logs, TODAY, byLabel, 18), 3);
});

test('達成した日が挟まると連鎖は切れる', () => {
  const many = Array.from({ length: 4 }, () => 'もち麦ごはん'); // 25.2g
  const logs = logsWith({ [day(1)]: ['レタス'], [day(2)]: many, [day(3)]: ['レタス'] });
  assert.equal(recentMissStreak(logs, TODAY, byLabel, 18), 1);
});

test('記録3日未満は診断の推定値で段階を動かし、3日で実測に切り替わる', () => {
  const twoDays = logsWith({ [day(1)]: ['レタス'], [day(2)]: ['レタス'] });
  const provisional = computeGutState(twoDays, TODAY, servings, 1, 13.0);
  assert.equal(provisional.provisional, true);
  assert.equal(provisional.useMeasured, false);
  assert.equal(provisional.stage, 4, '推定13gなら段階4から始まる');

  const threeDays = logsWith({ [day(1)]: ['レタス'], [day(2)]: ['レタス'], [day(3)]: ['レタス'] });
  const measured = computeGutState(threeDays, TODAY, servings, 4, 13.0);
  assert.equal(measured.provisional, false);
  assert.equal(measured.useMeasured, true);
  assert.ok(measured.stageScore < 1, '実測（レタスのみ）に切り替わる');
  assert.equal(measured.stage, 1);
});

test('6タップで3指標すべて達成できる（データ層の到達性の回帰テスト）', () => {
  // 企画メモの検算どおりの構成: 昼パスタ + 夜もち麦 + 納豆 + ごぼう + ブロッコリー + 干し柿
  const logs = logsWith({
    [TODAY]: ['パスタ(ゆで)', 'もち麦ごはん', '納豆', 'ごぼう(ゆで)', 'ブロッコリー', '干し柿'],
  });
  const t = dayTotals(logs, TODAY, byLabel);
  assert.ok(t.total >= 18, `総量 ${t.total.toFixed(2)}g`);
  assert.ok(t.soluble >= 6, `菌のごはん ${t.soluble.toFixed(2)}g`);
  assert.ok(t.insoluble >= 12, `おそうじ ${t.insoluble.toFixed(2)}g`);
});
