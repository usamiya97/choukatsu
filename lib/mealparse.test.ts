/**
 * 自由文パース層のテスト。**守りたいのは「LLMが数値を作れないこと」**。
 *
 *  1. 出力スキーマに g も繊維量も無い（作る場所がない）
 *  2. プリセットに無い label は記録に入らない
 *  3. 壊れた返りで例外を投げない（記録の流れを止めない）
 *  4. 辞書で足りる文ではLLMを1度も呼ばない（呼び出し回数＝費用）
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SERVINGS } from './dataset.ts';
import {
  COVERAGE_MIN,
  PARSE_MODEL,
  PARSE_SCHEMA,
  buildParseInput,
  clampCount,
  learnFrom,
  parseMeal,
  resolveParsed,
  type ParseInput,
} from './mealparse.ts';

/** 呼ばれた回数を数えるだけの偽クライアント */
function fakeClient(reply: unknown) {
  const calls: ParseInput[] = [];
  const client = async (input: ParseInput) => {
    calls.push(input);
    return reply;
  };
  return { client, calls };
}

test('出力スキーマに g も繊維量も置かない（ハルシネーションの経路を作らない）', () => {
  const item = PARSE_SCHEMA.properties.items.items;
  assert.deepEqual(Object.keys(item.properties), ['label', 'count', 'quoted']);
  assert.equal(item.additionalProperties, false);
  // 数値を返せるのは count だけ
  const numeric = Object.entries(item.properties).filter(([, v]) => v.type === 'number');
  assert.deepEqual(numeric.map(([k]) => k), ['count']);
  const json = JSON.stringify(PARSE_SCHEMA);
  for (const banned of ['gram', 'grams', 'fiber', 'soluble', 'insoluble', 'total']) {
    assert.ok(!json.includes(banned), `スキーマに ${banned} がある`);
  }
});

test('プリセットに無い label は記録に入らず unknown に回る', () => {
  const r = resolveParsed({
    items: [
      { label: '納豆', count: 1, quoted: '納豆' },
      { label: 'ポテトサラダ', count: 1, quoted: 'ポテサラ' }, // プリセットに無い
      { label: '架空の食品', count: 2, quoted: 'なにか' },
    ],
    unknown: [],
  });
  assert.deepEqual(r.entries.map((e) => e.serving.label), ['納豆']);
  assert.deepEqual(r.unknown, ['ポテトサラダ', '架空の食品']);
});

test('量は必ずデータから引く（返りの数値を信用しない）', () => {
  const r = resolveParsed({
    // 繊維量を勝手に付けてきても、スキーマ外なので無視される
    items: [{ label: '納豆', count: 1, quoted: '納豆', total: 999, fiber: 999 }],
    unknown: [],
  });
  const natto = SERVINGS.find((s) => s.label === '納豆')!;
  assert.equal(r.entries[0].serving, natto);
  assert.equal(r.entries[0].serving.total, natto.total);
});

test('表示名で返ってきても label に寄せる', () => {
  const r = resolveParsed({ items: [{ label: 'ごはん', count: 1, quoted: 'ごはん' }], unknown: [] });
  assert.equal(r.entries[0].serving.label, '白米ごはん');
});

test('同じ食品が複数行で返ったら合算する', () => {
  const r = resolveParsed({
    items: [
      { label: '納豆', count: 1, quoted: '納豆' },
      { label: '納豆', count: 2, quoted: 'なっとう' },
    ],
    unknown: [],
  });
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].count, 3);
});

test('壊れた返りで例外を投げない', () => {
  for (const bad of [null, undefined, 42, 'text', {}, { items: 'no' }, { items: [null, 3] }]) {
    const r = resolveParsed(bad);
    assert.deepEqual(r.entries, []);
    assert.equal(r.partial, true);
  }
});

test('count は 0.5〜10 の 0.5刻みに収める', () => {
  assert.equal(clampCount(0), 0.5);
  assert.equal(clampCount(-5), 0.5);
  assert.equal(clampCount(999), 10);
  assert.equal(clampCount(2.4), 2.5);
  assert.equal(clampCount(NaN), 1);
  assert.equal(clampCount('2'), 1);
  assert.equal(clampCount(undefined), 1);
});

test('辞書で足りる文ではLLMを呼ばない', async () => {
  const { client, calls } = fakeClient({ items: [], unknown: [] });
  const r = await parseMeal('もち麦ごはん2杯と納豆1パック', { client });
  assert.equal(calls.length, 0, 'LLMを呼んでしまっている');
  assert.equal(r.fromLexicon, true);
  assert.equal(r.partial, false);
  assert.deepEqual(r.entries.map((e) => `${e.serving.label}×${e.count}`), ['もち麦ごはん×2', '納豆×1']);
});

