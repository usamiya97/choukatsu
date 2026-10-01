/**
 * servings.csv の品目を追加・作り直しするスクリプト。
 *   node scripts/expand-servings.mjs             # 追加分のCSV行を標準出力に出す
 *   node scripts/expand-servings.mjs --apply     # data/servings.csv に追記する
 *   node scripts/expand-servings.mjs --refresh   # 既存178行の**導出列を作り直して差分を見る**
 *   node scripts/expand-servings.mjs --refresh --apply   # 作り直した内容で書き戻す
 *
 * なぜスクリプトにするか:
 *  - **繊維の値を手で書かない。** 食品番号から fiber_foods.csv（成分表）を引いて計算する。
 *    手入力すると必ず桁を間違える。ハルシネーションも混ざる
 *  - 2軸は比率方式（data/README.md）。**総量と同じ分析法の内訳**から比率を出す
 *  - tier（A/B/C/Z）は総量から機械的に決める
 *
 * 人が決めるのは常用量（unit / grams）と表示名・別名・食品番号だけ。
 * 常用量は自前定義なので TODO の「21. 常用量テーブルのレビュー」の対象。
 *
 * 導出の式は scripts/servings-derive.mjs にあり、ビルド時の検証（build-data.mjs）と共有する。
 * --refresh があるのは、式を直したときに既存行へ反映できるようにするため
 * （2026-09-30 に比率の取り方を直したときに使った）。
 */
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVING_COLUMNS, derivedCells, deriveServing, tierOf, num, r2 } from './servings-derive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'data');

/**
 * 追加する品目。
 * code = 成分表の食品番号。**調理形態まで含めて選ぶ**（生とゆでで繊維量が変わる）。
 * grams = その1回分の可食部グラム（自前定義）。
 */
