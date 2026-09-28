/**
 * 表示の言語化（DESIGN.md §5・§6）。
 *
 * ここを通さずに数値を画面へ出さないこと。小数点を出さないのは
 * AI推定の誤差が「嘘」に見えないようにするためで、内部は小数のまま持つ。
 */
import type { Caution, Serving, Totals } from './types';

/**
 * UIに出す軸の語彙。**ここが唯一の定義**（画面に軸の名前を直接書かない）。
 *
 * ニックネームを主役にし、専門語は括弧で添える（DESIGN §5-2 を 2026-09-26 に緩めた）。
 * ニックネームだけだと「おそうじ＝何を掃除するのか」が伝わらず、
 * 専門語だけだと「情報が多すぎる(30%)」を自分で再生産する。だから両方を1行に収める。
 *
 * `look` はキャラのどこに効くか。2軸を覚えるための唯一の手がかりなので必ず添える
 * （見た目と結びつかない数字は覚えられない）。
 */
export const AXIS = {
  total: {
    name: '食物繊維',
    term: null,
    note: null,
    look: null,
  },
  soluble: {
    name: '菌のごはん',
    term: '水溶性',
    note: '水にとけて、腸の菌のエサになる繊維',
    look: 'キャラの色つやと、まわりの菌になります',
  },
  insoluble: {
    name: 'おそうじ',
    term: '不溶性',
    note: '水にとけず、水を含んでかさを増やす繊維',
    look: 'キャラのふくらみになります',
  },
} as const;

export type Axis = keyof typeof AXIS;

/**
 * 「菌のごはん（水溶性）」。軸の名前を画面に出すときは必ずこれを通す。
 * 同じ画面で2度目に出すときだけ `withTerm: false`（括弧が続くと読みにくい）。
 */
export function axisName(axis: Axis, withTerm = true): string {
  const a = AXIS[axis];
  return withTerm && a.term ? `${a.name}（${a.term}）` : a.name;
}

/**
 * 軸ごとの残り。「あと 3g」/「届きました」。
 * 総量と同じく小数点は出さない。切り上げるのは「あと0g」と言わないため
 */
export function axisRemainWord(value: number, target: number): string {
  if (value >= target) return '届きました';
  return `あと ${Math.max(1, Math.ceil(target - value))}g`;
}

export type Evidence = 'あなたのデータ' | '成分表より' | '一般に言われる';

/**
 * 「18g目標の8割くらい」。割合は1割刻みに丸める。
 * 10割以上は数字を出さず「達成」と言う（上限で止めず、超過を責めない）。
 */
export function progressWord(total: number, target: number): string {
  if (total >= target) return '今日は目標に届きました';
  const tenths = Math.floor((total / target) * 10);
  if (tenths <= 0) return `今日はまだ始まったところ`;
  return `今日は ${target}g目標の ${tenths}割くらい`;
}

/** 達成の度合い。メーターの塗り幅に使う（1.0で満タン。超過は1.0で止める） */
export function fillRatio(total: number, target: number): number {
  return Math.max(0, Math.min(1, total / target));
}

export type Hint = {
  serving: Serving;
  /** 「あと 納豆 1パック分」 / 「まずは もち麦ごはん 1杯 から」 */
  text: string;
  /**
   * close = これ1品で目標に届く距離にいる
   * start = まだ遠い。1品では届かないので「あと○○分」と言うと嘘になる
   */
  mode: 'close' | 'start';
};

/**
 * 残りgに最も近い1品を選ぶ（DESIGN §6-2）。
 * 0g食品(tier Z)と、禁止リスト・ユーザーの苦手を除外する。
 * 「あと3.7g」ではなく「あと納豆1パック分」と言うための関数。
 */
export function remainHint(
  remaining: number,
  servings: Serving[],
  opts: { cautions?: Caution[]; excluded?: string[]; axis?: 'total' | 'soluble' | 'insoluble' } = {}
): Hint | null {
  if (remaining <= 0) return null;
  const axis = opts.axis ?? 'total';
  const banned = bannedLabels(opts.cautions ?? [], axis);
  const excluded = new Set(opts.excluded ?? []);
  const candidates = servings.filter(
    (s) => s.tier !== 'Z' && s[axis] > 0 && !banned.has(s.label) && !excluded.has(s.label)
  );
  if (!candidates.length) return null;
  const best = candidates.reduce((a, b) =>
    Math.abs(a[axis] - remaining) <= Math.abs(b[axis] - remaining) ? a : b
  );
  // 残りが1品で埋まらないほど大きいときに「あと○○分」と書くと、それだけで届くように読めてしまう。
  // 距離が遠いときは同じ1品を「最初の一手」として出す（次の行動は残すが、嘘はつかない）。
  const close = remaining <= best[axis] * 1.35;
  return close
    ? { serving: best, text: `あと ${best.displayName} ${best.unitLabel}分`, mode: 'close' }
    : { serving: best, text: `まずは ${best.displayName} ${best.unitLabel} から`, mode: 'start' };
}

/**
 * その軸を狙うときに提案に使ってはいけない食品。
 * 軸ごとに持つ理由: キウイは「菌のごはん狙い」では推さないが総量目的なら可（cautions.csv）。
 */
export function bannedLabels(cautions: Caution[], axis: 'total' | 'soluble' | 'insoluble'): Set<string> {
  const axisName = axis === 'total' ? '総量' : axis === 'soluble' ? '水溶性' : '不溶性';
  return new Set(cautions.filter((c) => c.axis === axisName).map((c) => c.label));
}

/** 「もち麦ごはん 1杯」。内部ラベル（(ゆで)等）ではなく display_name を使う */
export function servingLabel(s: Serving, count = 1): string {
  const unit = count === 1 ? s.unitLabel : `${s.unitLabel} × ${formatCount(count)}`;
  return `${s.displayName} ${unit}`;
}

export function formatCount(count: number): string {
  // 0.5 は「0.5」、1 は「1」。末尾の .0 を出さない
  return Number.isInteger(count) ? String(count) : count.toFixed(1);
}

/** 量の選択の刻み。1食を半分か倍で数える人が多いので 0.5 刻みにする */
export const COUNT_STEP = 0.5;
export const COUNT_MIN = 0.5;
export const COUNT_MAX = 10;

/** ＋／− を押したときの次の値。範囲外に出さない */
export function stepCount(current: number, delta: number): number {
  const next = Math.round((current + delta * COUNT_STEP) / COUNT_STEP) * COUNT_STEP;
  return Math.min(COUNT_MAX, Math.max(COUNT_MIN, Number(next.toFixed(1))));
}

/** その量のグラム数（表示用）。内部では常用量×個数で計算している */
export function gramsOf(s: Serving, count: number): number {
  return Math.round(s.servingG * count);
}

/** その量の食物繊維(g)。小数第1位まで出すのはこの画面だけ（量を決める根拠として必要） */
export function fiberOf(s: Serving, count: number): number {
  return s.total * count;
}

/** 2軸の目標とバランス判定は lib/targets.ts にある（比率の意味を1か所に集めるため） */

/** v2の見た目の変調パラメータ。GutCharacter に渡す */
export function modulation(t: Totals, targets: { soluble: number; insoluble: number }) {
  const clamp = (v: number) => Math.max(0, Math.min(1.2, v));
  return {
    satRatio: clamp(t.soluble / targets.soluble),
    bulkRatio: clamp(t.insoluble / targets.insoluble),
  };
}

/** 設定画面・食品詳細に必ず出す出典（成分表の利用条件） */
export const ATTRIBUTION = '日本食品標準成分表（八訂）増補2023年から引用';