test('辞書で足りない文だけLLMに回す', async () => {
  const { client, calls } = fakeClient({
    items: [{ label: '納豆', count: 1, quoted: '納豆' }, { label: 'レタス', count: 1, quoted: 'サラダ' }],
    unknown: [],
  });
  const r = await parseMeal('朝は納豆ごはんとサラダ', { client });
  assert.equal(calls.length, 1);
  assert.equal(r.fromLexicon, false);
  assert.deepEqual(r.entries.map((e) => e.serving.label), ['納豆', 'レタス']);
});

test('LLMを持たない構成でも辞書の分は返す（不完全と印を付ける）', async () => {
  const r = await parseMeal('朝は納豆ごはんとサラダ');
  assert.equal(r.fromLexicon, true);
  assert.equal(r.partial, true, '不完全なのに記録に進める印になっている');
  assert.deepEqual(r.unknown, ['サラダ']);
});

test('LLMが落ちても辞書の結果に戻る', async () => {
  const client = async () => {
    throw new Error('network');
  };
  const r = await parseMeal('朝は納豆ごはんとサラダ', { client });
  assert.equal(r.partial, true);
  assert.equal(r.entries.length, 2);
});

test('LLMも解けなかったら辞書の結果に戻る', async () => {
  const { client } = fakeClient({ items: [], unknown: ['サラダ'] });
  const r = await parseMeal('朝は納豆ごはんとサラダ', { client });
  assert.equal(r.entries.length, 2);
  assert.equal(r.fromLexicon, true);
});

/**
 * キャッシュは固定部分が先・可変部分が後でないと落ちる。
 * ここが逆になっていると、毎回全文が課金対象になる
 */
test('固定部分だけに cache_control を付け、食事テキストは messages の最後に置く', () => {
  const input = buildParseInput('納豆');
  assert.equal(input.model, PARSE_MODEL);
  assert.equal(input.system.length, 1);
  assert.deepEqual(input.system[0].cache_control, { type: 'ephemeral' });
  // 食事テキストは system に混ぜない（混ぜると固定部分が毎回変わる）
  assert.ok(!input.system[0].text.includes('納豆を'));
  assert.equal(input.messages.at(-1)?.content, '納豆');
  assert.equal(input.output_config.format.type, 'json_schema');
});

test('固定プロンプトは全品目の label と単位を含む', () => {
  const text = buildParseInput('x').system[0].text;
  for (const s of SERVINGS) {
    assert.ok(text.includes(s.label), `${s.label} が一覧に無い`);
  }
});

test('学習辞書はLLMが解いた分だけ増える', () => {
  const viaLlm = resolveParsed({
    items: [{ label: 'レタス', count: 1, quoted: 'サラダ' }],
    unknown: [],
  });
  assert.deepEqual(learnFrom(viaLlm), { サラダ: 'レタス' });
  // 辞書で解けた結果は学習しない（もう辞書にある）
  const viaLexicon = { ...viaLlm, fromLexicon: true };
  assert.deepEqual(learnFrom(viaLexicon), {});
});

test('辞書だけで済ます基準は当たり率で決める', () => {
  assert.ok(COVERAGE_MIN > 0 && COVERAGE_MIN <= 1);
});

/**
 * 実際に起きた失敗。モデルが「ポテトサラダは一覧に無い」と unknown に入れながら、
 * 同時に items ではポテトチップスに置き換えて返してきた。
 * 材料が近いだけの別食品で繊維量が違うので、記録に入れてはいけない。
 */
test('同じ語を items と unknown の両方に返してきたら、置き換えの方を捨てる', () => {
  const r = resolveParsed({
    items: [
      { label: 'ポテトチップス', count: 0.5, quoted: 'ポテトサラダ' },
      { label: 'じゃがいも', count: 0.5, quoted: 'コロッケ' },
      { label: '納豆', count: 1, quoted: '納豆' },
    ],
    unknown: ['ポテトサラダ', 'コロッケ'],
  });
  // 矛盾していない納豆だけが残る
  assert.deepEqual(r.entries.map((e) => e.serving.label), ['納豆']);
  assert.deepEqual(r.unknown, ['ポテトサラダ', 'コロッケ']);
});

test('unknown に無い語の置き換えは通す（過剰に捨てない）', () => {
  const r = resolveParsed({
    items: [{ label: 'レタス', count: 1, quoted: 'サラダ' }],
    unknown: ['コロッケ'],
  });
  assert.deepEqual(r.entries.map((e) => e.serving.label), ['レタス']);
});

test('プロンプトが「似た食品への置き換え」を明示的に禁じている', () => {
  const text = buildParseInput('x').system[0].text;
  assert.ok(text.includes('置き換えない'), '置き換え禁止の指示がない');
  assert.ok(text.includes('ポテトサラダ'), '実際に失敗した例が入っていない');
  assert.ok(text.includes('両方に入れないこと'), '二重計上を禁じる指示がない');
});
