/**
 * 自由文の食事入力をプリセットに当てる層（TODO 20）。
 *
 * **2段構え。** まず `lib/lexicon.ts` の辞書で解く。辞書で足りたらLLMを呼ばない
 * （呼び出し回数がそのまま費用）。足りないときだけLLMに投げる。
 *
 * 守っている約束:
 *  1. **LLMに繊維量を計算させない。** 出力スキーマに g も繊維量も置いていないので、
 *     モデルは数値を返す場所を持たない。量は必ず `data/generated/servings.json` から引く
 *  2. **プリセットに無い label は落とす。** モデルが作った名前は記録に入れない
 *  3. **失敗したら黙って既存の検索に戻す。** LLMが落ちても記録は続けられる
 *  4. 呼び出しは注入する（`ParseClient`）。この層は API クライアントを import しない。
 *     端末に鍵を置く／プロキシを立てるの判断が決まっていないため、
 *     アプリのバンドルを SDK に依存させない（実呼び出しの例は `scripts/parse-dryrun.ts`）
 */
import { SERVINGS, normalize } from './dataset';
import { resolveMeal, type Learned, type MealResolution } from './lexicon';
import type { Serving } from './types';

/**
 * 食事パースのモデル。TODO 20 で決めた安いモデル枠。
 * コーチ提案（1日1回・質が命）は別で `claude-opus-5` を使う想定なので混ぜない。
 */
export const PARSE_MODEL = 'claude-haiku-4-5';

/** 返るのは品目と個数だけ。長い出力は要らない */
export const PARSE_MAX_TOKENS = 1024;

/**
 * 辞書だけで済ませる基準。
 * 未解決が無くても当たった文字が少ない文は拾い損じている
 *（「昼はポテトサラダ」で「ポテト」だけ当たる形）。
 */
export const COVERAGE_MIN = 0.5;

/** 量の選択と同じ範囲。0.5刻み */
const COUNT_MIN = 0.5;
const COUNT_MAX = 10;

/**
 * 構造化出力のスキーマ（`output_config.format`）。
 *
 * **g数も繊維量も持たせない。** ここにフィールドを足した瞬間に
 * ハルシネーションした数値が記録に入る経路ができる。
 */
export const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          /** 一覧に載っている label をそのまま返させる。表記を変えたものは落とす */
          label: { type: 'string' },
          /** 常用量の何人前か。0.5刻み */
          count: { type: 'number' },
          /** 入力文のどの部分を指しているか。確認画面に出す */
          quoted: { type: 'string' },
        },
        required: ['label', 'count', 'quoted'],
        additionalProperties: false,
      },
    },
    /** 一覧に無くて当てられなかった語。ユーザーに「登録がありません」と返すために使う */
    unknown: { type: 'array', items: { type: 'string' } },
  },
  required: ['items', 'unknown'],
  additionalProperties: false,
} as const;

/**
 * 固定側のプロンプト。変わらないので先頭に置き、`cache_control` を付ける。
 *
 * ⚠️ **いまの品目数ではキャッシュは効かない。** 178品目で約950トークンだが、
 * Haiku 4.5 のキャッシュ最小長は4096トークンで、届かないと
 * **エラーも出さずに無効**になる（`cache_creation_input_tokens: 0` で分かる）。
 * それでも印を残しているのは、品目が750件あたりを超えたら自動で効き始めるため。
 * 現状この固定部分は1回約0.001ドルなので、キャッシュのために構成を変える価値はない。
 */
export function buildSystemPrompt(servings: Serving[] = SERVINGS): string {
  const catalog = servings.map((s) => `${s.label}\t${s.unitLabel}`).join('\n');
  return [
    '日本語の食事メモを、決まった食品一覧の項目に対応づけてください。',
    '',
    '規則:',
    '- label は必ず一覧の文字列をそのまま使う。言い換えや新しい名前を作らない',
    '- count は常用量の何人前か。単位は一覧の単位。既定は1。0.5刻み',
    '- 一覧に無いものは items に入れず unknown に元の語を入れる',
    '- 栄養素の量やグラム数は答えない（こちらで一覧から引く）',
    '- 同じ食品が2回出てきたら count をまとめる',
    '',
    `食品一覧（label\t単位・${servings.length}件）:`,
    catalog,
  ].join('\n');
}

/** `client.messages.parse()` にそのまま渡せる形 */
export type ParseInput = {
  model: string;
  max_tokens: number;
  system: { type: 'text'; text: string; cache_control: { type: 'ephemeral' } }[];
  messages: { role: 'user'; content: string }[];
  output_config: { format: { type: 'json_schema'; schema: typeof PARSE_SCHEMA } };
};

export function buildParseInput(text: string, servings: Serving[] = SERVINGS): ParseInput {
  return {
    model: PARSE_MODEL,
    max_tokens: PARSE_MAX_TOKENS,
    // 固定部分はここだけ。cache_control を付けるのもここだけ
    system: [
      { type: 'text', text: buildSystemPrompt(servings), cache_control: { type: 'ephemeral' } },
    ],
    // 可変部分は最後（先頭に混ぜるとキャッシュが毎回落ちる）
    messages: [{ role: 'user', content: text }],
    output_config: { format: { type: 'json_schema', schema: PARSE_SCHEMA } },
  };
}

