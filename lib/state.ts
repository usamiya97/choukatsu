/**
 * 状態モデル（DESIGN.md §1・§2）。
 *
 * この層に副作用を置かない。AsyncStorage から読んだ Logs と servings を渡すと
 * 画面が必要な値が全部出る、という形にしてある（テストがUIなしで書けるようにするため）。
 */
import type { Logs, LogEntry, Serving, Stage, Totals } from './types';

export const EMPTY_TOTALS: Totals = { total: 0, soluble: 0, insoluble: 0 };

/** ローカル日付の YYYY-MM-DD。UTCに寄せると深夜の記録が前日に落ちるので必ずローカルで出す */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + delta));
}

/** key を含む直近 n 日。[key, key-1, ..., key-(n-1)] */
export function lastNDays(key: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftDays(key, -i));
}

export function indexServings(servings: Serving[]): Map<string, Serving> {
  return new Map(servings.map((s) => [s.label, s]));
}

export function sumEntries(entries: LogEntry[] | undefined, byLabel: Map<string, Serving>): Totals {
  if (!entries?.length) return EMPTY_TOTALS;
  let total = 0;
  let soluble = 0;
  let insoluble = 0;
  for (const e of entries) {
    const s = byLabel.get(e.label);
    if (!s) continue; // データ更新でラベルが消えた場合。落とさず無視する
    total += s.total * e.count;
    soluble += s.soluble * e.count;
    insoluble += s.insoluble * e.count;
  }
  return { total, soluble, insoluble };
}

export function dayTotals(logs: Logs, key: string, byLabel: Map<string, Serving>): Totals {
  return sumEntries(logs[key], byLabel);
}

export type StageScore = {
  /** 7日平均(g)。記録がある日だけの平均 */
  score: number;
  /** 平均に使った日数 */
  loggedDays: number;
  /** 今日の記録しか無くて今日を使った（初日）か */
  usedToday: boolean;
};

/**
 * キャラの段階を駆動する7日平均。
 *
 * **今日は平均に入れない。** 入れると朝いちばん（today=0.5g）で平均が落ち、
 * キャラが日中ずっと弱って見える＝日次メーターに紐づけたのと同じ失敗になる（DESIGN §1-1）。
 * ただし記録初日だけは昨日以前が空で何も動かないため、今日を暫定的に使う。
 *
 * 未記録日は 0 として数えない（記録しなかったこと自体を罰しない・DESIGN §1-2）。
 */
export function stageScore(logs: Logs, todayKey: string, byLabel: Map<string, Serving>): StageScore {
  const past = lastNDays(shiftDays(todayKey, -1), 7).filter((k) => logs[k]?.length);
  if (past.length) {
    const sum = past.reduce((acc, k) => acc + dayTotals(logs, k, byLabel).total, 0);
    return { score: sum / past.length, loggedDays: past.length, usedToday: false };
  }
  if (logs[todayKey]?.length) {
    return { score: dayTotals(logs, todayKey, byLabel).total, loggedDays: 1, usedToday: true };
  }
  return { score: 0, loggedDays: 0, usedToday: false };
}

/**
 * 上がる閾値 / 下がる閾値。ヒステリシスは全段階で 1.5g（DESIGN §2）。
 *
 * 配分は摂取基準の2段構えに合わせてある（企画メモ 第2章: 目標量18g以上・理想25g。
 * 実際の摂取中央値は17.3g）。
 *
 *   段階2( 4g) 記録が始まった   / 段階3( 9g) 中央値17.3gの半分を超えた
 *   段階4(18g) **目標量に到達**  / 段階5(25g) **理想値に到達**
 *
 * 段階4と5に意味のある数字を置いているのが要点。「目標に届いた」が見た目に出て、
 * その上に理想値ぶんの伸びしろが残る。
 */
const STAGE_UP: Record<Exclude<Stage, 1>, number> = { 2: 4.0, 3: 9.0, 4: 18.0, 5: 25.0 };
const STAGE_DOWN: Record<Exclude<Stage, 1>, number> = { 2: 2.5, 3: 7.5, 4: 16.5, 5: 23.5 };

/** テストとドキュメント生成のために公開する。画面からは resolveStage 経由で使う */
export const STAGE_THRESHOLDS = { up: STAGE_UP, down: STAGE_DOWN } as const;

/**
 * ヒステリシス付きの段階解決。前回の段階を必ず渡す（履歴依存＝これが本体）。
 *
 * 12.0g を行き来しても段階が毎日変わらない。かつ下がる側の閾値を低くしてあるので
 * 降格しにくい方向に偏る（罰を弱くするための非対称設計）。
 */
