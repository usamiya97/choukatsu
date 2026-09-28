/**
 * 画面に何が出るかを端末なしで確かめるドライラン。
 *   npx tsx scripts/dryrun.ts          # 既定の目標(25g)
 *   npx tsx scripts/dryrun.ts 18       # 目標を変えて確認
 *
 * ホーム画面が読む値（段階・メーターの文言・今日の提案）を、
 * 代表的な4つの状況について実際のロジックで計算して表示する。
 * UIのレイアウトは確認できないが、**文言と数字の出方**はこれで検証できる。
 */
import { pickCoach } from '../lib/coach';
import { CAUTIONS, COACH, GUIDELINE_TOTAL, SERVINGS, SWAPS, targetsFor } from '../lib/dataset';
import { axisName, axisRemainWord, fillRatio, progressWord, remainHint } from '../lib/format';
import { computeGutState, dateKey, idleStageCeiling, shiftDays } from '../lib/state';
import {
  compareWeeks,
  dayLine,
  previousWeekKey,
  reviewText,
  signed,
  weekReview,
} from '../lib/review';
import {
  DEFAULT_REMINDER_AT,
  STOOL_FORMS,
  putStool,
  stoolRow,
  stoolWeek,
  stoolWeekWord,
} from '../lib/stool';
import type { Logs, Stage, StoolLog } from '../lib/types';

/** 第1引数で目標総量を変えられる（設定画面で選べる値と同じ） */
const TARGETS = targetsFor(Number(process.argv[2]) || null);
const TODAY = dateKey();
const day = (n: number) => shiftDays(TODAY, -n);

const logs = (entries: Record<string, string[]>): Logs =>
  Object.fromEntries(
    Object.entries(entries).map(([date, labels]) => [
      date,
      labels.map((label, i) => ({ label, count: 1, at: `${date}T0${i}:00:00.000Z` })),
    ])
  );

const ACHIEVED = ['パスタ(ゆで)', 'もち麦ごはん', '納豆', 'ごぼう(ゆで)', 'ブロッコリー', '干し柿'];
/** 豆と乾物で量を積んだ日。総量39.5g だが水溶性の割合は21%（1:3.8） */
const SKEWED = ['いんげん豆(ゆで)', 'おから', '干し柿', 'ごぼう(ゆで)', 'ブロッコリー', 'もち麦ごはん', '納豆', 'ひよこ豆(ゆで)'];

const scenarios: { name: string; logs: Logs; estimate?: number | null; prevStage?: Stage }[] = [
  {
    name: '① 診断だけ済んだ初日（記録0件・推定9g）',
    logs: {},
    estimate: 9,
  },
  {
    name: '② 記録3日目・今日は白米とサラダだけ',
    logs: logs({
      [day(1)]: ['白米ごはん', 'レタス'],
      [day(2)]: ['白米ごはん', '納豆'],
      [day(3)]: ['食パン(6枚切)'],
      [TODAY]: ['白米ごはん', 'レタス'],
    }),
    prevStage: 2,
  },
  {
    name: '③ 今日3指標すべて達成（6タップ）',
    logs: logs({
      [day(1)]: ACHIEVED,
      [day(2)]: ACHIEVED,
      [day(3)]: ACHIEVED,
      [TODAY]: ACHIEVED,
    }),
    prevStage: 4,
  },
  {
    name: '④ もち麦ごはん3杯を続けている人（1日18.9g）',
    logs: logs({
      [day(1)]: ['もち麦ごはん', 'もち麦ごはん', 'もち麦ごはん'],
      [day(2)]: ['もち麦ごはん', 'もち麦ごはん', 'もち麦ごはん'],
      [day(3)]: ['もち麦ごはん', 'もち麦ごはん', 'もち麦ごはん'],
      [TODAY]: ['もち麦ごはん', 'もち麦ごはん', 'もち麦ごはん'],
    }),
    prevStage: 4,
  },
  {
    name: '⑤ 量は足りているが不溶性に偏った日（1:3.8）',
    logs: logs({
      [day(1)]: SKEWED,
      [day(2)]: SKEWED,
      [day(3)]: SKEWED,
      [TODAY]: SKEWED,
    }),
    prevStage: 4,
  },
  {
    name: '⑥ 5日ぶりに戻ってきた日',
    logs: logs({ [day(5)]: ['もち麦ごはん'], [day(6)]: ['納豆'], [day(7)]: ['もち麦ごはん'] }),
    prevStage: 3,
  },
  {
    // 7日の窓が空になった状態。平均0gで評価すると段階1に落ちるので、
    // 空白の長さで上限を下げている（DESIGN §2「空白が続いたとき」）
    name: '⑦ 15日ぶりに開いた日（段階4だった人）',
    logs: logs({ [day(15)]: ACHIEVED, [day(16)]: ACHIEVED, [day(17)]: ACHIEVED }),
    prevStage: 4,
  },
];

console.log(`目標: 総量${TARGETS.total}g / ${axisName('soluble')}${TARGETS.soluble}g / ${axisName('insoluble')}${TARGETS.insoluble}g` +
  (TARGETS.total > GUIDELINE_TOTAL ? `（公的な目安${GUIDELINE_TOTAL}gより高い設定）` : ''));

