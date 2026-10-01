/**
 * servings.csv の「計算で決まる列」を導出する唯一の場所。
 *
 * 人が決めるのは category / label / display_name / aliases / unit_label / serving_g / code の7列だけ。
 * 残り（公式名・100g値・1回あたり・2軸・出どころ・分析法・tier）はここが成分表から作る。
 *
 * **生成（expand-servings.mjs）とビルド検証（build-data.mjs）で同じ式を共有する。**
 * 2か所に書くと必ず片方が古くなる（禁止語リストを lib/safety.ts に集めたのと同じ理由）。
 */

export const num = (v) => (v === '' || v == null ? null : Number(v));
export const r2 = (v) => Math.round(v * 100) / 100;

/** 成分表の丸めがあるので、総量の一致は 0.05g まで許す */
const near = (a, b) => a !== null && b !== null && Math.abs(a - b) <= 0.05;

const ratioOf = (sol, insol) =>
  sol === null || insol === null || sol + insol <= 0 ? null : sol / (sol + insol);

/**
 * 水溶性の比率。
 *
 * **総量を取った分析法と同じ法の内訳を使う。** ここを取り違えると
 * 「総量はAOAC・比率はプロスキー」という混ざった数字になり、水溶性が系統的に低く出る。
 * 実際に 2026-09-30 まで23品目がそうなっていて（主食がまとめて該当していた）、
 * 白米中心の日の水溶性が 0.94g と出ていた（正しくは 4.72g）。成分表は**同じ食品でも
 * 法によって値が違う**ので、合計と内訳は必ず同じ列から作る。
 *
 * 同じ法の内訳が欠けているときは、もう一方の法から**比率だけ借りる**（総量は動かさない）。
 * これは実測ではないので `推定` と記録して、後から再検証できるようにする。
 * どちらも無ければ 0。藻類は内訳実測が水溶0%（アルギン酸がカルシウム塩として
 * 不溶性に分類される・data/README.md）なので、0 を当てる根拠がある。
 */
export function breakdown(food) {
  const per100 = num(food.fiber_total);
  const prosky = ratioOf(num(food.soluble_prosky), num(food.insoluble_prosky));
  const low = num(food.sol_low_aoac);
  const high = num(food.sol_high_aoac);
  // 低分子量・高分子量のどちらも未測定なら「水溶性0」ではなく「不明」として扱う
  const aoacSol = low === null && high === null ? null : (low ?? 0) + (high ?? 0);
  const aoac = ratioOf(aoacSol, num(food.insol_aoac));

  const fromAoac = near(per100, num(food.total_aoac));
  const fromProsky = near(per100, num(food.total_prosky));

  if (fromAoac && aoac !== null) return { ratio: aoac, source: 'aoac実測' };
  if (fromProsky && prosky !== null) return { ratio: prosky, source: 'prosky実測' };
  if (fromAoac && prosky !== null) return { ratio: prosky, source: '推定(プロスキー内訳の比率を借用)' };
  if (fromProsky && aoac !== null) return { ratio: aoac, source: '推定(AOAC内訳の比率を借用)' };
  return { ratio: 0, source: '推定(同群実測0%)' };
}

/** tier（1タップの価値）。総量から機械的に決める */
export function tierOf(total) {
  if (total <= 0) return 'Z';
  if (total >= 3) return 'A';
  if (total >= 1) return 'B';
  return 'C';
}

/**
 * 1品目の導出結果。`grams` は自前定義の常用量（TODO 21 のレビュー対象）。
 * 総量が未測定の食品は null を返す（プリセットに入れない）。
 */
export function deriveServing(food, grams) {
  const per100 = num(food.fiber_total);
  if (per100 === null) return null;
  const total = r2((per100 * grams) / 100);
  // 繊維0gの食品（肉・魚・卵・乳）は内訳を問う意味がない。推定と混ぜず、そう書く
  const { ratio, source } = per100 === 0 ? { ratio: 0, source: '該当なし(繊維0g)' } : breakdown(food);
  const soluble = r2(total * ratio);
  return {
    officialName: food.name,
    per100: per100.toFixed(1),
    total,
    ratio: r2(ratio),
    soluble,
    // 2軸の合計は必ず総量に一致させる（差は不溶性側で吸収する・data/README.md）
    insoluble: r2(total - soluble),
    source,
    method: food.method,
    tier: tierOf(total),
  };
}

/** servings.csv の列の並び。人が決める列と導出列の境目をここで固定する */
export const SERVING_COLUMNS = [
  'category',
  'label',
  'display_name',
  'aliases',
  'unit_label',
  'serving_g',
  'code',
  /* ここから下は deriveServing が作る */
  'official_name',
  'fiber_per_100g',
  'fiber_per_serving',
  'soluble_ratio',
  'soluble_per_serving',
  'insoluble_per_serving',
  'breakdown_source',
  'method',
  'tier',
];

/** 導出列を CSV の並びに詰める */
export function derivedCells(d) {
  return [d.officialName, d.per100, d.total, d.ratio, d.soluble, d.insoluble, d.source, d.method, d.tier];
}
