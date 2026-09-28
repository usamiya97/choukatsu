/**
 * コーチ提案のテスト。守りたいのは3つ。
 *  1. 禁止リストと「苦手」が確実に効く（効かないと信頼が飛ぶ）
 *  2. 同じ日に何度開いても提案が変わらない
 *  3. 未達の日に「達成」の文言を出さない（逆も）
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dailyIndex, pickCoach, resolveTrigger, shortfallTrigger } from './coach.ts';
import { bannedWordsIn } from './safety.ts';
import { shiftDays } from './state.ts';
import type { Caution, CoachItem, Logs, Serving, Swap, Targets } from './types.ts';

const load = <T,>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../data/generated/${name}.json`, import.meta.url), 'utf8'));

const servings = load<Serving[]>('servings');
const catalog = load<CoachItem[]>('coach');
const swaps = load<Swap[]>('swaps');
const cautions = load<Caution[]>('cautions');
const targets: Targets = { total: 18, soluble: 6, insoluble: 12 };

const TODAY = '2026-09-25';
const day = (n: number) => shiftDays(TODAY, -n);

function logsWith(entries: Record<string, string[]>): Logs {
  const logs: Logs = {};
  for (const [date, labels] of Object.entries(entries)) {
    logs[date] = labels.map((label, i) => ({ label, count: 1, at: `${date}T0${i}:00:00.000Z` }));
  }
  return logs;
}

const ctx = (logs: Logs, extra: Partial<Parameters<typeof pickCoach>[0]> = {}) => ({
  logs,
  todayKey: TODAY,
  servings,
  catalog,
  swaps,
  cautions,
  targets,
  ...extra,
});

/**
 * 3日以上の記録があり、今日は未達という平常状態。
 * 2日前に達成日を挟んでいるのは「連続未達3日」に入らないようにするため
 * （そのトリガーはカタログに1件しかなく、候補の選び方を検証できない）。
 */
const ACHIEVED = ['もち麦ごはん', 'もち麦ごはん', 'もち麦ごはん', 'もち麦ごはん']; // 25.2g
const baseline = (todayLabels: string[] = ['レタス']) =>
  logsWith({
    [day(1)]: ['納豆'],
    [day(2)]: ACHIEVED,
    [day(3)]: ['納豆'],
    [TODAY]: todayLabels,
  });

test('記録が3日未満ならオンボーディングのトリガー', () => {
  assert.equal(resolveTrigger(ctx(logsWith({ [TODAY]: ['納豆'] }))), '記録3日未満');
  const picked = pickCoach(ctx(logsWith({ [TODAY]: ['納豆'] })));
  assert.equal(picked?.item.id, 'C035');
  assert.equal(picked?.evidence, '一般に言われる');
});

test('3日以上空けて戻ってきたら、まず復帰の文言（不足の指摘から入らない）', () => {
  const logs = logsWith({ [day(5)]: ['納豆'], [day(6)]: ['納豆'], [day(7)]: ['納豆'] });
  assert.equal(resolveTrigger(ctx(logs)), '記録が途切れた後');
  assert.equal(pickCoach(ctx(logs))?.item.id, 'C037');
});

test('達成した日は達成側のトリガーだけを出す', () => {
  // もち麦4杯 = 25.2g（水溶12.6g / 不溶12.6g）→ 両方達成
  const logs = baseline(ACHIEVED);
  const trigger = resolveTrigger(ctx(logs));
  assert.ok(trigger.startsWith('達成'), trigger);
  const picked = pickCoach(ctx(logs));
  assert.equal(picked?.evidence, 'あなたのデータ', '達成の評価はユーザーのデータが根拠');
});

test('総量が半分未満なら軸の話をせず総量を押す', () => {
  assert.equal(shortfallTrigger({ total: 5, soluble: 0.5, insoluble: 4.5 }, targets), '総量不足');
});

test('総量が出てきたら、達成率がいちばん低い軸に切り替える', () => {
  // 総量14g・水溶1g（16%）→ 菌のごはん側
  assert.equal(shortfallTrigger({ total: 14, soluble: 1, insoluble: 13 }, targets), '水溶性不足');
  // 総量14g・水溶6g達成 / 不溶8g（66%）→ おそうじ側
  assert.equal(shortfallTrigger({ total: 14, soluble: 6, insoluble: 8 }, targets), '不溶性不足');
});

test('記録があるのに3日続けて未達なら、置き換えの一手に切り替える', () => {
  const logs = logsWith({
    [day(1)]: ['レタス'],
    [day(2)]: ['レタス'],
    [day(3)]: ['レタス'],
    [TODAY]: ['レタス'],
  });
  assert.equal(resolveTrigger(ctx(logs)), '連続未達3日');
  assert.equal(pickCoach(ctx(logs))?.item.id, 'C036');
});