export function resolveStage(score: number, prev: Stage = 1): Stage {
  let stage: Stage = prev;
  while (stage < 5 && score >= STAGE_UP[(stage + 1) as Exclude<Stage, 1>]) {
    stage = (stage + 1) as Stage;
  }
  while (stage > 1 && score < STAGE_DOWN[stage as Exclude<Stage, 1>]) {
    stage = (stage - 1) as Stage;
  }
  return stage;
}

/** 累積でユニークに記録した食品数（0..プリセット数）。減らない */
export function floraCount(logs: Logs): number {
  return uniqueLabels(logs).size;
}

export function uniqueLabels(logs: Logs): Set<string> {
  const set = new Set<string>();
  for (const entries of Object.values(logs)) {
    for (const e of entries) set.add(e.label);
  }
  return set;
}

/** まわりに舞う菌の数。min(floor(flora/4), 30)（DESIGN §3） */
export function floraDots(flora: number): number {
  return Math.min(Math.floor(flora / 4), 30);
}

/** 直近7日の記録日数（0..7）。streak は実装しない — 切れるものを存在させない */
export function weekLogDays(logs: Logs, todayKey: string): number {
  return lastNDays(todayKey, 7).filter((k) => logs[k]?.length).length;
}

/** 記録がある日の総数（立ち上がり判定に使う。3日で診断の推定値を破棄する） */
export function totalLoggedDays(logs: Logs): number {
  return Object.values(logs).filter((e) => e.length > 0).length;
}

/**
 * 最後に記録した日から何日空いたか。記録が一度も無ければ null。
 * 「記録が途切れた後」トリガーの判定に使う。
 */
export function daysSinceLastLog(logs: Logs, todayKey: string): number | null {
  const keys = Object.keys(logs)
    .filter((k) => logs[k].length)
    .sort();
  const last = keys[keys.length - 1];
  if (!last) return null;
  return daysBetween(last, todayKey);
}

export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}

/**
 * 直近の「記録があるのに目標未達」が何日続いているか（今日は含めない）。
 * 未記録日は連鎖を切らない（記録していない日を未達として数えない）。
 */
export function recentMissStreak(
  logs: Logs,
  todayKey: string,
  byLabel: Map<string, Serving>,
  targetTotal: number
): number {
  let miss = 0;
  for (let i = 1; i <= 14; i++) {
    const key = shiftDays(todayKey, -i);
    if (!logs[key]?.length) continue;
    if (dayTotals(logs, key, byLabel).total >= targetTotal) break;
    miss++;
  }
  return miss;
}

export type GutState = {
  today: Totals;
  stage: Stage;
  stageScore: number;
  stageLoggedDays: number;
  flora: number;
  floraDots: number;
  weekLogDays: number;
  totalLoggedDays: number;
  /** 診断の推定値ではなく実測を使ってよいか（記録3日以上） */
  useMeasured: boolean;
  /** 段階が診断の推定値で動いている（暫定表示）か */
  provisional: boolean;
};

/**
 * @param estimate 初回診断の推定総量。記録3日未満のあいだ、段階の駆動にこれを使う
 *   （記録0日でキャラが必ず段階1から始まると、診断に答えた意味が画面に出ない・DESIGN §1-3）
 */
export function computeGutState(
  logs: Logs,
  todayKey: string,
  servings: Serving[],
  prevStage: Stage = 1,
  estimate: number | null = null
): GutState {
  const byLabel = indexServings(servings);
  const measured = stageScore(logs, todayKey, byLabel);
  const useMeasured = totalLoggedDays(logs) >= 3;
  const score =
    !useMeasured && estimate !== null
      ? { score: estimate, loggedDays: measured.loggedDays, usedToday: measured.usedToday }
      : measured;
  const flora = floraCount(logs);
  const logged = totalLoggedDays(logs);
  return {
    today: dayTotals(logs, todayKey, byLabel),
    stage: resolveStage(score.score, prevStage),
    stageScore: score.score,
    stageLoggedDays: score.loggedDays,
    flora,
    floraDots: floraDots(flora),
    weekLogDays: weekLogDays(logs, todayKey),
    totalLoggedDays: logged,
    useMeasured,
    /** 段階が診断の推定値で暫定表示されているか（画面に「まだ見極め中」と出す） */
    provisional: !useMeasured && estimate !== null,
  };
}