for (const sc of scenarios) {
  const gut = computeGutState(sc.logs, TODAY, SERVINGS, sc.prevStage ?? 1, sc.estimate ?? null, TARGETS.total);
  const hint = remainHint(TARGETS.total - gut.today.total, SERVINGS, { cautions: CAUTIONS });
  const coach = pickCoach({
    logs: sc.logs,
    todayKey: TODAY,
    servings: SERVINGS,
    catalog: COACH,
    swaps: SWAPS,
    cautions: CAUTIONS,
    targets: TARGETS,
  });

  console.log(`\n=== ${sc.name} ===`);
  console.log(
    `キャラ      段階${gut.stage}（7日平均 ${gut.stageScore.toFixed(1)}g${gut.provisional ? '・診断の推定値' : ''}` +
      `${gut.fading ? `・空白${gut.idleDays}日で上限${idleStageCeiling(gut.idleDays as number)}に抑制` : ''}）`
  );
  console.log(`まわりの菌  ${gut.floraDots}個（図鑑 ${gut.flora}/${SERVINGS.length}種類）`);
  console.log(`週の記録    ${gut.weekLogDays}日`);
  console.log(`メーター    ${progressWord(gut.today.total, TARGETS.total)}  [${bar(fillRatio(gut.today.total, TARGETS.total))}]`);
  console.log(`            ${hint?.text ?? '（達成したので「あと○○」は出さない）'}`);
  if (gut.provisional) console.log(`            まだ見極め中です（3日記録すると実測に切り替わります）`);
  // ホームの内訳バー（components/AxisBars.tsx が出す文言と同じもの）
  for (const axis of ['soluble', 'insoluble'] as const) {
    const value = gut.today[axis];
    const target = TARGETS[axis];
    const pad = axis === 'soluble' ? '内訳        ' : '            ';
    console.log(
      `${pad}${axisName(axis)}  [${bar(fillRatio(value, target))}]  ${axisRemainWord(value, target)}`
    );
  }
  console.log(`提案        ${coach ? `[${coach.trigger}] ${coach.item.message}` : '（なし）'}`);
  if (coach) console.log(`            ${coach.item.reason}  《${coach.evidence}》`);
  const share = gut.today.total > 0 ? (gut.today.soluble / gut.today.total) * 100 : 0;
  console.log(
    `内部値      総量${gut.today.total.toFixed(2)}g / 水溶性${gut.today.soluble.toFixed(2)}g / ` +
      `不溶性${gut.today.insoluble.toFixed(2)}g（水溶の割合 ${share.toFixed(0)}%・理想33%）`
  );
}

/**
 * お通じの記録（DESIGN §15）の文言。ホームの行は3状態あるので、時刻の前後で2回見る。
 * 段階やメーターに一切効かないことは上の出力に出ない（効かせていないので出ようがない）。
 */
const stoolAt = (h: number) => new Date(2026, 8, 28, h, 0);
let stoolLog: StoolLog = {};
stoolLog = putStool(stoolLog, day(0), 1, 4, '2026-09-28T21:00:00.000Z');
stoolLog = putStool(stoolLog, day(1), 2, 3, '2026-09-27T21:00:00.000Z');
stoolLog = putStool(stoolLog, day(3), 0, null, '2026-09-25T21:00:00.000Z');

console.log(`\n=== お通じの記録（時刻 ${DEFAULT_REMINDER_AT}） ===`);
for (const [name, record, hour] of [
  ['時刻の前・未記録', null, 9],
  ['時刻を過ぎて未記録', null, 22],
  ['記録済み', stoolLog[day(0)], 22],
] as const) {
  const row = stoolRow(record, DEFAULT_REMINDER_AT, stoolAt(hour));
  console.log(`ホームの行    ${name}`);
  console.log(`              ${row.title}${row.due ? '  ← 催促の色' : ''}`);
  console.log(`              ${row.sub ?? ''}`);
}
console.log(`7日の振り返り  ${stoolWeekWord(stoolWeek(stoolLog, day(0))) ?? '（記録なし）'}`);
console.log(`形の選択肢    ${STOOL_FORMS.map((f) => f.name).join(' / ')}`);

/**
 * ふりかえりタブ（DESIGN §16）。日ごとの行と、共有に渡すテキストをそのまま出す。
 * 共有テキストは端末の外に出る唯一の経路なので、ここで目視できるようにしておく。
 */
const reviewLogs = logs({
  [day(0)]: ACHIEVED,
  [day(1)]: ['白米ごはん', 'レタス'],
  [day(3)]: ACHIEVED,
  [day(4)]: ['もち麦ごはん', '納豆'],
  [day(8)]: ['白米ごはん'],
  [day(9)]: ['白米ごはん', '納豆'],
});
const thisWeek = weekReview(reviewLogs, stoolLog, SERVINGS, TODAY, TARGETS);
const lastWeek = weekReview(reviewLogs, stoolLog, SERVINGS, previousWeekKey(TODAY), TARGETS);

console.log(`\n=== ふりかえり（目標${TARGETS.total}g） ===`);
for (const d of thisWeek.days) console.log(`  ${dayLine(d)}`);
const diff = compareWeeks(thisWeek, lastWeek);
console.log(
  `集計        記録${thisWeek.logDays}日 / 記録した日の平均${Math.round(thisWeek.avgTotal)}g / ` +
    `届いた日${thisWeek.reachedDays}日`
);
console.log(
  `前の7日比   ${
    diff.avgTotal === null
      ? '（前の7日に記録が無いのでくらべない）'
      : `平均 ${signed(diff.avgTotal, 'g')} / 届いた日 ${signed(diff.reachedDays ?? 0, '日')}`
  }`
);
console.log(`\n--- 共有テキスト ---\n${reviewText(thisWeek, lastWeek, TARGETS)}`);

function bar(ratio: number): string {
  const n = Math.round(ratio * 20);
  return '█'.repeat(n) + '░'.repeat(20 - n);
}