test('苦手と答えた食品は提案に出てこない', () => {
  const logs = baseline();
  const all = catalog.filter((c) => c.trigger === '水溶性不足');
  const exclude = all.map((c) => c.targetFood).filter((x): x is string => Boolean(x));
  const picked = pickCoach(ctx(logs, { excludedFoods: servings.map((s) => s.label) }));
  // 全食品を除外したら、食品を指さない提案しか残らない
  assert.ok(!picked || !picked.item.targetFood, JSON.stringify(picked?.item));
  assert.ok(exclude.length > 0);
});

test('菌のごはん狙いのとき、cautionsで水溶性を禁止された食品は出さない', () => {
  const bannedSoluble = new Set(cautions.filter((c) => c.axis === '水溶性').map((c) => c.label));
  const logs = baseline(['もち麦ごはん', 'いんげん豆(ゆで)', 'ゆで大豆']);
  for (let i = 0; i < 14; i++) {
    const picked = pickCoach(ctx(logs, { todayKey: shiftDays(TODAY, -i) } as never));
    if (picked?.item.targetFood) assert.ok(!bannedSoluble.has(picked.item.targetFood));
  }
});

test('同じ日なら何度呼んでも同じ提案（1日1つを守る）', () => {
  const logs = baseline();
  const a = pickCoach(ctx(logs));
  const b = pickCoach(ctx(logs));
  assert.equal(a?.item.id, b?.item.id);
  assert.equal(dailyIndex(TODAY, 8), dailyIndex(TODAY, 8));
});

test('直近に出した提案は避ける（1日おきに同じ文が出ないこと）', () => {
  const logs = baseline();
  const first = pickCoach(ctx(logs));
  assert.ok(first);
  const history = [{ id: first.item.id, date: day(1) }];
  const second = pickCoach(ctx(logs, { recentShown: history }));
  assert.notEqual(second?.item.id, first.item.id);
  // 3日前に出したものもまだ避ける
  const third = pickCoach(ctx(logs, { recentShown: [{ id: first.item.id, date: day(3) }] }));
  assert.notEqual(third?.item.id, first.item.id);
});

test('同じ日に何度呼んでも、すでに今日出した提案はそのまま返る', () => {
  const logs = baseline();
  const first = pickCoach(ctx(logs));
  assert.ok(first);
  const again = pickCoach(ctx(logs, { recentShown: [{ id: first.item.id, date: TODAY }] }));
  assert.equal(again?.item.id, first.item.id);
});

test('カタログが1件しかないトリガーに居続けても、同じ文を繰り返さない', () => {
  // 毎日記録しているが目標に届かない人（目標を上げるとこの状態が普通になる）
  const logs = logsWith({
    [day(1)]: ['レタス'],
    [day(2)]: ['レタス'],
    [day(3)]: ['レタス'],
    [TODAY]: ['レタス'],
  });
  assert.equal(resolveTrigger(ctx(logs)), '連続未達3日');
  const only = pickCoach(ctx(logs));
  assert.equal(only?.item.id, 'C036');
  // 昨日それを出していたら、不足の軸のプールに逃げる
  const next = pickCoach(ctx(logs, { recentShown: [{ id: 'C036', date: day(1) }] }));
  assert.notEqual(next?.item.id, 'C036');
  assert.ok(next, '代わりの提案が無い');
});

test('今日すでに食べたものは勧めない', () => {
  const logs = baseline(['らっきょう']);
  const picked = pickCoach(ctx(logs));
  assert.notEqual(picked?.item.targetFood, 'らっきょう');
});

test('置き換え提案は、置き換え元を記録したことがある人に優先して出る', () => {
  const logs = logsWith({
    [day(1)]: ['うどん(ゆで)'],
    [day(2)]: ACHIEVED,
    [day(3)]: ['うどん(ゆで)'],
    [TODAY]: ['うどん(ゆで)'],
  });
  const picked = pickCoach(ctx(logs));
  assert.equal(picked?.swap?.before, 'うどん(ゆで)', JSON.stringify(picked?.item));
  assert.equal(picked?.item.id, 'C002');
});

test('提案文に内部名が漏れていない（(ゆで)などをユーザーに見せない）', () => {
  for (const c of catalog) {
    assert.ok(!/[（(](ゆで|生|乾|素干し|冷凍|白米に混ぜる)[)）]/.test(c.message), c.message);
  }
});

test('禁止語（治る・改善・便秘・セロトニン等）をカタログが含まない', () => {
  // リストは lib/safety.ts と共有する。LLMが書いた文も同じ定義で実行時に弾く
  for (const c of catalog) {
    assert.deepEqual(bannedWordsIn(c.message), [], `${c.id} message`);
    assert.deepEqual(bannedWordsIn(c.reason), [], `${c.id} reason`);
  }
});
