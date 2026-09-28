/**
 * お通じの記録（DESIGN.md §15）。
 *
 * 食物繊維の記録が「入れたもの」なら、これは「出たもの」。
 * v1には**結果を測る軸が無い**ので「25gを続けても変わらなかった」に何も言えなかった
 * （DESIGN §13-3）。その穴を埋めるのがこの層。
 *
 * この層に副作用を置かない。時刻に声をかける側（通知）は lib/reminder.ts。
 *
 * 数値の言語化を lib/format.ts ではなくここに置いたのは、2軸の比率を lib/targets.ts に
 * 集めたのと同じ理由。**お通じの語彙・数え方・言い方を1か所に集める**ほうが、
 * format.ts に混ぜて「繊維の言語化」と並べるより壊れにくい。
 */
import { lastNDays } from './state';
import type { StoolForm, StoolLog, StoolRecord } from './types';

export type StoolFormDef = {
  form: StoolForm;
  /** 画面に出す名前。**ここだけが定義**（画面に直接書かない） */
  name: string;
  /** 名前だけでは「硬い」と「やや硬い」の区別がつかないので必ず添える */
  note: string;
};

/**
 * 便の形の7段階（ブリストルスケール）。
 *
 * 並び（1=硬い側 … 7=水っぽい側）を崩さないこと。順番そのものが
 * 「4が真ん中」という読み方を作っている。選択肢を7つも出すのは
 * 「硬い/ふつう/ゆるい」の3択では**変化が見えない**ため
 * （3択だと硬い側の人はずっと「硬い」のままで、良くなっても悪くなっても同じ表示になる）。
 *
 * note に書くのは**見た目の説明だけ**。どの形が良い・悪いとは書かない（DESIGN §5-1）。
 */
export const STOOL_FORMS: readonly StoolFormDef[] = [
  { form: 1, name: 'コロコロ便', note: '小さくて硬いかたまりが、ばらばらに出る' },
  { form: 2, name: '硬い便', note: '太くて硬い。表面がごつごつしている' },
  { form: 3, name: 'やや硬い便', note: '形はあるが、表面に細かいひび割れがある' },
  { form: 4, name: '普通便', note: 'なめらかで やわらかい。すっと出る' },
  { form: 5, name: 'やや柔らかい便', note: 'やわらかいかたまりが、いくつかに分かれる' },
  { form: 6, name: '泥状便', note: '形がはっきりせず、どろっとしている' },
  { form: 7, name: '水様便', note: '固形のものがなく、水のような状態' },
] as const;

export function stoolFormDef(form: StoolForm): StoolFormDef {
  // 保存値が壊れていても落とさない。範囲外なら真ん中を返す（記録が読めなくなるのを避ける）
  return STOOL_FORMS.find((f) => f.form === form) ?? STOOL_FORMS[3];
}

export function stoolFormName(form: StoolForm): string {
  return stoolFormDef(form).name;
}

/**
 * 1日の回数の上限。**数を競うものではない**ので多い側は9で止める。
 * 10回以上の日は体調そのものの話で、記録の粒度を上げても打ち手は増えない。
 */
export const STOOL_COUNT_MAX = 9;
/** 0 =「出なかった」。記録しない日とは別物（lib/types.ts StoolLog のコメント） */
export const STOOL_COUNT_MIN = 0;

export function clampStoolCount(count: number): number {
  if (!Number.isFinite(count)) return 1;
  return Math.min(STOOL_COUNT_MAX, Math.max(STOOL_COUNT_MIN, Math.round(count)));
}

/**
 * その日の記録を書く。**1日1件なので上書き**（回数を足さない）。
 * 「朝1回」「夜また1回」を足し算で入れたい人はステッパーで2回にする形にしてある。
 * 1回ごとのレコードにしなかったのは、時刻や量まで聞き始めると入力が重くなるため。
 */
export function putStool(
  log: StoolLog,
  key: string,
  count: number,
  form: StoolForm | null,
  at: string = new Date().toISOString()
): StoolLog {
  const c = clampStoolCount(count);
  // 出なかった日に形は無い。0回で形が残っていると振り返りの集計が嘘になる
  return { ...log, [key]: { count: c, form: c === 0 ? null : form, at } };
}

export function removeStool(log: StoolLog, key: string): StoolLog {
  const next = { ...log };
  delete next[key];
  return next;
}

export type StoolWeek = {
  /** 記録がある日数(0..7)。未記録日は数えない */
  days: number;
  /** のべ回数 */
  count: number;
  /** 「出なかった」と記録した日数 */
  noneDays: number;
  /** いちばん多かった形（同数なら直近に記録したもの）。形の記録が無ければ null */
  form: StoolForm | null;
  /** 形を記録した日数 */
  formDays: number;
};

/**
 * 直近7日の振り返り（今日を含む）。
 *
 * **平均を出さない。** 未記録日を0で割ると「記録を忘れた日」が「出なかった日」に化けるので、
 * 「7日のうち何日記録して、のべ何回」という数え方だけにしてある。
 */
