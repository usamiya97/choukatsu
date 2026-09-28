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

/** ヒステリシスの幅。全段階で共通（DESIGN §2） */
export const STAGE_HYSTERESIS_G = 1.5;

/**
 * 段階5の上限(g)。**7日平均でこれ以上を要求しない。**
 *
 * 根拠: プリセットだけで組んだ現実的な1日の上限が 32.2g（9タップ・lib/state.test.ts で固定）。
 * 目標30gに「目標+7g=37g」を当てると最上段が到達不能になり、上限のある質の軸（DESIGN §3）が
 * 死んだ飾りになるため、ここで止める。
 */
export const STAGE_CEILING_G = 32;

/**
 * 目標総量から段階の閾値を作る（DESIGN §2）。
 *
 * 段階を絶対値で持たず**目標に対する位置**で決めるのは、目標値を変えられるようにしたため。
 * 目標だけ上げて段階が絶対値のままだと、「目標達成＝最上段」になって伸びしろが消える。
 *
 *   段階2 = 目標の22%  記録が始まった
 *   段階3 = 目標の50%  半分まで来た
 *   段階4 = **目標そのもの**（ここが「届いた」の位置）
 *   段階5 = 目標 +7g   目標を大きく超えて続いている（ただし上限 CEILING_G）
 *
 * 目標18gを入れると 4 / 9 / 18 / 25 になる（＝摂取基準の目標量18gと理想値25gの2段構え。
 * 企画メモ 第2章）。この一致が式の妥当性の根拠なので、係数を変えるときはそこを崩さないこと。
 * 0.5g単位に丸めるのは、閾値が 5.72g のような読めない数字になるのを避けるため。
 */
export function stageThresholds(targetTotal: number): {
  up: Record<Exclude<Stage, 1>, number>;
  down: Record<Exclude<Stage, 1>, number>;
} {
  const half = (v: number) => Math.round(v * 2) / 2;
  const up = {
    2: half(targetTotal * 0.22),
    3: half(targetTotal * 0.5),
    4: half(targetTotal),
    5: Math.min(half(targetTotal + 7), STAGE_CEILING_G),
  } as Record<Exclude<Stage, 1>, number>;
  const down = {
    2: up[2] - STAGE_HYSTERESIS_G,
    3: up[3] - STAGE_HYSTERESIS_G,
    4: up[4] - STAGE_HYSTERESIS_G,
    5: up[5] - STAGE_HYSTERESIS_G,
  } as Record<Exclude<Stage, 1>, number>;
  return { up, down };
}

/**
 * ヒステリシス付きの段階解決。前回の段階を必ず渡す（履歴依存＝これが本体）。
 *
 * 目標付近を行き来しても段階が毎日変わらない。かつ下がる側の閾値を低くしてあるので
 * 降格しにくい方向に偏る（罰を弱くするための非対称設計）。
 *
 * @param targetTotal 1日の目標総量。段階の閾値はここから作る
 */
export function resolveStage(score: number, prev: Stage = 1, targetTotal = 18): Stage {
  const { up: STAGE_UP, down: STAGE_DOWN } = stageThresholds(targetTotal);
  let stage: Stage = prev;
  while (stage < 5 && score >= STAGE_UP[(stage + 1) as Exclude<Stage, 1>]) {
    stage = (stage + 1) as Stage;
  }
  while (stage > 1 && score < STAGE_DOWN[stage as Exclude<Stage, 1>]) {
    stage = (stage - 1) as Stage;
  }
  return stage;
}

/**
 * 空白が続いたときに段階の上限を1つ下げる間隔（日）。
 * 7日にしたのは、上げる側も7日平均が動かないと上がらないため（上下の速さを揃える）。
 */
export const STAGE_IDLE_STEP_DAYS = 7;

