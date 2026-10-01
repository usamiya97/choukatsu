/**
 * 記録の書き出しと読み込み（DESIGN.md §17）。
 *
 * サーバを持たない設計なので、**端末を変えたら記録が消える**のが最大の穴だった
 * （半年ぶん溜めてから機種変で消えると、振り返りの土台ごと消える）。
 * サーバを持つ前に、まず「ファイルに逃がして読み戻せる」ところまでをやる。
 *
 * この層に副作用を置かない。ファイルの読み書きと共有は lib/backupfile.ts。
 *
 * **APIキーは絶対に入れない。** キーは expo-secure-store にあり、ここには持ってこない
 * （バックアップはLINEやメールで人に渡るものなので、キーが一緒に流れる形にしてはいけない）。
 * 段階(stage)も入れない——記録から決まり直すので、持つと二重の真実になる。
 */
import type { Profile } from './storage';
import type { Learned } from './lexicon';
import type { LogEntry, Logs, StoolForm, StoolLog, StoolRecord } from './types';

export const BACKUP_APP = 'chokatsu';

/**
 * ファイル形式の版。**上げるのは互換性を壊すときだけ。**
 * 読む側は自分より新しい版を拒む（黙って一部を捨てるより、更新を促すほうが安全）。
 */
export const BACKUP_VERSION = 1;

export type Backup = {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  profile: Profile;
  logs: Logs;
  stool: StoolLog;
  /** 自由文の学習辞書。無くても動くが、あると読み戻したあともLLMを呼ばずに済む */
  learned: Learned;
};

export type BackupInput = {
  profile: Profile;
  logs: Logs;
  stool: StoolLog;
  learned: Learned;
};

export function buildBackup(input: BackupInput, now: Date = new Date()): Backup {
  // フィールドを明示的に並べる。オブジェクトを丸ごと展開しないのは、
  // 将来 Profile に秘密が増えたときに黙って書き出してしまわないため
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    profile: pickProfile(input.profile),
    logs: input.logs,
    stool: input.stool,
    learned: input.learned,
  };
}

/** 整形しない（改行とインデントでファイルが2倍になる。人が読むものではない） */
export function backupText(b: Backup): string {
  return JSON.stringify(b);
}

/** 「chokatsu-2026-09-30.json」。日付を入れるのは、古いファイルと見分けるため */
export function backupFileName(b: Backup): string {
  return `${BACKUP_APP}-${b.exportedAt.slice(0, 10)}.json`;
}

export type BackupSummary = {
  exportedAt: string | null;
  /** 記録の期間（古い順）。記録が無ければ null */
  from: string | null;
  to: string | null;
  /** 食物繊維の記録がある日数 */
  logDays: number;
  /** 品目の件数 */
  entries: number;
  stoolDays: number;
  /** 診断・目標値などの設定が入っているか */
  hasProfile: boolean;
};

/** 取り込む前に「何が入っているファイルか」を見せるための要約（確認を必ず挟む） */
export function summarize(b: Backup): BackupSummary {
  const keys = Object.keys(b.logs).filter((k) => b.logs[k].length).sort();
  return {
    exportedAt: b.exportedAt || null,
    from: keys[0] ?? null,
    to: keys[keys.length - 1] ?? null,
    logDays: keys.length,
    entries: keys.reduce((n, k) => n + b.logs[k].length, 0),
    stoolDays: Object.keys(b.stool).length,
    hasProfile: b.profile.diagnosed || b.profile.targetTotal !== null,
  };
}

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; reason: string };

/**
 * ファイルの中身を検査して Backup にする。
 *
 * **壊れた行は落とすが、ファイル全体を拒まない**（エラーは落とさない方向に寄せる）。
 * ただし「別アプリのファイル」「新しい版」は拒む——黙って一部だけ取り込むと、
 * 何が入ったのか誰にも分からなくなる。
 */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'ファイルを読めませんでした（中身が壊れています）' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'このアプリの書き出したファイルではないようです' };
  }
  const o = raw as Record<string, unknown>;
  if (o.app !== BACKUP_APP) {
    return { ok: false, reason: 'このアプリの書き出したファイルではないようです' };
  }
  const version = typeof o.version === 'number' ? o.version : 0;
  if (version > BACKUP_VERSION) {
    return { ok: false, reason: '新しいバージョンで書き出されたファイルです。アプリを更新してください' };
  }
  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      version,
      exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
      profile: pickProfile(o.profile),
      logs: cleanLogs(o.logs),
      stool: cleanStool(o.stool),
      learned: cleanLearned(o.learned),
    },
  };
}

export type MergeReport = {
  profile: Profile;
  logs: Logs;
  stool: StoolLog;
  learned: Learned;
  /** 足した日数 */
  addedLogDays: number;
  addedStoolDays: number;
  /** すでに記録があってそのままにした日数 */
  keptLogDays: number;
  keptStoolDays: number;
};

/**
 * 取り込みは**「いま入っていないところだけ埋める」**。
 *
 * 置き換え方式（ファイルの内容で上書き）を採らなかったのは、失敗したときの被害が大きいため。
 * 古いバックアップを間違って読むと、直近2週間の記録が黙って消える。
 * 一方この方式の失敗は「ファイル側の日が採用されない」だけで、記録は減らない。
 *
 * **完全に入れ替えたい場合は、先に設定の「記録をすべて消す」を使う**（消す操作は既にあるので、
 * 取り込み側に破壊的な経路を増やす必要がない）。
 *
 * 同じ日が両方にあるときに「多いほうを採る」「足し合わせる」もやらない——
 * どちらも記録を静かに作り替えることになる。
 */