const ADDITIONS = [
  // ── 野菜：葉物のバリエーション（「サラダを食べている」人の実態に寄せる） ──
  ['野菜', 'サニーレタス', 'サニーレタス', 'サニー|赤レタス|サニーレタスサラダ', 'サラダ1皿', 30, '06315'],
  ['野菜', 'リーフレタス', 'リーフレタス', 'グリーンリーフ|リーフ', 'サラダ1皿', 30, '06314'],
  ['野菜', 'サラダな', 'サラダな', 'サラダ菜', '3枚', 30, '06313'],
  ['野菜', '水菜', '水菜', 'みずな|京菜', 'サラダ1皿', 50, '06072'],
  ['野菜', '春菊(ゆで)', '春菊', 'しゅんぎく|菊菜', 'おひたし1鉢', 70, '06100'],
  ['野菜', 'チンゲンサイ(ゆで)', 'チンゲンサイ', 'ちんげん菜|青梗菜', '1株', 80, '06161'],
  ['野菜', 'ケール', 'ケール', 'ちりめんケール', '1枚', 30, '06080'],
  ['野菜', 'ルッコラ', 'ルッコラ', 'ロケット|アルグラ', 'サラダ1皿', 20, '06319'],
  ['野菜', 'クレソン', 'クレソン', 'オランダがらし', '1束', 20, '06077'],
  ['野菜', '菜の花(ゆで)', '菜の花', 'なばな|菜花', 'おひたし1鉢', 60, '06202'],
  ['野菜', 'モロヘイヤ', 'モロヘイヤ', 'もろへいや', 'おひたし1鉢', 50, '06293'],

  // ── 野菜：実もの・根もの ──
  ['野菜', '芽キャベツ(ゆで)', '芽キャベツ', 'めキャベツ|ブリュッセルスプラウト', '4個', 50, '06284'],
  ['野菜', 'カリフラワー(ゆで)', 'カリフラワー', 'カリフラワ', '3房', 60, '06055'],
  ['野菜', 'セロリ', 'セロリ', 'セルリー', '1本', 50, '06119'],
  ['野菜', 'ズッキーニ', 'ズッキーニ', 'ずっきーに', '1/2本', 80, '06116'],
  ['野菜', '赤パプリカ', '赤パプリカ', 'パプリカ|赤ピーマン', '1/2個', 60, '06247'],
  ['野菜', '黄パプリカ', '黄パプリカ', '黄ピーマン|イエローパプリカ', '1/2個', 60, '06249'],
  ['野菜', 'にら(ゆで)', 'にら', 'ニラ|韮', '1/2束', 50, '06208'],
  ['野菜', '長ねぎ', '長ねぎ', 'ねぎ|根深ねぎ|白ねぎ', '1/2本', 50, '06226'],
  ['野菜', '小ねぎ', '小ねぎ', '葉ねぎ|万能ねぎ|青ねぎ|薬味ねぎ', '薬味1食分', 10, '06227'],
  ['野菜', 'れんこん(ゆで)', 'れんこん', 'レンコン|蓮根', '煮物1食', 60, '06318'],
  ['野菜', 'たけのこ(ゆで)', 'たけのこ', '筍|タケノコ', '煮物1食', 60, '06150'],
  ['野菜', 'そらまめ(ゆで)', 'そらまめ', 'ソラマメ|空豆', '10粒', 50, '06125'],
  ['野菜', 'さやえんどう(ゆで)', 'さやえんどう', 'きぬさや|絹さや', '10枚', 30, '06021'],
  ['野菜', 'グリーンピース(冷凍)', 'グリーンピース', 'グリンピース|青えんどう', '大さじ3', 30, '06025'],
  ['野菜', 'かぶ', 'かぶ', '蕪|カブ', '1個', 80, '06036'],
  ['野菜', 'にがうり', 'ゴーヤ', 'にがうり|ゴーヤー|苦瓜', '1/4本', 50, '06205'],
  ['野菜', '大豆もやし', '大豆もやし', 'だいずもやし|豆もやし', '1/2袋', 100, '06287'],
  ['野菜', 'アルファルファ', 'アルファルファ', 'アルファルファもやし|スプラウト', 'サラダ1皿', 20, '06286'],

  // ── きのこ ──
  ['きのこ', '干ししいたけ(戻し)', '干ししいたけ', '乾しいたけ|干し椎茸|戻したしいたけ', '2枚分', 30, '08014'],
  ['きのこ', 'なめこ', 'なめこ', 'ナメコ|滑子', '1/2袋', 50, '08020'],

  // ── 海藻：少量で効くもの（食物繊維に特化した枠） ──
  ['海藻', '粉寒天', '粉寒天', '寒天|アガー|かんてん', '小さじ1', 2, '09049'],
  ['海藻', 'とろろ昆布', 'とろろ昆布', '削り昆布|とろろこんぶ', '1食分', 5, '09021'],
  ['海藻', '刻み昆布', '刻み昆布', 'きざみ昆布|細切り昆布', '煮物1食分', 5, '09020'],
  ['海藻', '塩昆布', '塩昆布', 'しお昆布|塩こんぶ', '小皿', 5, '09022'],
  ['海藻', 'あおのり', 'あおのり', '青のり|青海苔', '小さじ1', 2, '09002'],

  // ── 豆類 ──
  ['豆類', '蒸し大豆', '蒸し大豆', 'むし大豆|蒸しだいず|サラダ大豆', '1/2カップ', 50, '04081'],
  ['豆類', 'あずき(ゆで)', 'あずき', '小豆|ゆであずき', '1/2カップ', 60, '04002'],
  ['豆類', 'ゆで小豆(缶)', 'ゆで小豆', '小豆缶|あずき缶', '大さじ2', 40, '04003'],
  ['豆類', '凍り豆腐(乾)', '高野豆腐', 'こうや豆腐|凍り豆腐|しみ豆腐', '1個', 17, '04042'],
  ['豆類', 'おからパウダー', 'おからパウダー', '乾燥おから|おから粉|大豆粉末', '大さじ2', 12, '04089'],

  // ── 種実 ──
  ['種実', 'カシューナッツ', 'カシューナッツ', 'カシュー', '10粒', 15, '05005'],
  ['種実', 'チアシード', 'チアシード', 'ちあしーど|チア', '大さじ1', 12, '05046'],
  ['種実', '甘ぐり', '甘ぐり', '甘栗|天津甘栗|栗', '10粒', 50, '05013'],
  ['種実', 'ピスタチオ', 'ピスタチオ', 'ぴすたちお', '20粒', 20, '05026'],
  ['種実', 'ひまわりの種', 'ひまわりの種', 'サンフラワーシード|ひまわりシード', '大さじ1', 10, '05027'],

  // ── 主食 ──
  ['主食', '押麦(乾)', '押麦', 'おしむぎ|押し麦|大麦', '大さじ3', 30, '01006'],
  ['主食', 'ベーグル', 'ベーグル', 'べーぐる', '1個', 90, '01148'],
  ['主食', 'ナン', 'ナン', 'なん|インドのパン', '1枚', 80, '01037'],

  // ── 果物 ──
  ['果物', 'ラズベリー', 'ラズベリー', 'きいちご|木苺|フランボワーズ', '1/2カップ', 50, '07146'],
  ['果物', '干しぶどう', 'レーズン', '干しぶどう|ほしぶどう', '大さじ2', 20, '07117'],
  ['果物', 'オレンジ', 'オレンジ', 'ネーブル|ネーブルオレンジ', '1個', 130, '07040'],
  ['果物', 'パイナップル', 'パイナップル', 'パインアップル|パイン', '1/8個', 100, '07097'],
  ['果物', 'グレープフルーツ', 'グレープフルーツ', 'グレフル', '1/2個', 100, '07062'],
];

