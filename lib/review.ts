/**
 * 週の振り返り（DESIGN.md §16）。
 *
 * **「入れたもの」と「出たもの」を同じ行に並べる**のがこの層の目的。
 * 記録は最初から日付ごとに全部残っていたが、見る画面が無かった（今日しか見えなかった）。
 *
 * 窓は**直近7日のローリング**。キャラを動かしている7日平均（lib/state.ts stageScore）と
 * 同じ定義にしてあるので、この画面の数字とキャラの見た目がずれない。
 * 曜日固定の週（月〜日）を採らなかったのは、週の途中に開くと未完成の週を見ることになり、
 * さらに曜日の開始設定という別の判断を持ち込むため。
 *
 * この層に副作用を置かない（共有のテキストも文字列を返すだけ。送るのは画面側）。
 */
import { AXIS, ATTRIBUTION } from './format';
import { dayTotals, indexServings, lastNDays, shiftDays } from './state';
import { stoolFormName, stoolRecordWord, stoolWeek, type StoolWeek } from './stool';
import type { Logs, Serving, StoolLog, StoolRecord, Targets, Totals } from './types';

/** 曜日。日付キーから出す（端末のロケールに依存させない） */
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export function weekdayOf(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

/** 「9/29(月)」。年は出さない（7日ぶんしか並べないので邪魔になる） */
export function shortDate(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}(${weekdayOf(key)})`;
}

export type DayRow = {
  key: string;
  /** 食物繊維の記録があるか。**無い日を0gとして扱わない**ための旗 */
  logged: boolean;
  totals: Totals;
  /** 目標総量に届いたか */
  reached: boolean;
  /** その日のお通じ。未記録は null（0回とは別物） */
  stool: StoolRecord | null;
};

export type WeekReview = {
  /** 窓の端（from が古い側） */
  from: string;
  to: string;
  /** **新しい順**（今日が先頭）。スクロールせずに直近が見えるようにする */
  days: DayRow[];
  /** 食物繊維を記録した日数(0..7) */
  logDays: number;
  /** 記録した日だけの平均(g)。未記録日を0として割らない（DESIGN §1-2） */
  avgTotal: number;
  avgSoluble: number;
  avgInsoluble: number;
  sumTotal: number;
  /** 目標に届いた日数 */
  reachedDays: number;
  /** お通じの集計（lib/stool.ts と同じ数え方を共有する） */
  stool: StoolWeek;
};

/**
 * 窓の長さ。7日固定。
 * キャラの7日平均と同じ窓であることが前提なので、ここだけ変えないこと。
 */
export const REVIEW_DAYS = 7;

/**
 * @param endKey 窓の新しい側の日付（ふつうは今日）
 */
export function weekReview(
  logs: Logs,
  stoolLog: StoolLog,
  servings: Serving[],
  endKey: string,
  targets: Targets
): WeekReview {
  const byLabel = indexServings(servings);
  const keys = lastNDays(endKey, REVIEW_DAYS); // 新しい順
  const days: DayRow[] = keys.map((key) => {
    const logged = Boolean(logs[key]?.length);
    const totals = dayTotals(logs, key, byLabel);
    return {
      key,
      logged,
      totals,
      reached: logged && totals.total >= targets.total,
      stool: stoolLog[key] ?? null,
    };
  });

  const loggedDays = days.filter((d) => d.logged);
  const sum = loggedDays.reduce(
    (a, d) => ({
      total: a.total + d.totals.total,
      soluble: a.soluble + d.totals.soluble,
      insoluble: a.insoluble + d.totals.insoluble,
    }),
    { total: 0, soluble: 0, insoluble: 0 }
  );
  const n = loggedDays.length;

  return {
    from: keys[keys.length - 1],
    to: keys[0],
    days,
    logDays: n,
    avgTotal: n ? sum.total / n : 0,
    avgSoluble: n ? sum.soluble / n : 0,
    avgInsoluble: n ? sum.insoluble / n : 0,
    sumTotal: sum.total,
    reachedDays: days.filter((d) => d.reached).length,
    stool: stoolWeek(stoolLog, endKey),
  };
}

/** その窓の1つ前の7日。比較の相手 */
export function previousWeekKey(endKey: string): string {
  return shiftDays(endKey, -REVIEW_DAYS);
}

export type WeekDiff = {
  /** 平均総量の差(g)。前の7日に記録が無ければ null */
  avgTotal: number | null;
  reachedDays: number | null;
  logDays: number | null;
  /** お通じののべ回数の差。どちらかの週に記録が無ければ null */
  stoolCount: number | null;
};

/**
 * 前の7日との差。**因果は出さない**（「増えたから良くなった」と言わない・DESIGN §16-2）。
 * 比べる材料が無い週は null にして、画面では黙る。
 */
export function compareWeeks(now: WeekReview, prev: WeekReview): WeekDiff {
  const comparable = prev.logDays > 0 && now.logDays > 0;
  return {
    avgTotal: comparable ? now.avgTotal - prev.avgTotal : null,
    reachedDays: comparable ? now.reachedDays - prev.reachedDays : null,
    logDays: prev.logDays > 0 ? now.logDays - prev.logDays : null,
    stoolCount: prev.stool.days > 0 && now.stool.days > 0 ? now.stool.count - prev.stool.count : null,
  };
}

/** 「+4g」「−2日」「±0」。符号を必ず出す（増減の向きが読めないと比較にならない） */
export function signed(value: number, unit: string): string {
  const v = Math.round(value);
  if (v === 0) return `±0${unit}`;
  return v > 0 ? `+${v}${unit}` : `−${Math.abs(v)}${unit}`;
}

/** その日の内訳。「菌のごはん8 / おそうじ16」。軸の名前は AXIS 経由（画面にも直書きしない） */
export function axisLine(t: Totals): string {
  return `${AXIS.soluble.name}${Math.round(t.soluble)} / ${AXIS.insoluble.name}${Math.round(t.insoluble)}`;
}

/** 1行分の言語化。「9/29(火) 24g（菌のごはん8 / おそうじ16）○ ／ 1回・普通便」 */
export function dayLine(d: DayRow): string {
  const fiber = d.logged
    ? `${Math.round(d.totals.total)}g（${axisLine(d.totals)}）${d.reached ? '○' : ''}`
    : '記録なし';
  return `${shortDate(d.key)} ${fiber} ／ ${d.stool ? stoolRecordWord(d.stool) : 'お通じの記録なし'}`;
}

/**
 * 共有用のプレーンテキスト（OSの共有シートに渡す）。
 *
 * **数字が端末の外に出る唯一の経路**なので、出典を必ず末尾に付ける（DESIGN §6-3・タスク23）。
 * 小数点は出さない。因果も書かない。
 */
export function reviewText(now: WeekReview, prev: WeekReview, targets: Targets): string {
  const head = `${shortDate(now.from)}〜${shortDate(now.to)} のふりかえり`;
  const summary = [
    `記録 ${now.logDays}日 / 記録した日の平均 ${Math.round(now.avgTotal)}g`,
    `目標${targets.total}gに届いた日 ${now.reachedDays}日`,
  ].join(' / ');
  const stoolLine =
    now.stool.days > 0
      ? `お通じ 記録${now.stool.days}日・のべ${now.stool.count}回` +
        (now.stool.form ? `・多かった形 ${stoolFormName(now.stool.form)}` : '')
      : 'お通じ 記録なし';

  const diff = compareWeeks(now, prev);
  const diffLine =
    diff.avgTotal === null
      ? '前の7日は記録がないので、くらべていません'
      : `前の7日とくらべて 平均 ${signed(diff.avgTotal, 'g')} / 届いた日 ${signed(
          diff.reachedDays ?? 0,
          '日'
        )}` + (diff.stoolCount === null ? '' : ` / お通じ ${signed(diff.stoolCount, '回')}`);

  return [head, summary, stoolLine, '', ...now.days.map(dayLine), '', diffLine, '', ATTRIBUTION].join(
    '\n'
  );
}
