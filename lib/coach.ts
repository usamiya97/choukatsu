/**
 * コーチ提案の選択（DESIGN.md §5・coach_catalog.csv 37件）。
 *
 * 原則:
 *  - **1日1つだけ出す。** 複数出すと「情報が多すぎる」を自分で再生産する
 *  - 同じ日に何度アプリを開いても同じ提案が出る（日付シードで決定論的に選ぶ）
 *  - ユーザーが「無理」と答えた食品(q10)と、軸ごとの禁止リストは必ず落とす
 *  - LLMは使わない。カタログから選ぶだけ（数値はデータ由来のまま）
 */
import { balanceOf, bannedLabels } from './format';
import type { Evidence } from './format';
import { daysSinceLastLog, dayTotals, indexServings, recentMissStreak, totalLoggedDays, uniqueLabels } from './state';
import type { Caution, CoachItem, CoachTrigger, Logs, Serving, Swap, Targets, Totals } from './types';

export type CoachContext = {
  logs: Logs;
  todayKey: string;
  servings: Serving[];
  catalog: CoachItem[];
  swaps: Swap[];
  cautions: Caution[];
  targets: Targets;
  /** 初回診断 q10 の除外。永続。提案生成時に必ずフィルタする */
  excludedFoods?: string[];
  /** 前回出した提案。同じものを2日続けて出さないため */
  lastShown?: { id: string; date: string } | null;
};

/**
 * どのトリガーを使うか。上から順に見る。
 *
 * 「記録が途切れた後」を最優先にしているのは、空けた直後に不足の指摘から入ると
 * 戻ってきたことを罰する形になるため（DESIGN §9-2 弱らせない）。
 */
export function resolveTrigger(ctx: CoachContext): CoachTrigger {
  const { logs, todayKey, servings, targets } = ctx;
  const byLabel = indexServings(servings);
  const gap = daysSinceLastLog(logs, todayKey);
  const logged = totalLoggedDays(logs);

  if (gap !== null && gap >= 3) return '記録が途切れた後';
  if (logged < 3) return '記録3日未満';

  const today = dayTotals(logs, todayKey, byLabel);
  if (today.total >= targets.total) {
    switch (balanceOf(today, targets)) {
      case 'soluble-low':
        return '達成・水溶性不足';
      case 'insoluble-low':
        return '達成・不溶性不足';
      default:
        return '達成・バランス良好';
    }
  }

  if (recentMissStreak(logs, todayKey, byLabel, targets.total) >= 3) return '連続未達3日';

  return shortfallTrigger(today, targets);
}

/**
 * 未達のとき、総量／菌のごはん／おそうじ のどれを言うか。
 *
 * 総量が半分も無い日に「菌のごはんが少なめ」と言っても行動に繋がらないので、
 * まず総量を押す。総量がある程度あるときだけ、達成率がいちばん低い軸に切り替える。
 */
export function shortfallTrigger(today: Totals, targets: Targets): CoachTrigger {
  const totalRatio = today.total / targets.total;
  if (totalRatio < 0.5) return '総量不足';
  const sol = today.soluble / targets.soluble;
  const insol = today.insoluble / targets.insoluble;
  if (sol < insol && sol < 1) return '水溶性不足';
  if (insol < sol && insol < 1) return '不溶性不足';
  return '総量不足';
}

const AXIS_OF_TRIGGER: Record<string, 'total' | 'soluble' | 'insoluble'> = {
  水溶性不足: 'soluble',
  '達成・水溶性不足': 'soluble',
  不溶性不足: 'insoluble',
  '達成・不溶性不足': 'insoluble',
};

export type CoachSuggestion = {
  item: CoachItem;
  trigger: CoachTrigger;
  evidence: Evidence;
  /** 置き換え提案のとき、対応する swaps の行（食品詳細への導線に使う） */
  swap: Swap | null;
};

/**
 * 今日の提案を1つ返す。返り値は日付が変わるまで安定する。
 */