export function mergeBackup(current: BackupInput, b: Backup): MergeReport {
  const logs: Logs = { ...current.logs };
  let addedLogDays = 0;
  let keptLogDays = 0;
  for (const [key, entries] of Object.entries(b.logs)) {
    if (!entries.length) continue;
    if (logs[key]?.length) {
      keptLogDays++;
      continue;
    }
    logs[key] = entries;
    addedLogDays++;
  }

  const stool: StoolLog = { ...current.stool };
  let addedStoolDays = 0;
  let keptStoolDays = 0;
  for (const [key, record] of Object.entries(b.stool)) {
    if (stool[key]) {
      keptStoolDays++;
      continue;
    }
    stool[key] = record;
    addedStoolDays++;
  }

  return {
    // 学習した語は足すだけ（同じ語はこの端末のものを残す）
    learned: { ...b.learned, ...current.learned },
    profile: fillProfile(current.profile, b.profile),
    logs,
    stool,
    addedLogDays,
    addedStoolDays,
    keptLogDays,
    keptStoolDays,
  };
}

/**
 * 設定も「空いているところだけ」埋める。
 *
 * `stoolNotify` は**引き継がない**。通知を出せるかはこの端末の許可次第で、
 * 予約もしていないのに「オン」と表示したら設定画面が嘘をつくことになる
 * （時刻だけ戻るので、必要なら本人がトグルを入れ直す）。
 */
function fillProfile(current: Profile, from: Profile): Profile {
  return {
    diagnosed: current.diagnosed || from.diagnosed,
    estTotal: current.estTotal ?? from.estTotal,
    estSolubleRatio: current.estSolubleRatio ?? from.estSolubleRatio,
    typeName: current.typeName ?? from.typeName,
    stoolProfile: current.stoolProfile ?? from.stoolProfile,
    concerns: current.concerns.length ? current.concerns : from.concerns,
    excludedFoods: current.excludedFoods.length ? current.excludedFoods : from.excludedFoods,
    targetTotal: current.targetTotal ?? from.targetTotal,
    stoolReminderAt: current.stoolReminderAt ?? from.stoolReminderAt,
    stoolNotify: current.stoolNotify,
  };
}

/* ─── 検査。知っているフィールドだけを通す ───────────────── */

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/**
 * 既知のフィールドだけを取り出す。**未知のキーは捨てる**のが要点で、
 * ここが「APIキーやよく分からない値が混ざらない」ことの担保になっている。
 */
/**
 * `pickProfile` が拾うフィールド。**Profile に項目が増えたらここも増やす。**
 * 増やし忘れを lib/backup.test.ts で検出する（増えた設定が黙って書き出されない／
 * 黙って戻らない、のどちらも事故になる）。
 */
export const BACKUP_PROFILE_KEYS: readonly (keyof Profile)[] = [
  'diagnosed',
  'estTotal',
  'estSolubleRatio',
  'typeName',
  'stoolProfile',
  'concerns',
  'excludedFoods',
  'targetTotal',
  'stoolReminderAt',
  'stoolNotify',
];

function pickProfile(v: unknown): Profile {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    diagnosed: o.diagnosed === true,
    estTotal: num(o.estTotal),
    estSolubleRatio: num(o.estSolubleRatio),
    typeName: str(o.typeName),
    stoolProfile: str(o.stoolProfile),
    concerns: strings(o.concerns),
    excludedFoods: strings(o.excludedFoods),
    targetTotal: num(o.targetTotal),
    stoolReminderAt: str(o.stoolReminderAt),
    stoolNotify: o.stoolNotify === true,
  };
}

function cleanLogs(v: unknown): Logs {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out: Logs = {};
  for (const [key, value] of Object.entries(o)) {
    if (!DATE_KEY.test(key) || !Array.isArray(value)) continue;
    const entries = value
      .map((e): LogEntry | null => {
        const r = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
        const label = str(r.label);
        const count = num(r.count);
        if (!label || count === null || count <= 0) return null;
        return { label, count, at: str(r.at) ?? `${key}T00:00:00.000Z` };
      })
      .filter((e): e is LogEntry => e !== null);
    if (entries.length) out[key] = entries;
  }
  return out;
}

function cleanStool(v: unknown): StoolLog {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out: StoolLog = {};
  for (const [key, value] of Object.entries(o)) {
    if (!DATE_KEY.test(key)) continue;
    const r = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const count = num(r.count);
    if (count === null || count < 0) continue;
    const form = num(r.form);
    const record: StoolRecord = {
      count: Math.round(count),
      form: form !== null && form >= 1 && form <= 7 ? (Math.round(form) as StoolForm) : null,
      at: str(r.at) ?? `${key}T00:00:00.000Z`,
    };
    // 0回の日に形は持たない（lib/stool.ts putStool と同じ扱い）
    out[key] = record.count === 0 ? { ...record, form: null } : record;
  }
  return out;
}

function cleanLearned(v: unknown): Learned {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out: Learned = {};
  for (const [word, label] of Object.entries(o)) {
    const l = str(label);
    if (word && l) out[word] = l;
  }
  return out;
}
