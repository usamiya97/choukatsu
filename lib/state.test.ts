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
  stageThresholds,
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

test('ヒステリシス: 上がる閾値と下がる閾値が1.5gずれている（目標18gの場合）', () => {
  // 上がる: 4/9/18/25（段階4=目標量18g・段階5=理想値25g）
  assert.equal(resolveStage(3.9, 1), 1);
  assert.equal(resolveStage(4.0, 1), 2);
  assert.equal(resolveStage(8.9, 1), 2);
  assert.equal(resolveStage(9.0, 1), 3);
  assert.equal(resolveStage(17.9, 1), 3, '目標18gに1歩届かない間は段階3');
  assert.equal(resolveStage(18.0, 1), 4, '目標量に到達したら段階4');
  assert.equal(resolveStage(24.9, 1), 4);
  assert.equal(resolveStage(25.0, 1), 5, '理想値に到達したら段階5');
  // 下がる: 2.5/7.5/16.5/23.5。閾値を割るまで維持する
  assert.equal(resolveStage(24.0, 5), 5);
  assert.equal(resolveStage(23.4, 5), 4);
  assert.equal(resolveStage(17.0, 4), 4);
  assert.equal(resolveStage(16.4, 4), 3);
  assert.equal(resolveStage(8.0, 3), 3);
  assert.equal(resolveStage(7.4, 3), 2);
  assert.equal(resolveStage(3.0, 2), 2);
  assert.equal(resolveStage(2.4, 2), 1);
});

test('閾値は目標値に連動する。目標18gで 4/9/18/25（摂取基準の2段構えと一致）', () => {
  const { up, down } = stageThresholds(18);
  assert.deepEqual([up[2], up[3], up[4], up[5]], [4, 9, 18, 25]);
  assert.deepEqual([down[2], down[3], down[4], down[5]], [2.5, 7.5, 16.5, 23.5]);
});

test('目標を変えると閾値も動く（目標＝段階4・その先に段階5が残る）', () => {
  for (const target of [18, 21, 25, 30]) {
    const { up, down } = stageThresholds(target);
    assert.equal(up[4], target, `目標${target}g のとき段階4が目標と一致しない`);
    assert.ok(up[5] > target, `目標${target}g のとき段階5に伸びしろが無い`);
    // ヒステリシスは全段階1.5g
    for (const stage of [2, 3, 4, 5] as const) {
      assert.equal(Number((up[stage] - down[stage]).toFixed(2)), 1.5, `目標${target}g 段階${stage}`);
    }
    // 単調増加（段階飛びの防止）
    for (const stage of [3, 4, 5] as const) {
      assert.ok(up[stage] > up[(stage - 1) as 2 | 3 | 4], `目標${target}g 段階${stage}が単調でない`);
    }
    // 0.5g刻み（読めない閾値を作らない）
    for (const stage of [2, 3, 4, 5] as const) {
      assert.equal((up[stage] * 2) % 1, 0, `目標${target}g 段階${stage}が0.5g刻みでない`);
    }
  }
});

test('段階5は32gで打ち止め（それ以上はプリセットで続けられない）', () => {
  // 目標30gに「目標+7g」を当てると37g平均が必要になり、最上段が飾りになる
  assert.equal(stageThresholds(30).up[5], 32);
  assert.equal(stageThresholds(25).up[5], 32);
  assert.equal(stageThresholds(18).up[5], 25, '目標18gでは上限に当たらない');
  // 上限に当たっても段階4より上であることは守る
  for (const target of [18, 21, 25, 30]) {
    const { up } = stageThresholds(target);
    assert.ok(up[5] > up[4], `目標${target}g で段階5が段階4以下`);
  }
});

test('目標25gなら 5.5/12.5/25/32（既定の設定）', () => {
  const { up } = stageThresholds(25);
  assert.deepEqual([up[2], up[3], up[4], up[5]], [5.5, 12.5, 25, 32]);
  // 目標25gの人が18g平均でも段階3（目標に届いていないので上がらない）
  assert.equal(resolveStage(18, 3, 25), 3);
  assert.equal(resolveStage(25, 3, 25), 4);
  assert.equal(resolveStage(32, 4, 25), 5);
});

test('目標到達で段階4に上がり、理想値まで段階5の伸びしろが残る', () => {
  // 目標量18gに届いた時点で見た目が変わる。ただし最上段はまだ先
  assert.equal(resolveStage(18.0, 3), 4);
  assert.equal(resolveStage(21.0, 4), 4);
  assert.equal(resolveStage(25.0, 4), 5);
});

test('境界を往復してもちらつかない（18.0 ⇄ 17.0 を10往復）', () => {
  let stage: Stage = 3;
  stage = resolveStage(18.0, stage);
  assert.equal(stage, 4);
  for (let i = 0; i < 10; i++) {
    stage = resolveStage(17.0, stage);
    assert.equal(stage, 4, '17.0gでは降格しない（下がる閾値は16.5g）');
    stage = resolveStage(18.0, stage);
    assert.equal(stage, 4);
  }
});

test('大きく跳ねたら複数段いっぺんに上がる／下がる', () => {
  assert.equal(resolveStage(30.0, 1), 5);
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
  assert.equal(provisional.stage, 3, '推定13gなら段階3から始まる（目標18gにはまだ届いていない）');

  const threeDays = logsWith({ [day(1)]: ['レタス'], [day(2)]: ['レタス'], [day(3)]: ['レタス'] });
  const measured = computeGutState(threeDays, TODAY, servings, 3, 13.0);
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

test('段階5(25g)はプリセットだけで届く（理論上だけの最上段にしない）', () => {
  // 朝オートミール+豆乳 / 昼パスタ+ブロッコリー / 夜もち麦+納豆+ごぼう / 間食アーモンド+キウイ
  const realisticDay = [
    'オートミール',
    '豆乳',
    'パスタ(ゆで)',
    'ブロッコリー',
    'もち麦ごはん',
    '納豆',
    'ごぼう(ゆで)',
    'アーモンド',
    'キウイ',
  ];
  const logs = logsWith({ [TODAY]: realisticDay });
  const t = dayTotals(logs, TODAY, byLabel);
  assert.ok(t.total >= 25, `9タップで ${t.total.toFixed(1)}g（25g必要）`);

  // その食べ方を7日続けたら段階5に届く
  const week: Record<string, string[]> = {};
  for (let i = 1; i <= 7; i++) week[day(i)] = realisticDay;
  const state = computeGutState(logsWith(week), TODAY, servings, 4);
  assert.equal(state.stage, 5, `7日平均 ${state.stageScore.toFixed(1)}g`);
});

test('目標18gを7日続けた人は段階4（段階5に伸びしろが残る）', () => {
  // もち麦3杯=18.9g を7日続けた場合
  const week: Record<string, string[]> = {};
  for (let i = 1; i <= 7; i++) week[day(i)] = ['もち麦ごはん', 'もち麦ごはん', 'もち麦ごはん'];
  const state = computeGutState(logsWith(week), TODAY, servings, 4);
  assert.ok(state.stageScore >= 18, `7日平均 ${state.stageScore.toFixed(1)}g`);
  assert.equal(state.stage, 4);
});
