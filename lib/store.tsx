/**
 * アプリ全体の状態。画面はここから値をもらうだけにして、計算は lib/state.ts に置く。
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CAUTIONS, COACH, SERVINGS, SWAPS, TARGETS, findServing } from './dataset';
import { pickCoach, type CoachSuggestion } from './coach';
import { computeGutState, dateKey, indexServings, shiftDays, type GutState } from './state';
import {
  EMPTY_PROFILE,
  EMPTY_UI,
  clearAll,
  loadLogs,
  loadProfile,
  loadUi,
  saveLogs,
  saveProfile,
  saveUi,
  type Profile,
  type UiState,
} from './storage';
import type { LogEntry, Logs, Serving, Totals } from './types';

type Store = {
  ready: boolean;
  today: string;
  logs: Logs;
  profile: Profile;
  ui: UiState;
  gut: GutState;
  coach: CoachSuggestion | null;
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
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [logs, setLogs] = useState<Logs>({});
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [ui, setUi] = useState<UiState>(EMPTY_UI);
  // 日付は「今日」を跨いだら変わる。復帰時に再評価する
  const [today, setToday] = useState(() => dateKey());

  useEffect(() => {
    (async () => {
      const [l, p, u] = await Promise.all([loadLogs(), loadProfile(), loadUi()]);
      setLogs(l);
      setProfile(p);
      setUi(u);
      setReady(true);
    })();
  }, []);

  const byLabel = useMemo(() => indexServings(SERVINGS), []);

  const gut = useMemo(
    () => computeGutState(logs, today, SERVINGS, ui.stage, profile.estTotal),
    [logs, today, ui.stage, profile.estTotal]
  );

  // 段階が動いたら保存する（ヒステリシスは前回値に依存するので、ここが記憶の本体）
  useEffect(() => {
    if (!ready || gut.stage === ui.stage) return;
    const next = { ...ui, stage: gut.stage };
    setUi(next);
    void saveUi(next);
  }, [ready, gut.stage, ui]);

  const coach = useMemo(
    () =>
      pickCoach({
        logs,
        todayKey: today,
        servings: SERVINGS,
        catalog: COACH,
        swaps: SWAPS,
        cautions: CAUTIONS,
        targets: TARGETS,
        excludedFoods: profile.excludedFoods,
        lastShown: ui.lastCoach,
      }),
    [logs, today, profile.excludedFoods, ui.lastCoach]
  );

  // 今日出した提案を覚える（明日は別のものを出す）
  useEffect(() => {
    if (!ready || !coach) return;
    if (ui.lastCoach?.id === coach.item.id && ui.lastCoach?.date === today) return;
    if (ui.lastCoach?.date === today) return;
    const next = { ...ui, lastCoach: { id: coach.item.id, date: today } };
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

  const updateProfile = useCallback(
    (patch: Partial<Profile>) => {
      const next = { ...profile, ...patch };
      setProfile(next);
      void saveProfile(next);
    },
    [profile]
  );

  const resetAll = useCallback(() => {
    setLogs({});
    setProfile(EMPTY_PROFILE);
    setUi(EMPTY_UI);
    void clearAll();
  }, []);

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

  const value: Store = {
    ready,
    today,
    logs,
    profile,
    ui,
    gut,
    coach,
    frequent,
    todayEntries: logs[today] ?? [],
    addEntry,
    removeEntry,
    updateEntryCount,
    updateProfile,
    resetAll,
    totalsOf,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('StoreProvider の外で useStore を呼んでいる');
  return ctx;
}