const rows = readFileSync(join(SRC, 'fiber_foods.csv'), 'utf8').trim().split('\n');
const head = rows[0].split(',');
const foods = new Map(
  rows.slice(1).map((line) => {
    const cells = line.split(',');
    const o = Object.fromEntries(head.map((h, i) => [h, cells[i]]));
    return [o.code, o];
  })
);

const existing = readFileSync(join(SRC, 'servings.csv'), 'utf8').trim().split('\n');
const existingLabels = new Set(existing.slice(1).map((l) => l.split(',')[0 + 1]));

const out = [];
const problems = [];

for (const [category, label, display, aliases, unit, grams, code] of ADDITIONS) {
  const food = foods.get(code);
  if (!food) {
    problems.push(`${label}: 食品番号 ${code} が成分表に無い`);
    continue;
  }
  if (existingLabels.has(label)) {
    problems.push(`${label}: すでに servings.csv にある`);
    continue;
  }
  if (food.fiber_total === '') {
    problems.push(`${label}: 総量が未測定（${food.name}）`);
    continue;
  }
  const d = deriveServing(food, grams);
  out.push([category, label, display, aliases, unit, grams, code, ...derivedCells(d)].join(','));
}

if (problems.length) {
  console.error('スキップした品目:');
  for (const p of problems) console.error('  - ' + p);
}

/**
 * 既存行の導出列を作り直す。人が決める7列（category〜code）はそのまま残す。
 * **式を直したときに、既存の品目へ反映するための口。**
 */
if (process.argv.includes('--refresh')) {
  const header = existing[0].split(',');
  if (header.join(',') !== SERVING_COLUMNS.join(',')) {
    console.error('servings.csv の列が想定と違う:');
    console.error(`  期待 ${SERVING_COLUMNS.join(',')}`);
    console.error(`  実際 ${header.join(',')}`);
    process.exit(1);
  }
  const changes = [];
  const refreshed = [existing[0]];
  for (const line of existing.slice(1)) {
    const c = line.split(',');
    const [category, label, display, aliases, unit, grams, code] = c;
    const food = foods.get(code);
    if (!food) {
      console.error(`${label}: 食品番号 ${code} が成分表に無い`);
      process.exit(1);
    }
    const d = deriveServing(food, Number(grams));
    if (!d) {
      console.error(`${label}: 総量が未測定（${food.name}）`);
      process.exit(1);
    }
    const next = [category, label, display, aliases, unit, grams, code, ...derivedCells(d)];
    // 変わった列だけを記録する（比率を直したときに何が動いたかを見るため）
    for (let i = 7; i < SERVING_COLUMNS.length; i++) {
      if (String(c[i]) !== String(next[i])) {
        changes.push(`${display}  ${SERVING_COLUMNS[i]}: ${c[i]} → ${next[i]}`);
      }
    }
    refreshed.push(next.join(','));
  }
  if (changes.length) {
    console.error(`導出列の差分 ${changes.length}件:`);
    for (const ch of changes) console.error('  ' + ch);
  } else {
    console.error('導出列の差分なし');
  }
  if (process.argv.includes('--apply')) {
    writeFileSync(join(SRC, 'servings.csv'), refreshed.join('\n') + '\n');
    console.error(`\ndata/servings.csv を作り直した（${refreshed.length - 1}行）`);
  } else {
    console.error('\n--apply で servings.csv に書き戻す');
  }
  process.exit(0);
}

if (process.argv.includes('--apply')) {
  appendFileSync(join(SRC, 'servings.csv'), out.join('\n') + '\n');
  console.error(`\ndata/servings.csv に ${out.length} 行 追記した`);
} else {
  console.log(out.join('\n'));
  console.error(`\n${out.length} 行（--apply で servings.csv に追記）`);
}
