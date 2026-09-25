/** data/generated/*.json の型。build-data.mjs の出力と対応する */

export type Tier = 'A' | 'B' | 'C' | 'Z';

export type Serving = {
  label: string;
  category: string;
  displayName: string;
  aliases: string[];
  unitLabel: string;
  servingG: number;
  code: string;
  officialName: string;
  fiberPer100g: number;
  /** 1回あたりの食物繊維総量(g) */
  total: number;
  /** 総量 × soluble_ratio。UIでは「菌のごはん」 */
  soluble: number;
  /** 総量 − soluble。UIでは「おそうじ」 */
  insoluble: number;
  solubleRatio: number;
  breakdownSource: string;
  /** 分析法。異なる method 同士で置き換え提案を出さない */
  method: string;
  tier: Tier;
};

export type Swap = {
  before: string;
  beforeDisplay: string;
  beforeUnit: string;
  after: string;
  afterDisplay: string;
  afterUnit: string;
  deltaTotal: number;
  deltaSoluble: number;
  /** 両方 / 水溶性 / 総量 / 推奨しない */
  purpose: string;
};

export type Caution = {
  label: string;
  code: string;
  /** 総量 / 水溶性 — この軸を狙うときは提案に使わない */
  axis: string;
  commonBelief: string;
  dataSays: string;
  reason: string;
  coachRule: string;
};

export type CoachItem = {
  id: string;
  trigger: CoachTrigger;
  priority: number;
  message: string;
  reason: string;
  deltaTotal: number | null;
  deltaSoluble: number | null;
  kind: string;
  targetFood: string | null;
  source: string;
};

export type CoachTrigger =
  | '総量不足'
  | '水溶性不足'
  | '不溶性不足'
  | '達成・水溶性不足'
  | '達成・不溶性不足'
  | '達成・バランス良好'
  | '記録3日未満'
  | '連続未達3日'
  | '記録が途切れた後';

/** 成分表フル（2,393件・総量が測定済みのもの） */
export type Food = {
  code: string;
  name: string;
  total: number;
  soluble: number | null;
  insoluble: number | null;
  method: string;
};

/** 記録1件。label は servings.json の label（表示名ではなく内部キー） */
export type LogEntry = {
  label: string;
  /** 常用量いくつ分か。0.5 も許す */
  count: number;
  /** ISO文字列。並び順と「さっき消す」用 */
  at: string;
};

/** 日付キー(YYYY-MM-DD) → その日の記録 */
export type Logs = Record<string, LogEntry[]>;

export type Totals = {
  total: number;
  soluble: number;
  insoluble: number;
};

export type Targets = {
  total: number;
  soluble: number;
  insoluble: number;
};

export type Stage = 1 | 2 | 3 | 4 | 5;
