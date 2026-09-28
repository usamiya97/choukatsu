/**
 * お通じの記録のテスト。
 *
 * ここで縛っているのは3つ。
 *  1. **0回（出なかった）と未記録を混ぜない**（混ぜると振り返りの数字が嘘になる）
 *  2. 平均を出さない・小数点を出さない
 *  3. 禁止語を1つも通さない（通知文は誰もレビューしないまま端末に出るので特に）
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bannedWordsIn } from './safety.ts';
import {
  DEFAULT_REMINDER_AT,
  REMINDER_OPTIONS,
  REMINDER_TEXT,
  STOOL_COUNT_MAX,
  STOOL_FORMS,
  clampStoolCount,
  parseHm,
  putStool,
  reminderDue,
  reminderLabel,
  removeStool,
  stoolFormName,
  stoolRecordWord,
  stoolRow,
  stoolWeek,
  stoolWeekWord,
} from './stool.ts';
import type { StoolForm, StoolLog } from './types.ts';

const at = (h: number, m = 0) => new Date(2026, 8, 28, h, m);
/** テスト用。日付キーは lib/state.ts と同じ YYYY-MM-DD */
const day = (d: number) => `2026-09-${String(d).padStart(2, '0')}`;
const rec = (count: number, form: StoolForm | null) => ({ count, form, at: '2026-09-28T21:00:00.000Z' });

test('便の形は7段階で、硬い側から水っぽい側の順に並んでいる', () => {
  assert.equal(STOOL_FORMS.length, 7);
  assert.deepEqual(
    STOOL_FORMS.map((f) => f.form),
    [1, 2, 3, 4, 5, 6, 7]
  );
  assert.equal(stoolFormName(1), 'コロコロ便');
  assert.equal(stoolFormName(4), '普通便');
  assert.equal(stoolFormName(7), '水様便');
});

test('形の名前と説明に禁止語が無い（症状名も効能も書かない）', () => {
  for (const f of STOOL_FORMS) {
    assert.deepEqual(bannedWordsIn(f.name), [], f.name);
    assert.deepEqual(bannedWordsIn(f.note), [], `${f.name}: ${f.note}`);
  }
});

test('通知の文に禁止語が無い', () => {
  assert.deepEqual(bannedWordsIn(REMINDER_TEXT.title), []);
  assert.deepEqual(bannedWordsIn(REMINDER_TEXT.body), []);
});

test('ホームの行の文（3状態すべて）に禁止語が無い', () => {
  const rows = [
    stoolRow(rec(2, 4), '21:00', at(22)),
    stoolRow(null, '21:00', at(22)),
    stoolRow(null, '21:00', at(9)),
    stoolRow(null, null, at(9)),
  ];
  for (const r of rows) {
    assert.deepEqual(bannedWordsIn(r.title), [], r.title);
    assert.deepEqual(bannedWordsIn(r.sub ?? ''), [], r.sub ?? '');
  }
});

test('回数は0〜9に収める。0は「出なかった」として残す', () => {
  assert.equal(clampStoolCount(-3), 0);
  assert.equal(clampStoolCount(0), 0);
  assert.equal(clampStoolCount(99), STOOL_COUNT_MAX);
  assert.equal(clampStoolCount(1.4), 1, '小数は丸める（回数に小数点は出さない）');
  assert.equal(clampStoolCount(Number.NaN), 1, '壊れた値でも落とさない');
});

test('1日1件。同じ日に記録し直すと上書きになる（足し算しない）', () => {
  let log: StoolLog = {};
  log = putStool(log, day(28), 1, 4, '2026-09-28T09:00:00.000Z');
  log = putStool(log, day(28), 3, 5, '2026-09-28T21:00:00.000Z');
  assert.equal(Object.keys(log).length, 1);
  assert.equal(log[day(28)].count, 3);
  assert.equal(log[day(28)].form, 5);
});

test('0回で記録すると形は消える（出なかった日に形は無い）', () => {
  const log = putStool({}, day(28), 0, 4);
  assert.equal(log[day(28)].count, 0);
  assert.equal(log[day(28)].form, null);
});

test('消すとキーごと消える（0回として残さない）', () => {
  const log = removeStool(putStool({}, day(28), 2, 4), day(28));
  assert.deepEqual(log, {});
});

