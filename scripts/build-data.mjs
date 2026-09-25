/**
 * data/*.csv → data/generated/*.json（バンドル用）
 *
 * CSVをそのままアプリに読み込ませない理由:
 *  - 実行時パースのコストと、パース失敗が実行時エラーになる（ビルド時に落としたい）
 *  - 数値を string のまま扱う事故を防ぐ（メーターは嘘をつかない原則 / DESIGN §9-1）
 *
 * 前提: data/*.csv には引用符も改行入りセルも無い（検証済み）。単純split(',')で足りる。
 * 崩れた場合はここで throw して気づけるように、列数チェックを入れている。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'data');
const OUT = join(SRC, 'generated');

function readCsv(name) {
  const text = readFileSync(join(SRC, name), 'utf8').replace(/\r\n/g, '\n').trim();
  const [headerLine, ...lines] = text.split('\n');
  const header = headerLine.split(',');
  return lines.map((line, i) => {
    const cells = line.split(',');
    if (cells.length !== header.length) {
      throw new Error(`${name}:${i + 2} 列数が合わない (${cells.length} != ${header.length})`);
    }
    return Object.fromEntries(header.map((h, j) => [h, cells[j]]));
  });
}

/** 空欄は null。「0」と「未測定」を同じ 0 にしない */
const num = (v) => (v === '' || v === undefined ? null : Number(v));
const req = (v, where) => {
  const n = Number(v);
  if (v === '' || Number.isNaN(n)) throw new Error(`${where}: 数値が必要なセルが空/不正 (${v})`);
  return n;
};
const list = (v) => (v ? v.split('|').filter(Boolean) : []);

function buildServings() {
  const rows = readCsv('servings.csv');
  const items = rows.map((r, i) => {
    const where = `servings.csv:${i + 2} ${r.label}`;
    const total = req(r.fiber_per_serving, where);
    const soluble = req(r.soluble_per_serving, where);
    const insoluble = req(r.insoluble_per_serving, where);
    // 2軸の合計＝総量（比率方式の不変条件・data/README.md）。崩れたらビルドを止める
    if (Math.abs(soluble + insoluble - total) > 0.011) {
      throw new Error(`${where}: 2軸の合計が総量と一致しない (${soluble}+${insoluble} != ${total})`);
    }
    return {
      label: r.label,
      category: r.category,
      displayName: r.display_name,
      aliases: list(r.aliases),
      unitLabel: r.unit_label,
      servingG: req(r.serving_g, where),
      code: r.code,
      officialName: r.official_name,
      fiberPer100g: req(r.fiber_per_100g, where),
      total,
      soluble,
      insoluble,
      solubleRatio: req(r.soluble_ratio, where),
      breakdownSource: r.breakdown_source,
      method: r.method,
      tier: r.tier,
    };
  });
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.label)) throw new Error(`servings.csv: label が重複 (${it.label})`);
    seen.add(it.label);
  }
  return items;
}

function buildSwaps() {
  return readCsv('swaps.csv').map((r, i) => {
    const where = `swaps.csv:${i + 2}`;
    return {
      before: r.before,
      beforeDisplay: r.before_display,
      beforeUnit: r.before_unit,
      after: r.after,
      afterDisplay: r.after_display,
      afterUnit: r.after_unit,
      deltaTotal: req(r.delta_total, where),
      deltaSoluble: req(r.delta_soluble, where),
      purpose: r.purpose,
    };
  });
}

function buildCautions() {
  return readCsv('cautions.csv').map((r) => ({
    label: r.label,
    code: r.code,
    axis: r.axis,
    commonBelief: r.common_belief,
    dataSays: r.data_says,
    reason: r.reason,
    coachRule: r.coach_rule,
  }));
}

function buildCoach() {
  return readCsv('coach_catalog.csv').map((r, i) => ({
    id: r.id,
    trigger: r.trigger,
    priority: req(r.priority, `coach_catalog.csv:${i + 2}`),
    message: r.message,
    reason: r.reason,
    deltaTotal: num(r.delta_total),
    deltaSoluble: num(r.delta_soluble),
    kind: r.kind,
    targetFood: r.target_food || null,
    source: r.source,
  }));
}

