/**
 * コーチのLLM化のテスト。**LLMが書いた文は誰も見ていない**ので、
 * 実行時の検査がここで縛られていないと、そのまま画面に出る。
 *  1. 禁止語（治る・便秘・セロトニン等）を弾く
 *  2. 数字を含む文を弾く（データ由来でない数値を出させない）
 *  3. 候補に無いidを作ってきたら、カタログの選び方に戻す
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  COACH_MODEL,
  COACH_SCHEMA,
  LEAD_MAX_CHARS,
  buildCoachInput,
  llmCoach,
  resolveCoachLlm,
  validLead,
  type CoachLlmContext,
} from './coachllm.ts';
import { BANNED_WORDS } from './safety.ts';
import type { CoachItem } from './types.ts';

const catalog: CoachItem[] = JSON.parse(
  readFileSync(new URL('../data/generated/coach.json', import.meta.url), 'utf8')
);
const candidates = catalog.slice(0, 5);

const ctx: CoachLlmContext = {
  candidates,
  today: { total: 12, soluble: 3, insoluble: 9 },
  targets: { total: 25, soluble: 8, insoluble: 17 },
  weekLogDays: 4,
  frequent: ['納豆', 'もち麦ごはん'],
  gapDays: 0,
};

test('禁止語を含むひとことは使わない', () => {
  for (const w of BANNED_WORDS) {
    assert.equal(validLead(`今日は${w}そうですね`), null, w);
  }
});

/**
 * 数字を許すと「約1.4g増えます」のような文をLLMが書けてしまう。
 * それが正しいかは読む側に判定できないので、生成文には一切書かせない。
 */
test('数字を含むひとことは使わない（漢数字も）', () => {
  assert.equal(validLead('あと3gで目標です'), null);
  assert.equal(validLead('あと３gで目標です'), null);
  assert.equal(validLead('三日続いていますね'), null);
  // 数字が無ければ通る
  assert.equal(validLead('このところ続いていますね'), 'このところ続いていますね');
});

test('長すぎる・空のひとことは使わない', () => {
  assert.equal(validLead(''), null);
  assert.equal(validLead('   '), null);
  assert.equal(validLead('あ'.repeat(LEAD_MAX_CHARS + 1)), null);
  assert.equal(validLead('あ'.repeat(LEAD_MAX_CHARS))?.length, LEAD_MAX_CHARS);
  assert.equal(validLead(null), null);
  assert.equal(validLead(42), null);
});

test('候補に無いidは採らない（カタログの選び方に戻す）', () => {
  assert.equal(resolveCoachLlm({ pick: '存在しないid', lead: 'よい調子です' }, candidates), null);
  assert.equal(resolveCoachLlm({ pick: 123, lead: 'x' }, candidates), null);
  for (const bad of [null, undefined, 'text', {}, []]) {
    assert.equal(resolveCoachLlm(bad, candidates), null);
  }
});

test('ひとことが検査に落ちても、提案そのものは出す', () => {
  const r = resolveCoachLlm({ pick: candidates[0].id, lead: 'あと3gです' }, candidates);
  assert.equal(r?.item.id, candidates[0].id);
  assert.equal(r?.lead, null, '落ちたひとことが残っている');
});

test('通れば提案とひとことの両方が返る', () => {
  const r = resolveCoachLlm({ pick: candidates[1].id, lead: 'このところ続いていますね' }, candidates);
  assert.equal(r?.item.id, candidates[1].id);
  assert.equal(r?.lead, 'このところ続いていますね');
});

test('LLMが落ちても例外を投げない', async () => {
  const r = await llmCoach(ctx, async () => {
    throw new Error('network');
  });
  assert.equal(r, null);
});

test('候補が空なら呼ばない', async () => {
  let called = 0;
  const r = await llmCoach({ ...ctx, candidates: [] }, async () => {
    called += 1;
    return {};
  });
  assert.equal(called, 0);
  assert.equal(r, null);
});

test('出力スキーマは pick と lead だけ（数値を返す場所を作らない）', () => {
  assert.deepEqual(Object.keys(COACH_SCHEMA.properties), ['pick', 'lead']);
  assert.equal(COACH_SCHEMA.additionalProperties, false);
  for (const v of Object.values(COACH_SCHEMA.properties)) {
    assert.equal(v.type, 'string', '数値型のフィールドがある');
  }
});

test('固定部分に規則、可変部分に今日の状況と候補を置く', () => {
  const input = buildCoachInput(ctx);
  assert.equal(input.model, COACH_MODEL);
  assert.deepEqual(input.system[0].cache_control, { type: 'ephemeral' });
  const user = input.messages[0].content;
  // 候補は日によって変わるので system に混ぜない（混ぜると固定部分が毎回変わる）
  for (const c of candidates) {
    assert.ok(user.includes(c.id), `${c.id} が候補に無い`);
    assert.ok(!input.system[0].text.includes(c.id), `${c.id} が固定部分に混ざっている`);
  }
  assert.ok(input.system[0].text.includes('数字を書かない'));
});

test('プロンプトが禁止語を名指しで列挙している', () => {
  const text = buildCoachInput(ctx).system[0].text;
  for (const w of ['治る', '便秘', 'セロトニン', 'デトックス']) {
    assert.ok(text.includes(w), `${w} が指示に無い`);
  }
});
