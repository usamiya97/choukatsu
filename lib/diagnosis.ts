/**
 * 初回診断（data/diagnosis.json 10問）の採点。
 *
 * 目的は「記録0日の初日に第1提案を出すこと」だけ。
 * 医療的な判断はしない（q8は提案の分岐にのみ使う）。
 * 記録が3日たまったらこの推定値は破棄して実測に切り替える（DESIGN §1-3）。
 */
import type { DiagnosisFile, DiagnosisQuestion } from './dataset';

/** 質問id → 選んだ選択肢のindex（multiは配列） */
export type Answers = Record<string, number | number[]>;

export type DiagnosisResult = {
  /** 推定の1日総量(g) */
  estTotal: number;
  /** 推定の水溶性比率 */
  estSolubleRatio: number;
  /** 結果として見せるタイプ名 */
  typeName: string;
  shareCopy: string;
  /** q8。提案の分岐にのみ使う */
  stoolProfile: string | null;
  /** q9 */
  concerns: string[];
  /** q10。提案から永続的に外す食品ラベル */
  excludedFoods: string[];
};

const selected = (q: DiagnosisQuestion, answers: Answers): number[] => {
  const a = answers[q.id];
  if (a === undefined) return [];
  return Array.isArray(a) ? a : [a];
};

/**
 * diagnosis.json の excludes は表示名で書かれている（「米粒麦」）が、
 * servings の label は内部名（「米粒麦(白米に混ぜる)」）。そのままSetに入れると
 * 除外が静かに効かなくなるので、必ず label へ展開して保存する。
 * 既定は恒等関数（テスト用）。アプリからは dataset.labelsForName を渡す。
 */
export function scoreDiagnosis(
  file: DiagnosisFile,
  answers: Answers,
  resolveFood: (name: string) => string[] = (n) => [n]
): DiagnosisResult {
  let estTotal = 0;
  let solubleG = 0;
  const concerns: string[] = [];
  const excludedFoods: string[] = [];
  let stoolProfile: string | null = null;

  for (const q of file.questions) {
    for (const i of selected(q, answers)) {
      const opt = q.options[i];
      if (!opt) continue;
      if (typeof opt.est_total_g === 'number') {
        estTotal += opt.est_total_g;
        solubleG += opt.est_total_g * (opt.est_sol ?? 0);
      }
      if (q.axis === '参考' && opt.profile) stoolProfile = opt.profile;
      if (q.axis === '訴求') concerns.push(opt.label);
      if (opt.excludes) {
        for (const name of opt.excludes) excludedFoods.push(...resolveFood(name));
      }
    }
  }

  // 外食の寄与はマイナス（惣菜中心だと繊維が落ちる）。合計が負になっても意味が無いので0で止める
  estTotal = Math.max(0, estTotal);
  const estSolubleRatio = estTotal > 0 ? solubleG / estTotal : 0;
  const type = resolveType(file, answers, estTotal, estSolubleRatio);

  return {
    estTotal,
    estSolubleRatio,
    typeName: type.name,
    shareCopy: type.shareCopy,
    stoolProfile,
    concerns,
    excludedFoods: [...new Set(excludedFoods)],
  };
}

/**
 * タイプ判定。diagnosis.json の `cond` は文章なので、ここでコード化する。
 * 上から順に見て最初に当たったものを採用する（良い状態を先に見て、褒めを優先する）。
 */
export function resolveType(
  file: DiagnosisFile,
  answers: Answers,
  estTotal: number,
  ratio: number
): { name: string; shareCopy: string } {
  const pick = (name: string) => {
    const t = file.types.find((x) => x.name === name);
    // diagnosis.json のタイプ名と食い違っていたらここで気づけるように投げる
    if (!t) throw new Error(`diagnosis.json に存在しないタイプ名: ${name}`);
    return { name: t.name, shareCopy: t.share_copy };
  };
  const idx = (id: string): number | null => {
    const a = answers[id];
    if (a === undefined) return null;
    return Array.isArray(a) ? (a.length ? a[0] : null) : a;
  };

  if (estTotal >= 16 && ratio >= 0.3) return pick('いい感じタイプ');
  // q1=0 は「白いごはん」。主食を変えるだけで伸びしろが最大
  if (idx('q1') === 0) return pick('白ごはん一直線タイプ');
  // q6=0 は「ほぼ毎食 外食・コンビニ」
  if (idx('q6') === 0) return pick('外食まわりタイプ');
  // q2>=2 は「2回」以上。野菜は食べているのに量が足りていない枠
  if ((idx('q2') ?? 0) >= 2 && estTotal < 14) return pick('サラダ安心タイプ');
  if (ratio < 0.2) return pick('かさ偏りタイプ');
  return pick('サラダ安心タイプ');
}