test('7日の振り返りは記録がある日だけを数える（未記録日を0回として数えない）', () => {
  const log: StoolLog = {
    [day(28)]: rec(1, 4),
    [day(26)]: rec(2, 4),
    // 27日は未記録
    [day(25)]: rec(0, null),
  };
  const w = stoolWeek(log, day(28));
  assert.equal(w.days, 3, '記録した日数');
  assert.equal(w.count, 3, 'のべ回数');
  assert.equal(w.noneDays, 1, '出なかったと記録した日');
  assert.equal(w.formDays, 2);
});

test('8日前の記録は7日の振り返りに入らない', () => {
  const log: StoolLog = { [day(28)]: rec(1, 4), [day(21)]: rec(5, 1) };
  const w = stoolWeek(log, day(28));
  assert.equal(w.days, 1);
  assert.equal(w.count, 1);
});

test('多かった形は最多のもの。同数なら直近に記録した形を出す', () => {
  const most = stoolWeek({ [day(28)]: rec(1, 1), [day(27)]: rec(1, 4), [day(26)]: rec(1, 4) }, day(28));
  assert.equal(most.form, 4, '2日ある普通便が勝つ');

  const tie = stoolWeek({ [day(28)]: rec(1, 6), [day(27)]: rec(1, 2) }, day(28));
  assert.equal(tie.form, 6, '同数なら直近（28日）の形');
});

test('振り返りの文は記録が無ければ出さない。出るときも平均を言わない', () => {
  assert.equal(stoolWeekWord(stoolWeek({}, day(28))), null);
  const word = stoolWeekWord(stoolWeek({ [day(28)]: rec(2, 4), [day(26)]: rec(0, null) }, day(28)))!;
  assert.match(word, /2日 記録して、のべ 2回/);
  assert.match(word, /出なかった日 1日/);
  assert.match(word, /普通便/);
  assert.doesNotMatch(word, /平均|1日あたり/);
  assert.doesNotMatch(word, /\d+\.\d/, '小数点を出さない');
});

test('記録の1行は「2回・普通便」。出なかった日は回数を出さない', () => {
  assert.equal(stoolRecordWord(rec(2, 4)), '2回・普通便');
  assert.equal(stoolRecordWord(rec(1, null)), '1回');
  assert.equal(stoolRecordWord(rec(0, null)), '出ませんでした');
});

test('時刻は HH:MM だけ受ける。壊れた値では催促しない', () => {
  assert.deepEqual(parseHm('21:00'), { hour: 21, minute: 0 });
  assert.deepEqual(parseHm('7:30'), { hour: 7, minute: 30 });
  for (const broken of [null, undefined, '', 'よる', '25:00', '21:61', '2100']) {
    assert.equal(parseHm(broken as string | null), null, String(broken));
    assert.equal(reminderDue(broken as string | null, at(23)), false, String(broken));
  }
});

test('催促は設定時刻ちょうどから始まる', () => {
  assert.equal(reminderDue('21:00', at(20, 59)), false);
  assert.equal(reminderDue('21:00', at(21, 0)), true);
  assert.equal(reminderDue('21:00', at(23, 30)), true);
});

test('時刻の候補は既定値を含み、名前つきで読める', () => {
  assert.ok(REMINDER_OPTIONS.some((o) => o.at === DEFAULT_REMINDER_AT));
  assert.equal(reminderLabel('21:00'), '夜（21:00）');
  assert.equal(reminderLabel('06:15'), '6:15', '候補に無い時刻でも時刻だけは出す');
  assert.equal(reminderLabel(null), null);
});

test('ホームの行は3状態。記録済みなら催促の見た目にしない', () => {
  assert.equal(stoolRow(rec(1, 4), '21:00', at(22)).due, false, '記録済みなら時刻を過ぎても催促しない');
  assert.match(stoolRow(rec(1, 4), '21:00', at(22)).title, /1回・普通便/);
  assert.equal(stoolRow(null, '21:00', at(22)).due, true, '時刻を過ぎて未記録なら催促');
  assert.equal(stoolRow(null, '21:00', at(9)).due, false, '時刻前は催促しない');
  assert.equal(stoolRow(null, null, at(23)).due, false, '時刻を決めていない人は催促しない');
  assert.match(stoolRow(null, '21:00', at(9)).sub!, /夜（21:00）/, '時刻前は、いつ聞くかを出す');
});
