/**
 * 自由文入力のドライラン。
 *
 *   npm run dryrun:parse                          # 辞書だけ（無料・APIを叩かない）
 *   npm run dryrun:parse -- "朝は納豆ごはんとサラダ"  # 1文だけ辞書で試す
 *   npm run dryrun:parse -- --live "ポテトサラダ"    # 実際にAPIを叩く（課金される）
 *
 * キーはリポジトリ直下の `.env` に置く（`.gitignore` 済み）:
 *   ANTHROPIC_API_KEY=sk-ant-...
 * npm script が `--env-file-if-exists=.env` を付けているので読み込まれる。
 * **`npx tsx scripts/parse-dryrun.ts` と直接叩くと .env は読まれない**（そのときは export する）。
 *
 * 既定では**LLMを呼ばない**。辞書（lib/lexicon.ts）でどこまで解けるかを見るためのもので、
 * 「LLMを呼ぶ／呼ばない」の判定がそのまま費用になるので、まずここの命中率を見る。
 *
 * --live は `@anthropic-ai/sdk` が必要。アプリのバンドルには入れたくないので
 * devDependency にも追加していない（下の案内どおり手で入れる）。
 */
import { SERVINGS } from '../lib/dataset';
import { servingLabel } from '../lib/format';
import { resolveMeal } from '../lib/lexicon';
import {
  PARSE_MODEL,
  buildParseInput,
  buildSystemPrompt,
  parseMeal,
  resolveParsed,
  type ParseResult,
} from '../lib/mealparse';

const args = process.argv.slice(2);
const live = args.includes('--live');
const texts = args.filter((a) => !a.startsWith('--'));

/** 辞書の限界が見える例をそろえてある。直したら必ずここに1件足す */
const SAMPLES = [
  '朝は納豆ごはんとサラダ',
  'もち麦ごはん2杯と納豆1パック',
  'ごぼうのきんぴら',
  '今日はもち麦ごはん3杯、納豆、ブロッコリー、干し柿を食べました',
  '昼はポテトサラダとコロッケを食べた',
  'ラーメン',
  '煎餅',
  'オートミール半分',
];

async function main() {
  if (live) {
    await runLive(texts.length ? texts : ['昼はポテトサラダとコロッケを食べた']);
    return;
  }
  const system = buildSystemPrompt();
  // 日本語はトークン密度が高い。実測（2091文字 → 約2690トークン）から 1.3倍で見積もる
  const approxTokens = Math.round(system.length * 1.3);
  console.log(
    `辞書 ${SERVINGS.length}品目 / 固定プロンプト ${system.length}文字（約${approxTokens}トークン）`
  );
  // Haiku 4.5 のキャッシュ最小長は4096トークン。届いていないと cache_control は黙って無効
  if (approxTokens < 4096) {
    console.log(`※ ${PARSE_MODEL} のキャッシュ最小長4096トークンに届かないので、キャッシュは効きません`);
  }
  console.log('※ LLMは呼びません。--live で実際に叩けます\n');

  let noLlm = 0;
  const list = texts.length ? texts : SAMPLES;
  for (const text of list) {
    const lex = resolveMeal(text);
    const result = await parseMeal(text); // client を渡さない＝辞書だけ
    if (!result.partial) noLlm += 1;
    console.log(`"${text}"`);
    console.log(`  当たり率 ${(lex.coverage * 100).toFixed(0)}%   LLM ${result.partial ? '必要' : '不要'}`);
    show(result);
    console.log();
  }
  console.log(`辞書だけで完結: ${noLlm} / ${list.length} 件`);
}

function show(result: ParseResult) {
  for (const e of result.entries) {
    const fiber = (e.serving.total * e.count).toFixed(1);
    console.log(`  ○ ${servingLabel(e.serving, e.count)}  食物繊維 ${fiber}g  ←「${e.quoted}」`);
  }
  if (result.unknown.length) console.log(`  × 当てられず: ${result.unknown.join(' / ')}`);
  if (!result.entries.length && !result.unknown.length) console.log('  （何も当たらず）');
}

/**
 * 実呼び出し。`@anthropic-ai/sdk` を動的に読むのは、
 * アプリの依存に入れずにこのスクリプトだけで使えるようにするため。
 */
async function runLive(list: string[]) {
  const spec = '@anthropic-ai/sdk';
  let Anthropic: any;
  try {
    Anthropic = (await import(spec)).default;
  } catch {
    console.error(
      `${spec} が入っていません。このスクリプト専用なので手で入れてください:\n` +
        `  npm install --save-dev ${spec} --legacy-peer-deps\n` +
        '（--legacy-peer-deps が必要なのは expo-modules-core と react-native-worklets の\n' +
        '  ピア依存が元から衝突しているためで、このSDKのせいではありません）'
    );
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      'ANTHROPIC_API_KEY が未設定です。リポジトリ直下に .env を作ってください:\n' +
        '  ANTHROPIC_API_KEY=sk-ant-...\n' +
        '（直接 npx tsx で叩くと .env は読まれません。npm run dryrun:parse を使ってください）'
    );
    process.exit(1);
  }

  const client = new Anthropic();
  console.log(`モデル ${PARSE_MODEL}（実際に課金されます）\n`);

  for (const text of list) {
    const input = buildParseInput(text);
    const response = await client.messages.create(input);
    // 構造化出力は text ブロックにJSON文字列で入る
    const block = response.content.find((b: { type: string }) => b.type === 'text');
    let raw: unknown = null;
    try {
      raw = block ? JSON.parse(block.text) : null;
    } catch {
      console.error('  JSONとして読めませんでした:', block?.text?.slice(0, 200));
    }
    console.log(`"${text}"`);
    show(resolveParsed(raw));
    const u = response.usage;
    console.log(
      `  トークン: 入力${u.input_tokens} / キャッシュ書き込み${u.cache_creation_input_tokens ?? 0}` +
        ` / キャッシュ読み${u.cache_read_input_tokens ?? 0} / 出力${u.output_tokens}`
    );
    // 2回目以降で「キャッシュ読み」が0のままなら、固定部分がキャッシュ最小長に届いていない
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
