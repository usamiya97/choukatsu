/**
 * アプリ全体の状態。画面はここから値をもらうだけにして、計算は lib/state.ts に置く。
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CAUTIONS, COACH, SERVINGS, SWAPS, findServing, targetsFor } from './dataset';
import { clearApiKey } from './apikey';
import { learnFrom, parseMeal, type ParseResult } from './mealparse';
import type { Learned } from './lexicon';
import { evidenceOf, pickCoach, type CoachSuggestion } from './coach';
import { computeGutState, dateKey, indexServings, shiftDays, type GutState } from './state';
import { putStool, removeStool, stoolWeek as stoolWeekOf, type StoolWeek } from './stool';
import { cancelReminder, ensureReminderPermission, scheduleReminder } from './reminder';
import {
  backupFileName,
  backupText,
  buildBackup,
  mergeBackup,
  parseBackup,
  summarize,
  type Backup,
  type BackupSummary,
  type MergeReport,
} from './backup';
import { pickBackup, shareBackup, type ExportOutcome } from './backupfile';
import {
  EMPTY_PROFILE,
  EMPTY_UI,
  clearAll,
  loadLogs,
  loadProfile,
  loadStool,
  loadUi,
  saveLogs,
  saveProfile,
  saveStool,
  loadLearned,
  saveLearned,
  saveUi,
  type Profile,
  type UiState,
} from './storage';
import type { LogEntry, Logs, Serving, StoolForm, StoolLog, StoolRecord, Targets, Totals } from './types';

type Store = {
  ready: boolean;
  today: string;
  logs: Logs;
  profile: Profile;
  ui: UiState;
  gut: GutState;
  /** 目標値。総量はユーザー設定（既定25g）。画面は必ずここから読む */
  targets: Targets;
  coach: CoachSuggestion | null;
  /**
   * LLMが書いた今日のひとこと（提案カードの上に1行出す）。
   * キーが無い・生成に失敗した・検査に落ちた場合は null で、提案だけ出す
   */
  coachLead: string | null;
  /** よく食べるもの（直近30日の記録頻度順）。最上部に出して1タップにする */
  frequent: Serving[];
  todayEntries: LogEntry[];
  addEntry: (label: string, count?: number) => void;
  removeEntry: (at: string) => void;
  /** すでに記録した量を直す（半分だった／2杯だった、を後から直せるようにする） */
  updateEntryCount: (at: string, count: number) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  resetAll: () => void;
  totalsOf: (entries: LogEntry[]) => Totals;

  /**
   * 自由文を品目に当てる。**返り値は提案で、記録はしない。**
   * 確認画面で選んでから addEntry を呼ぶ。
   *
   * いまは**端末の辞書だけ**で解く（LLMは呼ばない・下の「AIの経路」を参照）
   */
  parseText: (text: string) => Promise<ParseResult>;

  /* お通じ（DESIGN §15）。食物繊維とは別の記録で、**キャラには効かせない** */
  stool: StoolLog;
  /** 今日のお通じ。未記録は null（0回と区別する） */
  todayStool: StoolRecord | null;
  stoolWeek: StoolWeek;
  /** 今日のぶんを書く（1日1件・上書き） */
  setStool: (count: number, form: StoolForm | null) => void;
  /** 今日のぶんを消す。0回として残さない */
  clearStool: () => void;
  /**
   * 記録をうながす時刻と通知の設定。
   * 返り値は**実際に通知を出せるようになったか**（許可が下りなければ false で、
   * 時刻だけ保存してホームの行で催促する）
   */
  setStoolReminder: (at: string | null, notify: boolean) => Promise<boolean>;

  /* 書き出し・読み込み（DESIGN §17）。**サーバを持たないので、ここが記録を失わない唯一の手段** */
  /** 記録をファイルにして共有シートに渡す */
  exportBackup: () => Promise<ExportOutcome>;
  /**
   * ファイルを選んで**中身を検査するだけ**。まだ書き込まない。
   * 確認を挟んでから applyBackup を呼ぶ（読み取り結果をそのまま記録しない・CLAUDE.md）
   */
  readBackup: () => Promise<ReadBackupOutcome>;
  /** 取り込む。**足すだけ**で、いま記録がある日は上書きしない（lib/backup.ts mergeBackup） */
  applyBackup: (backup: Backup) => MergeReport;
};