export function stoolWeek(log: StoolLog, todayKey: string): StoolWeek {
  const tally = new Map<StoolForm, number>();
  let days = 0;
  let count = 0;
  let noneDays = 0;
  let formDays = 0;
  let recent: StoolForm | null = null;

  for (const key of lastNDays(todayKey, 7)) {
    const r = log[key];
    if (!r) continue; // 未記録日はここで落とす（0回として数えない）
    days++;
    count += clampStoolCount(r.count);
    if (r.count === 0) noneDays++;
    if (r.form) {
      formDays++;
      tally.set(r.form, (tally.get(r.form) ?? 0) + 1);
      // lastNDays は新しい順なので、最初に見つかった形が直近のもの
      if (recent === null) recent = r.form;
    }
  }

  let form: StoolForm | null = null;
  let best = 0;
  for (const [f, n] of tally) {
    if (n > best) {
      best = n;
      form = f;
    }
  }
  // 同数のときは番号の大小ではなく**直近に記録した形**を採る（いまの傾向を見せたい）
  if (recent !== null && (tally.get(recent) ?? 0) === best) form = recent;

  return { days, count, noneDays, form, formDays };
}

/** 「2回・普通便」「出ませんでした」。小数点は出さない（回数は整数） */
export function stoolRecordWord(r: StoolRecord): string {
  if (r.count === 0) return '出ませんでした';
  return r.form ? `${r.count}回・${stoolFormName(r.form)}` : `${r.count}回`;
}

/**
 * 7日の振り返り1行。記録が無ければ null（「0日」と言って責めない）。
 * ここで**食物繊維との因果は言わない**。並べて見せるだけにして、判断は書かない（DESIGN §15-2）。
 */
export function stoolWeekWord(w: StoolWeek): string | null {
  if (w.days === 0) return null;
  const none = w.noneDays > 0 ? `（出なかった日 ${w.noneDays}日）` : '';
  const form = w.form ? `。多かった形は ${stoolFormName(w.form)}` : '';
  return `この7日で ${w.days}日 記録して、のべ ${w.count}回${none}${form}`;
}

/* ─── 記録をうながす時刻 ─────────────────────────────────────── */

/**
 * 時刻の候補。**自由入力にしない。**
 * g入力を置かないのと同じ理由で（「何時何分がよいか」を決められる人はいない）、
 * 生活の区切りの名前で選ばせる。時刻ピッカーのライブラリを足す理由もここには無い。
 */
export const REMINDER_OPTIONS = [
  { at: '07:00', label: '起きたころ' },
  { at: '12:00', label: 'お昼ごろ' },
  { at: '18:00', label: '夕方' },
  { at: '21:00', label: '夜' },
  { at: '23:00', label: '寝る前' },
] as const;

/**
 * 既定の候補（初回に選ばれている状態にしておくもの）。
 * 夜にしたのは、**朝だとその日のお通じがまだ分からない**ため。
 * 1日ぶんを振り返って入れる記録なので、日の終わりに寄せる。
 */
export const DEFAULT_REMINDER_AT = '21:00';

/** 'HH:MM' を解く。壊れた保存値では null（落とさず「催促しない」に倒す） */
export function parseHm(at: string | null | undefined): { hour: number; minute: number } | null {
  if (!at) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(at.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** 「夜（21:00）」。候補に無い時刻でも時刻だけは出す */
export function reminderLabel(at: string | null | undefined): string | null {
  const hm = parseHm(at);
  if (!hm) return null;
  const clock = `${hm.hour}:${String(hm.minute).padStart(2, '0')}`;
  const known = REMINDER_OPTIONS.find((o) => o.at === at);
  return known ? `${known.label}（${clock}）` : clock;
}

/**
 * その時刻を過ぎているか。時刻が未設定・壊れているときは false
 * （決めていない人に「時間になりました」とは言えない）。
 */
export function reminderDue(at: string | null | undefined, now: Date = new Date()): boolean {
  const hm = parseHm(at);
  if (!hm) return false;
  return now.getHours() * 60 + now.getMinutes() >= hm.hour * 60 + hm.minute;
}

/**
 * 端末の通知に出す文。lib/reminder.ts から読む。
 * ここに置いたのは、**禁止語の検査を lib/stool.test.ts で一緒にかける**ため
 * （通知は誰もレビューしないまま端末に出る文なので、検査から漏らしたくない）。
 */
export const REMINDER_TEXT = {
  title: '今日のお通じ',
  body: '記録しておくと、食べたものと並べて見られます',
} as const;

export type StoolRow = {
  title: string;
  sub: string | null;
  /** 催促の見た目にするか（時刻を過ぎていて、今日まだ記録が無い） */
  due: boolean;
};

/**
 * ホームに置く1行の文（components/StoolCard.tsx）。3状態を1か所で決める。
 *
 * 行そのものは**消さない**。時刻前だけ隠す案は捨てた——
 * 出たり消えたりする行は「さっきあったものが無い」になって探させる。
 * 代わりに、時刻を過ぎて未記録のときだけ色を強くする。
 */
export function stoolRow(
  record: StoolRecord | null | undefined,
  at: string | null | undefined,
  now: Date = new Date()
): StoolRow {
  if (record) {
    return { title: `今日のお通じ ${stoolRecordWord(record)}`, sub: '押すと直せます', due: false };
  }
  if (reminderDue(at, now)) {
    return { title: '今日のお通じを記録しますか', sub: '回数と形を選ぶだけです', due: true };
  }
  const label = reminderLabel(at);
  return {
    title: '今日のお通じ',
    sub: label ? `${label} にお聞きします` : '記録すると、食べたものと並べて見られます',
    due: false,
  };
}
