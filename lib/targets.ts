/**
 * 2軸（菌のごはん＝水溶性 / おそうじ＝不溶性）の目標と、偏りの判定。
 *
 * 理想比は **水溶性1 : 不溶性2**（＝水溶性が総量の1/3）。日本人の実際は1:4なので、
 * 意識して選ばないと届かない比率になっている（data/README.md・企画メモ）。
 *
 * ここを total から計算するようにした理由: 6g/12g を固定していたとき、目標総量を25gに
 * 上げた時点で「2軸の合計18g」と総量25gの間に7gの空白ができ、1:2が総量とつながらなくなった。
 */
import type { Targets, Totals } from './types';

/** 理想の水溶性の割合（1:2 → 1/3） */
export const SOLUBLE_SHARE_IDEAL = 1 / 3;

/**
 * 「偏っている」と判定する下限。これを割ったら（＝1:3より悪い）量が足りていても指摘する。
 * 理想0.33に対して余裕を持たせているのは、プリセットの水溶性比率の中位が0.20で、
 * 0.33を常時要求すると毎日「偏っている」と言うだけのアプリになるため。
 */
export const SOLUBLE_SHARE_MIN = 0.25;

/**
 * 水溶性の目標の上限(g)。
 * 総量30gに1/3を当てると10gになるが、プリセットで水溶性10gを毎日狙うのは現実的でない
 * （水溶性の割合が0.33以上ある品目は171件中37件）。8gは「もち麦・パスタ中心の日」の実測
 * 12.1g、達成6タップの日の6.44g から、狙えば届く範囲として置いている。
 */
export const SOLUBLE_CAP_G = 8;

/**
 * 総量の目標から2軸の目標を出す。**合計は必ず総量に一致する。**
 * 目標18gを入れると 6g / 12g（＝従来の固定値・食事摂取基準からの配分）に一致する。
 */
export function axisTargets(total: number): { soluble: number; insoluble: number } {
  const raw = total * SOLUBLE_SHARE_IDEAL;
  // 0.5g刻みに丸める（8.33g のような読めない目標を出さない）
  const soluble = Math.min(Math.round(raw * 2) / 2, SOLUBLE_CAP_G);
  return { soluble, insoluble: Math.round((total - soluble) * 100) / 100 };
}

/** その日の水溶性の割合。総量0のときは0 */
export function solubleShare(t: Totals): number {
  return t.total > 0 ? t.soluble / t.total : 0;
}

/**
 * 2軸のバランス評価（DESIGN §4）。達成日にも次の一手を残すための判定。
 *
 * **量だけでなく割合も見る。** 各軸の絶対量を満たしていても水溶性の割合が
 * `SOLUBLE_SHARE_MIN` を割っていれば「菌のごはんが少なめ」として扱う
 * （これが無いと 1:3.2 の日に「きれいに整っています」と言ってしまう）。
 */
export type Balance = 'both' | 'soluble-low' | 'insoluble-low' | 'none';

export function balanceOf(t: Totals, targets: { soluble: number; insoluble: number }): Balance {
  const shareOk = t.total <= 0 || solubleShare(t) >= SOLUBLE_SHARE_MIN;
  const sol = t.soluble >= targets.soluble && shareOk;
  const insol = t.insoluble >= targets.insoluble;
  if (sol && insol) return 'both';
  if (!sol && insol) return 'soluble-low';
  if (sol && !insol) return 'insoluble-low';
  return 'none';
}

/** 目標一式を組み立てる。総量だけ決めれば2軸は1:2で決まる */
export function targetsOf(total: number): Targets {
  const { soluble, insoluble } = axisTargets(total);
  return { total, soluble, insoluble };
}
