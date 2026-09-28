/**
 * コーチ提案のLLM化（TODO 20・1日1回）。
 *
 * **提案そのものは生成させない。** 生成させるのは
 *  (1) カタログ37件のどれを出すか（id）
 *  (2) その日のデータに触れる短いひとこと（数字なし）
 * の2つだけ。
 *
 * 理由: 提案文には「菌のごはんが約1.4g増えます」のような**データ由来の数値**が入っている。
 * 生成文に数値を許すと、もっともらしい嘘が混ざったときに誰も気づけない
 * （読む側には正しいか判定できない）。だから数値を含む主張はカタログのまま使い、
 * LLMには「あなたのデータをどう言うか」だけをやらせる。
 *
 * さらに、生成文には DESIGN §5-1 の禁止語検査を**実行時に**かける。
 * カタログは作るときに人が見ているが、LLMが書いた文は誰も見ていない。
 */
import { hasBannedWord, hasDigit } from './safety';
import type { CoachItem, Targets, Totals } from './types';

/** コーチは1日1回・質が命なので、食事パースの安いモデル枠とは分ける */
export const COACH_MODEL = 'claude-opus-5';
export const COACH_MAX_TOKENS = 512;

/** ひとことの上限。これを超えるとカードが2枚分の高さになり「1日1つ」が崩れる */
export const LEAD_MAX_CHARS = 60;

export const COACH_SCHEMA = {
  type: 'object',
  properties: {
    /** 候補として渡したカタログのid。ここに無いidは捨てる */
    pick: { type: 'string' },
    /** 今日のデータに触れるひとこと。**数字は書かせない** */
    lead: { type: 'string' },
  },
  required: ['pick', 'lead'],
  additionalProperties: false,
} as const;

export type CoachLlmContext = {
  candidates: CoachItem[];
  today: Totals;
  targets: Targets;
  /** 直近7日で記録のあった日数。「続いている」を言うための材料 */
  weekLogDays: number;
  /** 直近によく記録している食品の表示名（多い順・数件） */
  frequent: string[];
  /** 記録が途切れていた日数。0なら途切れていない */
  gapDays: number;
};

export type CoachInput = {
  model: string;
  max_tokens: number;
  output_config: { effort: 'low'; format: { type: 'json_schema'; schema: typeof COACH_SCHEMA } };
  system: { type: 'text'; text: string; cache_control: { type: 'ephemeral' } }[];
  messages: { role: 'user'; content: string }[];
};

/** 固定側。規則だけを置く（候補は日によって変わるので messages に入れる） */
export function buildCoachSystem(): string {
  return [
    '腸活アプリのコーチです。今日のユーザーに出す提案を、候補の中から1つ選んでください。',
    'あわせて、その人のデータに触れる短いひとことを書いてください。',
    '',
    '規則:',
    `- lead は${LEAD_MAX_CHARS}文字以内。1文。やわらかい言い方にする`,
    '- **lead に数字を書かない。** 量やグラム数はこちらでデータから出す',
    '- 次の語を使わない: 治る、改善、効く、効果、解消、便秘、下痢、デトックス、毒素、老廃物、痩せ、ダイエット、セロトニン',
    '- 症状や体調を断定しない。医学的な助言をしない',
    '- できていないことを責めない。記録が途切れていた人を戻ってきたことで責めない',
    '- pick は候補のidをそのまま返す。候補に無いidを作らない',
  ].join('\n');
}

/** 可変側。今日の状況と候補 */
export function buildCoachUser(ctx: CoachLlmContext): string {
  const share = ctx.today.total > 0 ? Math.round((ctx.today.soluble / ctx.today.total) * 100) : 0;
  return [
    '今日の状況:',
    `- 今日の食物繊維は目標の${Math.round((ctx.today.total / ctx.targets.total) * 100)}%`,
    `- 水溶性の割合は${share}%（目安33%）`,
    `- この7日で記録した日数: ${ctx.weekLogDays}日`,
    ctx.gapDays > 0 ? `- ${ctx.gapDays}日ぶりの記録` : '- 記録は続いています',
    ctx.frequent.length ? `- よく記録している食品: ${ctx.frequent.join('、')}` : '',
    '',
    '候補:',
    ...ctx.candidates.map((c) => `${c.id}\t${c.message}`),
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildCoachInput(ctx: CoachLlmContext): CoachInput {
  return {
    model: COACH_MODEL,
    max_tokens: COACH_MAX_TOKENS,
    // 短い1文を選ぶだけの仕事なので effort は低くてよい
    output_config: { effort: 'low', format: { type: 'json_schema', schema: COACH_SCHEMA } },
    system: [{ type: 'text', text: buildCoachSystem(), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildCoachUser(ctx) }],
  };
}

export type CoachLlmResult = {
  item: CoachItem;
  /** 検査を通ったひとこと。通らなければ null（提案だけ出す） */
  lead: string | null;
};

/**
 * 返りを検証する。**ここが唯一の入口。**
 *
 * - pick が候補に無ければ null（カタログの既定の選び方に戻す）
 * - lead が検査を落ちたら **lead だけ捨てて提案は出す**（全部消すより落ち方が軽い）
 */
export function resolveCoachLlm(raw: unknown, candidates: CoachItem[]): CoachLlmResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const { pick, lead } = raw as { pick?: unknown; lead?: unknown };
  if (typeof pick !== 'string') return null;
  const item = candidates.find((c) => c.id === pick);
  if (!item) return null;
  return { item, lead: validLead(lead) };
}

/** ひとことの検査。1つでも落ちたら使わない */
export function validLead(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const lead = value.trim();
  if (!lead || lead.length > LEAD_MAX_CHARS) return null;
  // 数値を含む主張はカタログのものだけにする
  if (hasDigit(lead)) return null;
  if (hasBannedWord(lead)) return null;
  return lead;
}

/** 注入する呼び出し。lib/anthropic.ts が実物を渡す */
export type CoachClient = (input: CoachInput) => Promise<unknown>;

/**
 * 1日1回だけ呼ぶ。**失敗したら null を返してカタログの選び方に戻す。**
 * 例外は投げない（提案が出ないだけで、記録は続けられる）。
 */
export async function llmCoach(
  ctx: CoachLlmContext,
  client: CoachClient
): Promise<CoachLlmResult | null> {
  if (!ctx.candidates.length) return null;
  try {
    return resolveCoachLlm(await client(buildCoachInput(ctx)), ctx.candidates);
  } catch {
    return null;
  }
}