export type ParsedEntry = {
  serving: Serving;
  count: number;
  /** 入力文のどの部分から来たか。確認画面に出す */
  quoted: string;
};

export type ParseResult = {
  entries: ParsedEntry[];
  /** 当てられなかった語。「登録がありません」と返す */
  unknown: string[];
  /** 辞書だけで解けた（LLMを呼んでいない） */
  fromLexicon: boolean;
  /**
   * 結果が不完全であることの印。true のときは
   * **記録に進ませず、既存の検索に落とす**（誤記録より探し直しのほうが軽い）
   */
  partial: boolean;
};

/**
 * LLMの返りを検証してプリセットに落とす。**ここが唯一の入口**。
 * 形が違えば黙って捨てる（例外を投げない。記録の流れを止めない）。
 */
export function resolveParsed(raw: unknown, servings: Serving[] = SERVINGS): ParseResult {
  const empty: ParseResult = { entries: [], unknown: [], fromLexicon: false, partial: true };
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as { items?: unknown; unknown?: unknown };
  if (!Array.isArray(obj.items)) return empty;

  const byLabel = new Map(servings.map((s) => [s.label, s]));
  const byDisplay = new Map(servings.map((s) => [s.displayName, s]));
  const entries: ParsedEntry[] = [];
  const dropped: string[] = [];

  for (const item of obj.items) {
    if (!item || typeof item !== 'object') continue;
    const { label, count, quoted } = item as { label?: unknown; count?: unknown; quoted?: unknown };
    if (typeof label !== 'string') continue;
    // label をそのまま探し、見つからなければ表示名でも見る。作られた名前はここで落ちる
    const serving = byLabel.get(label) ?? byDisplay.get(label);
    if (!serving) {
      dropped.push(label);
      continue;
    }
    entries.push({
      serving,
      count: clampCount(count),
      quoted: typeof quoted === 'string' ? quoted : serving.displayName,
    });
  }

  const unknown = [
    ...(Array.isArray(obj.unknown) ? obj.unknown.filter((u): u is string => typeof u === 'string') : []),
    ...dropped,
  ];
  return { entries: mergeSame(entries), unknown, fromLexicon: false, partial: entries.length === 0 };
}

/** 数量の正規化。壊れた値でも記録を止めない（既定1に寄せる） */
export function clampCount(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 1;
  const stepped = Math.round(n * 2) / 2;
  return Math.min(COUNT_MAX, Math.max(COUNT_MIN, stepped));
}

/** 同じ食品が複数行で返ってきたら足す（「ごはんとごはん」で2行にしない） */
function mergeSame(entries: ParsedEntry[]): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  for (const e of entries) {
    const found = out.find((x) => x.serving.label === e.serving.label);
    if (found) found.count = clampCount(found.count + e.count);
    else out.push({ ...e });
  }
  return out;
}

/** 注入する呼び出し。`scripts/parse-dryrun.ts` が実物を渡す */
export type ParseClient = (input: ParseInput) => Promise<unknown>;

export type ParseDeps = {
  client?: ParseClient;
  learned?: Learned;
  servings?: Serving[];
};

/**
 * 自由文を解く本体。**辞書 → 必要ならLLM** の順。
 *
 * 返り値は常に「提案」で、そのまま記録しない。
 * 入力の取り違えは記録の信頼をいちばん早く壊すので、確認を挟む前提で作っている。
 */
export async function parseMeal(text: string, deps: ParseDeps = {}): Promise<ParseResult> {
  const servings = deps.servings ?? SERVINGS;
  const lex = resolveMeal(text, deps.learned ?? {});
  const enough = lex.unresolved.length === 0 && lex.hits.length > 0 && lex.coverage >= COVERAGE_MIN;
  if (enough) return fromLexicon(lex);

  if (!deps.client) {
    // LLMを持たない構成（既定）。辞書で当たった分だけ返し、不完全と印を付ける
    return { ...fromLexicon(lex), partial: true, unknown: lex.unresolved };
  }

  try {
    const raw = await deps.client(buildParseInput(text, servings));
    const result = resolveParsed(raw, servings);
    // LLMも解けなかったら辞書の結果に戻す（空を返すより、当たった分は見せる）
    return result.entries.length ? result : { ...fromLexicon(lex), partial: true, unknown: lex.unresolved };
  } catch {
    return { ...fromLexicon(lex), partial: true, unknown: lex.unresolved };
  }
}

function fromLexicon(lex: MealResolution): ParseResult {
  return {
    entries: mergeSame(lex.hits.map((h) => ({ serving: h.serving, count: h.count, quoted: h.matched }))),
    unknown: lex.unresolved,
    fromLexicon: true,
    partial: lex.unresolved.length > 0,
  };
}

/**
 * LLMが解いた対応を学習辞書に足す（TODO 19「全ユーザー共通辞書にして逓減させる」の端末版）。
 * サーバを持たないので今は端末ごとに溜まる。共通辞書にするならここを書き出す先を変える。
 */
export function learnFrom(result: ParseResult, learned: Learned = {}): Learned {
  if (result.fromLexicon) return learned;
  const next = { ...learned };
  for (const e of result.entries) {
    const key = normalize(e.quoted);
    // 引用が空・長すぎる・すでに辞書にあるものは入れない
    if (key.length >= 2 && key.length <= 20 && !next[key]) next[key] = e.serving.label;
  }
  return next;
}