export function pickCoach(ctx: CoachContext): CoachSuggestion | null {
  const trigger = resolveTrigger(ctx);
  const axis = AXIS_OF_TRIGGER[trigger] ?? 'total';
  const banned = bannedLabels(ctx.cautions, axis);
  const excluded = new Set(ctx.excludedFoods ?? []);
  const byLabel = indexServings(ctx.servings);
  const eatenToday = new Set((ctx.logs[ctx.todayKey] ?? []).map((e) => e.label));
  const known = uniqueLabels(ctx.logs);

  let pool = ctx.catalog.filter((c) => c.trigger === trigger);
  // 苦手（q10）と軸ごとの禁止を落とす。display_name で書かれている行もあるので両方で照合する
  pool = pool.filter((c) => {
    if (!c.targetFood) return true;
    const label = resolveLabel(c.targetFood, byLabel, ctx.servings);
    if (!label) return true;
    return !excluded.has(label) && !banned.has(label);
  });
  if (!pool.length) return null;

  const best = Math.min(...pool.map((c) => c.priority));
  let candidates = pool.filter((c) => c.priority === best);

  // 今日すでに食べたものを勧めない（「もう食べた」と言われる提案は信頼を落とす）
  const notEaten = candidates.filter((c) => {
    const label = c.targetFood ? resolveLabel(c.targetFood, byLabel, ctx.servings) : null;
    return !label || !eatenToday.has(label);
  });
  if (notEaten.length) candidates = notEaten;

  // 置き換え提案は、置き換え元を実際に記録したことがある人にこそ効く
  const swapOf = (c: CoachItem) => findSwap(c, ctx.swaps, byLabel, ctx.servings);
  const relevant = candidates.filter((c) => {
    const s = swapOf(c);
    return s ? known.has(s.before) : false;
  });
  if (relevant.length) candidates = relevant;

  // 昨日と同じものは避ける（毎日同じ提案だと読まれなくなる）
  const lastId = ctx.lastShown?.id;
  if (lastId && candidates.length > 1) {
    const others = candidates.filter((c) => c.id !== lastId);
    if (others.length) candidates = others;
  }

  const item = candidates[dailyIndex(ctx.todayKey, candidates.length)];
  return { item, trigger, evidence: evidenceOf(item), swap: swapOf(item) };
}

/** 根拠バッジ（DESIGN §5-3）。数値の出どころで決める。断定しない語を選ぶ */
export function evidenceOf(item: CoachItem): Evidence {
  switch (item.kind) {
    case '置き換え':
    case '追加':
      return '成分表より';
    case 'バランス':
    case '称賛':
      return 'あなたのデータ';
    default:
      return '一般に言われる';
  }
}

/** target_food は label か display_name。label に正規化する */
function resolveLabel(targetFood: string, byLabel: Map<string, Serving>, servings: Serving[]): string | null {
  if (byLabel.has(targetFood)) return targetFood;
  return servings.find((s) => s.displayName === targetFood)?.label ?? null;
}

function findSwap(
  item: CoachItem,
  swaps: Swap[],
  byLabel: Map<string, Serving>,
  servings: Serving[]
): Swap | null {
  if (item.kind !== '置き換え' || !item.targetFood) return null;
  const after = resolveLabel(item.targetFood, byLabel, servings);
  if (!after) return null;
  const purpose = item.source.startsWith('swaps:') ? item.source.slice('swaps:'.length) : null;
  const rows = swaps.filter((s) => s.after === after && (!purpose || s.purpose === purpose));
  // 提案文に置き換え元が書かれているので、それで一意に絞る
  return rows.find((s) => item.message.includes(s.beforeDisplay)) ?? rows[0] ?? null;
}

/** 日付から決まるインデックス。同じ日なら何度開いても同じ提案 */
export function dailyIndex(dateKey: string, length: number): number {
  if (length <= 1) return 0;
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = (h * 31 + dateKey.charCodeAt(i)) % 100000007;
  return h % length;
}
