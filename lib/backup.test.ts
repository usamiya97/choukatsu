/**
 * 書き出し・読み込みのテスト。
 *
 * ここで守るのは4つ。
 *  1. **APIキーや未知のフィールドが混ざらない**（バックアップは人に渡るファイル）
 *  2. 書き出して読み戻すと同じになる
 *  3. 取り込みで**記録が減らない**（いま入っている日を上書きしない）
 *  4. 壊れたファイルでも落ちない（読める部分だけ取り込む／はっきり拒む）
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BACKUP_PROFILE_KEYS,
  BACKUP_VERSION,
  backupFileName,
  backupText,
  buildBackup,
  mergeBackup,
  parseBackup,
  summarize,
  type BackupInput,
} from './backup.ts';
import { EMPTY_PROFILE, type Profile } from './storage.ts';
import { putStool } from './stool.ts';
import type { Logs } from './types.ts';

const entry = (label: string, at: string) => ({ label, count: 1, at });
const logs: Logs = {
  '2026-09-29': [entry('もち麦ごはん', '2026-09-29T09:00:00.000Z')],
  '2026-09-28': [entry('納豆', '2026-09-28T12:00:00.000Z'), entry('ごぼう(ゆで)', '2026-09-28T19:00:00.000Z')],
};
const stool = putStool({}, '2026-09-29', 1, 4, '2026-09-29T21:00:00.000Z');
const profile: Profile = {
  ...EMPTY_PROFILE,
  diagnosed: true,
  estTotal: 12,
  typeName: 'サラダ安心タイプ',
  excludedFoods: ['納豆'],
  targetTotal: 18,
  stoolReminderAt: '21:00',
  stoolNotify: true,
};
const input: BackupInput = { profile, logs, stool, learned: { ぽてさら: 'ポテトサラダ' } };
const NOW = new Date('2026-09-30T10:00:00.000Z');

test('書き出したファイルは app と version と日付を持つ', () => {
  const b = buildBackup(input, NOW);
  assert.equal(b.app, 'chokatsu');
  assert.equal(b.version, BACKUP_VERSION);
  assert.equal(b.exportedAt, NOW.toISOString());
  assert.equal(backupFileName(b), 'chokatsu-2026-09-30.json');
});

test('APIキーは書き出さない。未知のフィールドも持ち出さない', () => {
  // 設定に秘密が混ざっていても、知っているフィールドだけを通す
  const dirty = { ...profile, apiKey: 'sk-ant-secret', anthropicKey: 'sk-ant-secret2' } as Profile;
  const text = backupText(buildBackup({ ...input, profile: dirty }, NOW));
  assert.doesNotMatch(text, /sk-ant/, 'キーがファイルに出ている');
  assert.doesNotMatch(text, /apiKey|api_key|anthropic/i);
  // 入れ物そのものも、この6つだけ
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), [
    'app',
    'exportedAt',
    'learned',
    'logs',
    'profile',
    'stool',
    'version',
  ].sort());
});

test('段階(stage)は書き出さない（記録から決まり直すので二重に持たない）', () => {
  const text = backupText(buildBackup(input, NOW));
  assert.doesNotMatch(text, /"stage"/);
});

test('Profile に項目が増えたら backup.ts も直す（増やし忘れの検出）', () => {
  assert.deepEqual([...BACKUP_PROFILE_KEYS].sort(), Object.keys(EMPTY_PROFILE).sort());
});

test('書き出して読み戻すと同じ中身になる', () => {
  const b = buildBackup(input, NOW);
  const parsed = parseBackup(backupText(b));
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.backup.logs, logs);
  assert.deepEqual(parsed.backup.stool, stool);
  assert.deepEqual(parsed.backup.profile, profile);
  assert.deepEqual(parsed.backup.learned, { ぽてさら: 'ポテトサラダ' });
});

test('取り込む前に中身の要約が出せる（期間・日数・件数）', () => {
  const s = summarize(buildBackup(input, NOW));
  assert.equal(s.from, '2026-09-28');
  assert.equal(s.to, '2026-09-29');
  assert.equal(s.logDays, 2);
  assert.equal(s.entries, 3);
  assert.equal(s.stoolDays, 1);
  assert.equal(s.hasProfile, true);
});

test('記録が空のファイルでも要約が壊れない', () => {
  const s = summarize(buildBackup({ profile: EMPTY_PROFILE, logs: {}, stool: {}, learned: {} }, NOW));
  assert.equal(s.from, null);
  assert.equal(s.logDays, 0);
  assert.equal(s.hasProfile, false);
});

test('別アプリのファイルと、新しい版のファイルは拒む', () => {
  assert.equal(parseBackup('{"app":"other","version":1}').ok, false);
  assert.equal(parseBackup('[]').ok, false);
  assert.equal(parseBackup('こわれています').ok, false);
  const future = parseBackup(JSON.stringify({ app: 'chokatsu', version: BACKUP_VERSION + 1 }));
  assert.equal(future.ok, false);
  if (!future.ok) assert.match(future.reason, /アプリを更新/);
});

test('壊れた行は落として、読める部分だけ取り込む（ファイル全体を拒まない）', () => {
  const parsed = parseBackup(
    JSON.stringify({
      app: 'chokatsu',
      version: 1,
      logs: {
        '2026-09-29': [{ label: 'もち麦ごはん', count: 1, at: 'x' }, { count: 2 }, { label: '納豆', count: 0 }],
        'きのう': [{ label: '納豆', count: 1 }],
        '2026-09-27': 'ごはん',
      },
      stool: { '2026-09-29': { count: 2, form: 99 }, '2026-09-28': { count: 0, form: 4 } },
      learned: { ぽてさら: 'ポテトサラダ', こわれ: 3 },
    })
  );
  assert.ok(parsed.ok);
  assert.deepEqual(Object.keys(parsed.backup.logs), ['2026-09-29'], '日付でないキーと配列でない値は捨てる');
  assert.equal(parsed.backup.logs['2026-09-29'].length, 1, 'label や count が無い行は捨てる');
  assert.equal(parsed.backup.stool['2026-09-29'].form, null, '範囲外の形は持たない');
  assert.equal(parsed.backup.stool['2026-09-28'].form, null, '0回の日に形を残さない');
  assert.deepEqual(parsed.backup.learned, { ぽてさら: 'ポテトサラダ' });
});

test('取り込みは足すだけ。いま記録がある日は上書きしない', () => {
  const b = buildBackup(input, NOW);
  const current: BackupInput = {
    profile: EMPTY_PROFILE,
    // 同じ 9/29 に、この端末では別のものを記録している
    logs: { '2026-09-29': [entry('レタス', '2026-09-29T08:00:00.000Z')] },
    stool: {},
    learned: {},
  };
  const m = mergeBackup(current, b);
  assert.equal(m.logs['2026-09-29'][0].label, 'レタス', 'この端末の記録が残る');
  assert.equal(m.addedLogDays, 1, '9/28 だけ足された');
  assert.equal(m.keptLogDays, 1, '9/29 はそのまま');
  assert.equal(m.addedStoolDays, 1);
  // 記録が減らないこと（足すだけ）
  assert.ok(Object.keys(m.logs).length >= Object.keys(current.logs).length);
});

test('設定は空いているところだけ埋める。通知のオンオフは引き継がない', () => {
  const current: BackupInput = {
    profile: { ...EMPTY_PROFILE, diagnosed: true, targetTotal: 30 },
    logs: {},
    stool: {},
    learned: {},
  };
  const m = mergeBackup(current, buildBackup(input, NOW));
  assert.equal(m.profile.targetTotal, 30, 'この端末で選んだ目標は変えない');
  assert.equal(m.profile.stoolReminderAt, '21:00', '空いていた時刻は埋める');
  assert.deepEqual(m.profile.excludedFoods, ['納豆'], '空いていた苦手は埋める');
  assert.equal(m.profile.stoolNotify, false, '通知は端末の許可次第なので引き継がない');
  assert.equal(m.profile.typeName, 'サラダ安心タイプ');
});

test('学習した語は足すだけ（同じ語はこの端末のものを残す）', () => {
  const current: BackupInput = {
    profile: EMPTY_PROFILE,
    logs: {},
    stool: {},
    learned: { ぽてさら: 'ゆで大豆', べつのご: 'レタス' },
  };
  const m = mergeBackup(current, buildBackup(input, NOW));
  assert.equal(m.learned['ぽてさら'], 'ゆで大豆');
  assert.equal(m.learned['べつのご'], 'レタス');
});