export type ReadBackupOutcome =
  | { ok: true; backup: Backup; summary: BackupSummary; name: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; reason: string };

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [logs, setLogs] = useState<Logs>({});
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [ui, setUi] = useState<UiState>(EMPTY_UI);
  const [stool, setStoolLog] = useState<StoolLog>({});
  // 自由文の学習辞書。無くてもアプリは動く
  const [learned, setLearned] = useState<Learned>({});
  // 日付は「今日」を跨いだら変わる。復帰時に再評価する
  const [today, setToday] = useState(() => dateKey());

  useEffect(() => {
    (async () => {
      const [l, p, u, lex, st] = await Promise.all([
        loadLogs(),
        loadProfile(),
        loadUi(),
        loadLearned(),
        loadStool(),
      ]);
      setLogs(l);
      setProfile(p);
      setUi(u);
      setLearned(lex);
      setStoolLog(st);
      setReady(true);
      // 入力欄を外したので、前のバージョンで保存されたキーは残しておく理由が無い。
      // 消えないまま端末のキーチェーンに置き続けるより、使わないなら消す
      void clearApiKey();
    })();
  }, []);

  const byLabel = useMemo(() => indexServings(SERVINGS), []);

  // 目標値は設定で変わる。段階の閾値もこれに連動するので、まずこれを決める
  const targets = useMemo(() => targetsFor(profile.targetTotal), [profile.targetTotal]);

  const gut = useMemo(
    () => computeGutState(logs, today, SERVINGS, ui.stage, profile.estTotal, targets.total),
    [logs, today, ui.stage, profile.estTotal, targets.total]
  );

  // 段階が動いたら保存する（ヒステリシスは前回値に依存するので、ここが記憶の本体）
  useEffect(() => {
    if (!ready || gut.stage === ui.stage) return;
    const next = { ...ui, stage: gut.stage };
    setUi(next);
    void saveUi(next);
  }, [ready, gut.stage, ui]);

  const coach = useMemo(() => {
    const base = pickCoach({
      logs,
      todayKey: today,
      servings: SERVINGS,
      catalog: COACH,
      swaps: SWAPS,
      cautions: CAUTIONS,
      targets,
      excludedFoods: profile.excludedFoods,
      recentShown: ui.recentCoach,
    });
    // LLMが今日の分を選んでいればそれを出す。**選ばせるのはカタログの中からだけ**なので、
    // 禁止リストも苦手も効いたまま（coachCandidates を共有している）
    const picked = ui.llmCoach?.date === today ? COACH.find((c) => c.id === ui.llmCoach?.id) : null;
    if (!picked) return base;
    return { item: picked, trigger: picked.trigger, evidence: evidenceOf(picked), swap: null };
  }, [logs, today, targets, profile.excludedFoods, ui.recentCoach, ui.llmCoach]);

  // 今日出した提案を覚える（数日は別のものを出す）
  useEffect(() => {
    if (!ready || !coach) return;
    const already = ui.recentCoach.some((r) => r.date === today);
    if (already) return;
    const next = {
      ...ui,
      recentCoach: [{ id: coach.item.id, date: today }, ...ui.recentCoach].slice(0, 7),
    };
    setUi(next);
    void saveUi(next);
  }, [ready, coach, today, ui]);

  const persistLogs = useCallback((next: Logs) => {
    setLogs(next);
    void saveLogs(next);
  }, []);

  const addEntry = useCallback(
    (label: string, count = 1) => {
      if (!findServing(label)) return;
      const entry: LogEntry = { label, count, at: new Date().toISOString() };
      const key = dateKey();
      setToday(key);
      persistLogs({ ...logs, [key]: [...(logs[key] ?? []), entry] });
    },
    [logs, persistLogs]
  );

  const removeEntry = useCallback(
    (at: string) => {
      const key = today;
      const entries = (logs[key] ?? []).filter((e) => e.at !== at);
      const next = { ...logs };
      if (entries.length) next[key] = entries;
      else delete next[key];
      persistLogs(next);
    },
    [logs, today, persistLogs]
  );

  const updateEntryCount = useCallback(
    (at: string, count: number) => {
      const entries = (logs[today] ?? []).map((e) => (e.at === at ? { ...e, count } : e));
      persistLogs({ ...logs, [today]: entries });
    },
    [logs, today, persistLogs]
  );

  /**
   * プロフィールの一部を直す。
   * **前の値から作る形（関数形）にしてあるのが要点。** 同じタイミングで2回呼ぶ場面があり
   * （初回診断の結果を書いた直後に、お通じの時刻を書く）、古い profile を掴んだまま
   * 上書きすると先の patch が消える。
   */
  const updateProfile = useCallback((patch: Partial<Profile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      void saveProfile(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setLogs({});
    setProfile(EMPTY_PROFILE);
    setUi(EMPTY_UI);
    setStoolLog({});
    // 学習辞書も消す（clearAll が保存側を消すので、画面側の状態も合わせる）。
    // APIキーは消さない。「データを消す」は記録を消す操作で、設定の作り直しまで求めていない
    setLearned({});
    // 時刻の設定も消えるので、OS側に残った予約も止める（消したのに鳴るのを防ぐ）
    void cancelReminder();
    void clearAll();
  }, []);

  /* ─── お通じ（DESIGN §15） ───────────────────────────────
   * 食物繊維の記録とは**別の入れ物**にしてある。混ぜない理由は2つ:
   *  - キャラの段階（7日平均）に混ざると、体の反応でキャラが弱る＝罰になる
   *  - 「入れたもの」と「出たもの」を並べて見るのが目的なので、別軸のまま持つ必要がある
   */

  const todayStool = stool[today] ?? null;
  const stoolWeek = useMemo(() => stoolWeekOf(stool, today), [stool, today]);

  const setStool = useCallback((count: number, form: StoolForm | null) => {
    // 日付を跨いで開いていた場合に前日へ書かない（addEntry と同じ扱い）
    const key = dateKey();
    setToday(key);
    setStoolLog((prev) => {
      const next = putStool(prev, key, count, form);
      void saveStool(next);
      return next;
    });
  }, []);

  const clearStool = useCallback(() => {
    setStoolLog((prev) => {
      const next = removeStool(prev, today);
      void saveStool(next);
      return next;
    });
  }, [today]);

  const setStoolReminder = useCallback(
    async (at: string | null, notify: boolean): Promise<boolean> => {
      let on = false;
      if (at && notify) {
        // 許可 → 予約 の順。どちらかが通らなければ通知は無しにして、時刻だけ保存する
        on = (await ensureReminderPermission()) && (await scheduleReminder(at));
      }
      if (!on) await cancelReminder();
      updateProfile({ stoolReminderAt: at, stoolNotify: on });
      return on;
    },
    [updateProfile]
  );

  /* ─── 書き出し・読み込み（DESIGN §17） ───────────────── */

  const exportBackup = useCallback(async (): Promise<ExportOutcome> => {
    const b = buildBackup({ profile, logs, stool, learned });
    return shareBackup(backupFileName(b), backupText(b));
  }, [profile, logs, stool, learned]);

  const readBackup = useCallback(async (): Promise<ReadBackupOutcome> => {
    const picked = await pickBackup();
    if (!picked.ok) {
      return picked.canceled ? { ok: false, canceled: true } : { ok: false, reason: picked.reason };
    }
    const parsed = parseBackup(picked.text);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    return { ok: true, backup: parsed.backup, summary: summarize(parsed.backup), name: picked.name };
  }, []);

  const applyBackup = useCallback(
    (backup: Backup): MergeReport => {
      const report = mergeBackup({ profile, logs, stool, learned }, backup);
      setLogs(report.logs);
      void saveLogs(report.logs);
      setStoolLog(report.stool);
      void saveStool(report.stool);
      setLearned(report.learned);
      void saveLearned(report.learned);
      // 段階はここで触らない。取り込んだ記録から computeGutState が決め直す
      updateProfile(report.profile);
      return report;
    },
    [profile, logs, stool, learned, updateProfile]
  );

  /**
   * 起動時に予約を貼り直す。OS側に残る予約なので普段は不要だが、
   * **許可が後から切られた／OSが予約を落とした**ときにここで戻る。
   * 許可が無くなっていたら profile 側も false に直す（設定画面が嘘をつかないように）。
   */
  const reminderSynced = useRef(false);
  useEffect(() => {
    if (!ready || reminderSynced.current) return;
    reminderSynced.current = true;
    if (!profile.stoolNotify || !profile.stoolReminderAt) return;
    void (async () => {
      const ok = (await ensureReminderPermission()) && (await scheduleReminder(profile.stoolReminderAt as string));
      if (!ok) updateProfile({ stoolNotify: false });
    })();
  }, [ready, profile.stoolNotify, profile.stoolReminderAt, updateProfile]);

  /** 直近30日の記録頻度。図鑑ではなく「よく食べるもの」用なので古い記録は見ない */

  const frequent = useMemo(() => {
    const count = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      for (const e of logs[shiftDays(today, -i)] ?? []) {
        count.set(e.label, (count.get(e.label) ?? 0) + 1);
      }
    }
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label]) => byLabel.get(label))
      .filter((s): s is Serving => Boolean(s));
  }, [logs, today, byLabel]);

  /* ─── AIの経路（2026-10-01 時点では呼ばない） ─────────────────
   * 自由文の名寄せ（lib/mealparse.ts）とコーチのひとこと（lib/coachllm.ts）は
   * 層としては出来ているが、**ここから呼んでいない。**
   *
   * 理由は配り方。自分のAPIキーを貼れる人は限られるので、BYOKでは一般に届かない。
   * かといって開発者のキーで肩代わりすると、コーチは全員ぶん毎日発生して
   * インストール数に比例した固定費になる（概算 $0.38/人/月）。
   * **課金とプロキシが揃うまで呼ばない**のが正しい順序（DESIGN §14-5・§19）。
   *
   * 開けるときに触るのは:
   *  - `lib/anthropic.ts`（クライアントの作り方。プロキシのURLに差し替える）
   *  - ここ（呼び出しの頻度。コーチは毎日ではなく**週1回**にする）
   *  - `parseText`（下）に client を渡す
   * 層とテストは残してあるので、消して作り直す必要はない。
   */

  const totalsOf = useCallback(
    (entries: LogEntry[]): Totals =>
      entries.reduce(
        (acc, e) => {
          const s = byLabel.get(e.label);
          if (!s) return acc;
          return {
            total: acc.total + s.total * e.count,
            soluble: acc.soluble + s.soluble * e.count,
            insoluble: acc.insoluble + s.insoluble * e.count,
          };
        },
        { total: 0, soluble: 0, insoluble: 0 }
      ),
    [byLabel]
  );

  /**
   * 自由文を当てる。辞書で足りればLLMを呼ばない（呼び出し回数＝費用）。
   * **記録はしない。** 返した候補を確認画面で選んでもらってから addEntry する
   */
  const parseText = useCallback(
    async (text: string): Promise<ParseResult> => {
      // client を渡さない＝辞書だけで解く。プロキシができたらここに渡す
      const result = await parseMeal(text, { learned });
      // LLMが解いた語は覚えて、次回から辞書だけで済ませる
      const next = learnFrom(result, learned);
      if (next !== learned && Object.keys(next).length !== Object.keys(learned).length) {
        setLearned(next);
        void saveLearned(next);
      }
      return result;
    },
    [learned]
  );

  const value: Store = {
    ready,
    today,
    logs,
    profile,
    ui,
    gut,
    targets,
    coach,
    coachLead: ui.llmCoach?.date === today ? ui.llmCoach.lead : null,
    frequent,
    todayEntries: logs[today] ?? [],
    addEntry,
    removeEntry,
    updateEntryCount,
    updateProfile,
    resetAll,
    totalsOf,
    parseText,
    stool,
    todayStool,
    stoolWeek,
    setStool,
    clearStool,
    setStoolReminder,
    exportBackup,
    readBackup,
    applyBackup,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('StoreProvider の外で useStore を呼んでいる');
  return ctx;
}