/**
 * 成分表フルデータ（2,538件）の検索インデックス。
 * プリセットに無いものを検索/AI名寄せで引くときの参照先。
 * method を必ず持たせる（分析法が違う食品同士で置き換え提案を出さないガード用）。
 * 総量が無い食品（未測定）は検索に出しても答えられないので落とす。
 */
function buildFoods() {
  const rows = readCsv('fiber_foods.csv');
  const foods = rows
    .filter((r) => r.fiber_total !== '')
    .map((r) => ({
      code: r.code,
      name: r.name.replace(/　+/g, ' ').trim(),
      total: Number(r.fiber_total),
      soluble: num(r.soluble_prosky),
      insoluble: num(r.insoluble_prosky),
      method: r.method,
    }));
  return foods;
}

mkdirSync(OUT, { recursive: true });

const artifacts = {
  'servings.json': buildServings(),
  'swaps.json': buildSwaps(),
  'cautions.json': buildCautions(),
  'coach.json': buildCoach(),
  'foods.json': buildFoods(),
};

for (const [name, value] of Object.entries(artifacts)) {
  writeFileSync(join(OUT, name), JSON.stringify(value) + '\n');
  console.log(`${name.padEnd(16)} ${String(value.length).padStart(5)} 件`);
}

// 相互参照の検証: coach/swaps が指す食品がプリセットに存在するか、禁止食品を提案していないか
const servings = artifacts['servings.json'];
const labels = new Set(servings.map((s) => s.label));
const displayNames = new Set(servings.map((s) => s.displayName));
// 禁止は「軸つき」で持つ。キウイは水溶性狙いでは推さないが総量目的なら可（cautions.csv の coach_rule）
const bannedAxes = new Map();
for (const c of artifacts['cautions.json']) {
  if (!bannedAxes.has(c.label)) bannedAxes.set(c.label, new Set());
  bannedAxes.get(c.label).add(c.axis);
}
const bannedFor = (label, axis) => bannedAxes.get(label)?.has(axis) ?? false;
const problems = [];

for (const s of artifacts['swaps.json']) {
  if (!labels.has(s.before)) problems.push(`swaps: before がプリセットに無い (${s.before})`);
  if (!labels.has(s.after)) problems.push(`swaps: after がプリセットに無い (${s.after})`);
  const axes = s.purpose === '両方' ? ['総量', '水溶性'] : [s.purpose];
  for (const axis of axes) {
    if (s.purpose !== '推奨しない' && bannedFor(s.after, axis)) {
      problems.push(`swaps: ${axis}目的なのに禁止食品を提案先にしている (${s.after})`);
    }
  }
}
for (const c of artifacts['coach.json']) {
  if (c.targetFood && !labels.has(c.targetFood) && !displayNames.has(c.targetFood)) {
    problems.push(`coach ${c.id}: target_food がプリセットに無い (${c.targetFood})`);
  }
  // トリガーが狙う軸で禁止されている食品を提案していないか
  const axis = c.trigger.includes('水溶性') ? '水溶性' : c.trigger.includes('不溶性') ? '不溶性' : '総量';
  if (c.targetFood && bannedFor(c.targetFood, axis)) {
    problems.push(`coach ${c.id}: ${axis}狙いで禁止食品を提案している (${c.targetFood})`);
  }
  // 内部名（(ゆで) 等）がUI文に漏れていないか
  if (/[（(](ゆで|生|乾|ゆで麺|素干し)[)）]/.test(c.message)) {
    problems.push(`coach ${c.id}: 内部名が提案文に漏れている (${c.message})`);
  }
}

if (problems.length) {
  console.error('\n検証エラー:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('\n検証OK: 参照切れ・禁止食品の混入・内部名の漏れ なし');
