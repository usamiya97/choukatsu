/**
 * バンドル済みデータへの入口。
 * ここだけが data/generated/*.json を知っている（ロジック層は引数で受け取る）。
 *
 * 生成は `npm run build:data`。CSVは直接読まない（実行時パース失敗を避ける）。
 */
import servingsJson from '../data/generated/servings.json';
import swapsJson from '../data/generated/swaps.json';
import cautionsJson from '../data/generated/cautions.json';
import coachJson from '../data/generated/coach.json';
import targetsJson from '../data/targets.json';
import diagnosisJson from '../data/diagnosis.json';
import { targetsOf } from './targets';
import type { Caution, CoachItem, Food, Serving, Swap, Targets } from './types';

export const SERVINGS = servingsJson as unknown as Serving[];
export const SWAPS = swapsJson as unknown as Swap[];
export const CAUTIONS = cautionsJson as unknown as Caution[];
export const COACH = coachJson as unknown as CoachItem[];

/**
 * 目標値。総量はユーザーが選べる（既定25g）。
 * 2軸は総量から理想比1:2で出す（水溶性は上限8g・lib/targets.ts axisTargets）。
 */
export const DEFAULT_TARGET_TOTAL = targetsJson.app_target.default_total_g;

export const TARGET_OPTIONS: { total: number; label: string }[] = targetsJson.app_target.options_g.map(
  (total) => ({
    total,
    label: (targetsJson.app_target.labels as Record<string, string>)[String(total)] ?? `${total}g`,
  })
);

export function targetsFor(total: number | null | undefined): Targets {
  return targetsOf(total ?? DEFAULT_TARGET_TOTAL);
}

/** 既定の目標。目標を変えられない画面（テスト・スクリプト）はこれを使う */
export const TARGETS: Targets = targetsFor(DEFAULT_TARGET_TOTAL);

/** 公的な目標量。設定画面で「18gは女性の目標量」と説明するために持っておく */
export const GUIDELINE_TOTAL = targetsJson.daily_targets.total_g;

export const DIAGNOSIS = diagnosisJson as DiagnosisFile;

export type DiagnosisOption = {
  label: string;
  est_total_g?: number;
  est_sol?: number;
  hint?: string;
  note?: string;
  profile?: string;
  excludes?: string[];
};
export type DiagnosisQuestion = {
  id: string;
  q: string;
  axis: string;
  note?: string;
  multi?: boolean;
  options: DiagnosisOption[];
};
export type DiagnosisType = { name: string; cond: string; first_suggestion: string; share_copy: string; note?: string };
export type DiagnosisFile = {
  purpose: string;
  scoring: string;
  questions: DiagnosisQuestion[];
  types: DiagnosisType[];
  rules: string[];
};

/** カテゴリの並び。tier A が多い＝1タップの価値が高い順に置く（DESIGN §7） */
export const CATEGORY_ORDER = [
  '主食',
  '豆類',
  '野菜',
  'きのこ',
  '海藻',
  'いも',
  '果物',
  '種実',
  '惣菜',
  '菓子',
  'その他',
] as const;

export function categories(): string[] {
  const present = new Set(SERVINGS.map((s) => s.category));
  const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
  const rest = [...present].filter((c) => !ordered.includes(c as (typeof CATEGORY_ORDER)[number]));
  return [...ordered, ...rest];
}

export function servingsOf(category: string): Serving[] {
  return SERVINGS.filter((s) => s.category === category).sort(byTierThenAmount);
}

/** tier A → 量の多い順。プリセットの上位に「1タップで効くもの」を出すため */
export function byTierThenAmount(a: Serving, b: Serving): number {
  const rank = { A: 0, B: 1, C: 2, Z: 3 } as const;
  if (rank[a.tier] !== rank[b.tier]) return rank[a.tier] - rank[b.tier];
  return b.total - a.total;
}

export function findServing(label: string): Serving | undefined {
  return SERVINGS.find((s) => s.label === label);
}

export function findServingByCode(code: string): Serving | undefined {
  return SERVINGS.find((s) => s.code === code);
}

/**
 * 表示名・別名から label を引く（1つの表示名に複数のlabelが対応することがある）。
 * 診断 q10 の除外（表示名で書かれている）を label に展開するのに使う。
 */
export function labelsForName(name: string): string[] {
  const q = normalize(name);
  const hits = SERVINGS.filter(
    (s) =>
      normalize(s.label) === q ||
      normalize(s.displayName) === q ||
      s.aliases.some((a) => normalize(a) === q)
  );
  return hits.length ? hits.map((s) => s.label) : [name];
}

/** プリセットの検索。aliases も見る（ローカル辞書と同じキー） */
export function searchServings(query: string, limit = 30): Serving[] {
  const q = normalize(query);
  if (!q) return [];
  const scored: { s: Serving; score: number }[] = [];
  for (const s of SERVINGS) {
    const keys = [s.displayName, s.label, ...s.aliases].map(normalize);
    let score = -1;
    for (const k of keys) {
      if (k === q) score = Math.max(score, 3);
      else if (k.startsWith(q)) score = Math.max(score, 2);
      else if (k.includes(q)) score = Math.max(score, 1);
    }
    if (score >= 0) scored.push({ s, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || byTierThenAmount(a.s, b.s))
    .slice(0, limit)
    .map((x) => x.s);
}

/**
 * 成分表フル（2,393件）の検索。プリセットに無いものを引くときだけ使う。
 * 326KB あるので必要になった時点で初めて読み込む（起動時間に乗せない）。
 */
let foodsCache: Food[] | null = null;
export function allFoods(): Food[] {
  if (!foodsCache) foodsCache = require('../data/generated/foods.json') as Food[];
  return foodsCache;
}

export function searchFoods(query: string, limit = 30): Food[] {
  const q = normalize(query);
  if (!q) return [];
  return allFoods()
    .filter((f) => normalize(f.name).includes(q))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/** ひらがな/カタカナと全角半角の揺れを吸収する。「ゴボウ」でも「ごぼう」に当てる */
export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/\s+/g, '');
}

export const DISPLAY_RULES = targetsJson.display_rules;