/**
 * 記録が無いまま idleDays 日たったときの**段階の上限**。
 *
 * 記録が無い日は「食物繊維をとっていない」と見なして落とす。ただし**一気には落とさない**。
 * 7日の窓が空になった瞬間に平均0gで評価すると段階4から段階1まで一足で落ちるので
 * （2026-09-29 に実測して見つけた崖）、1週ごとに1段だけ下げる。
 * 空白4週間で段階1（眠っている）に着く。
 *
 * **「前回の段階 − N段」ではなく上限にしてある**のが要点。段階は保存される値なので
 * （`UiState.stage`）、毎回 prev から引くと「引いた結果」からまた引いて二重に落ちる
 * （prev4 → 8日目に3 → 15日目に1）。`min(prev, 上限)` は何度当てても同じ値になる。
 *
 * 副作用として、もともと低い段階の人は落ちるのが遅い（段階2の人は22日目まで段階2のまま）。
 * これは意図どおり。積み上げが少ない人から先に取り上げない。
 */
export function idleStageCeiling(idleDays: number): Stage {
  const steps = Math.floor((idleDays - 1) / STAGE_IDLE_STEP_DAYS);
  return Math.max(1, Math.min(5, 5 - steps)) as Stage;
}

/**
 * 今日より前で最後に記録した日から何日空いたか。**今日は数に入れない。**
 * 今日より前に記録が1件も無ければ null（初日の人と、診断だけで終えた人）。
 *
 * `daysSinceLastLog`（復帰トリガー用）と分けてあるのは、あちらが今日の記録も見るため。
 * 段階の判定では「今日をどれだけ記録しても、過去の空白は埋まらない」を保ちたい。
 */
export function idleDaysBefore(logs: Logs, todayKey: string): number | null {
  const last = Object.keys(logs)
    .filter((k) => k < todayKey && logs[k].length)
    .sort()
    .pop();
  return last ? daysBetween(last, todayKey) : null;
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
  /** 今日より前で最後に記録した日からの空白（日）。記録が無ければ null */
  idleDays: number | null;
  /** 段階が空白の長さで抑えられている（7日の窓に記録が1日も無い）か */
  fading: boolean;
  /** 診断の推定値ではなく実測を使ってよいか（記録3日以上） */
  useMeasured: boolean;
  /** 段階が診断の推定値で動いている（暫定表示）か */
  provisional: boolean;
};

/**
 * @param estimate 初回診断の推定総量。記録3日未満のあいだ、段階の駆動にこれを使う
 *   （記録0日でキャラが必ず段階1から始まると、診断に答えた意味が画面に出ない・DESIGN §1-3）
 * @param targetTotal 1日の目標総量。段階の閾値がこれに連動する
 */
export function computeGutState(
  logs: Logs,
  todayKey: string,
  servings: Serving[],
  prevStage: Stage = 1,
  estimate: number | null = null,
  targetTotal = 18
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

  /**
   * 7日の窓に記録が1日も無い（＝空白8日以上）ときは、**平均を段階の根拠にしない。**
   * 平均は 0g になるので、そのまま resolveStage に渡すと段階1まで落ちる（崖）。
   * 代わりに空白の長さで上限を下げる（`idleStageCeiling`）。
   *
   * 窓に1日でも記録があれば空白は7日以下で、上限は5＝従来どおり平均だけで決まる。
   * 久しぶりに記録した当日も上限側で決める（今日の1品だけで7日平均を作らない）。
   * 翌日には今日が窓に入るので、実測の平均に自然に戻る。
   */
  const idleDays = idleDaysBefore(logs, todayKey);
  const fading = idleDays !== null && idleDays > STAGE_IDLE_STEP_DAYS;
  const stage = fading
    ? (Math.min(prevStage, idleStageCeiling(idleDays)) as Stage)
    : resolveStage(score.score, prevStage, targetTotal);

  return {
    today: dayTotals(logs, todayKey, byLabel),
    stage,
    stageScore: score.score,
    stageLoggedDays: score.loggedDays,
    flora,
    floraDots: floraDots(flora),
    weekLogDays: weekLogDays(logs, todayKey),
    totalLoggedDays: logged,
    idleDays,
    fading,
    useMeasured,
    /** 段階が診断の推定値で暫定表示されているか（画面に「まだ見極め中」と出す） */
    provisional: !useMeasured && estimate !== null,
  };
}
