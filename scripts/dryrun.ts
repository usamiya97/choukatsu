/**
 * 画面に何が出るかを端末なしで確かめるドライラン。
 *   npx tsx scripts/dryrun.ts
 *
 * ホーム画面が読む値（段階・メーターの文言・今日の提案）を、
 * 代表的な4つの状況について実際のロジックで計算して表示する。
 * UIのレイアウトは確認できないが、**文言と数字の出方**はこれで検証できる。
 */
import { pickCoach } from '../lib/coach';
import { CAUTIONS, COACH, SERVINGS, SWAPS, TARGETS } from '../lib/dataset';
import { fillRatio, progressWord, remainHint } from '../lib/format';
import { computeGutState, dateKey, shiftDays } from '../lib/state';
import type { Logs, Stage } from '../lib/types';

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
    name: '④ 目標18gに到達（段階4）。理想25gまでが段階5の伸びしろ',
    logs: logs({
      [day(1)]: ['もち麦ごはん', 'もち麦ごはん', 'もち麦ごはん'],
      [day(2)]: ['もち麦ごはん', 'もち麦ごはん', 'もち麦ごはん'],
      [day(3)]: ['もち麦ごはん', 'もち麦ごはん', 'もち麦ごはん'],
      [TODAY]: ['もち麦ごはん', 'もち麦ごはん', 'もち麦ごはん'],
    }),
    prevStage: 4,
  },
  {
    name: '⑤ 5日ぶりに戻ってきた日',
    logs: logs({ [day(5)]: ['もち麦ごはん'], [day(6)]: ['納豆'], [day(7)]: ['もち麦ごはん'] }),
    prevStage: 3,
  },
];

for (const sc of scenarios) {
  const gut = computeGutState(sc.logs, TODAY, SERVINGS, sc.prevStage ?? 1, sc.estimate ?? null);
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
  console.log(`キャラ      段階${gut.stage}（7日平均 ${gut.stageScore.toFixed(1)}g${gut.provisional ? '・診断の推定値' : ''}）`);
  console.log(`まわりの菌  ${gut.floraDots}個（図鑑 ${gut.flora}/${SERVINGS.length}種類）`);
  console.log(`週の記録    ${gut.weekLogDays}日`);
  console.log(`メーター    ${progressWord(gut.today.total, TARGETS.total)}  [${bar(fillRatio(gut.today.total, TARGETS.total))}]`);
  console.log(`            ${hint?.text ?? '（達成したので「あと○○」は出さない）'}`);
  if (gut.provisional) console.log(`            まだ見極め中です（3日記録すると実測に切り替わります）`);
  console.log(`提案        ${coach ? `[${coach.trigger}] ${coach.item.message}` : '（なし）'}`);
  if (coach) console.log(`            ${coach.item.reason}  《${coach.evidence}》`);
  console.log(`内部値      総量${gut.today.total.toFixed(2)}g / 菌のごはん${gut.today.soluble.toFixed(2)}g / おそうじ${gut.today.insoluble.toFixed(2)}g`);
}

function bar(ratio: number): string {
  const n = Math.round(ratio * 20);
  return '█'.repeat(n) + '░'.repeat(20 - n);
}
