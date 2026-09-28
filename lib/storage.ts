/**
 * 永続化（AsyncStorage）。v1はサーバを持たない＝端末内で完結する。
 *
 * 保存するのは「記録」「プロフィール」「表示のための最小の状態」「学習した語」の4つだけ。
 * 段階(stage)を保存しているのは、ヒステリシスが前回の段階に依存するため（履歴が無いと解けない）。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Learned } from './lexicon';
import type { Logs, Stage } from './types';

const K = {
  logs: '@chokatsu/logs/v1',
  profile: '@chokatsu/profile/v1',
  ui: '@chokatsu/ui/v1',
  learned: '@chokatsu/learned/v1',
} as const;

export type Profile = {
  /** 初回診断を終えた（スキップも完了として扱う。二度出さない） */
  diagnosed: boolean;
  /** 診断からの推定。記録3日でこの値は使わなくなる */
  estTotal: number | null;
  estSolubleRatio: number | null;
  typeName: string | null;
  /** q8。医療的判断はしない。提案の分岐にのみ使う */
  stoolProfile: string | null;
  /** q9。訴求の記録 */
  concerns: string[];
  /** q10。永続の除外。提案生成時に必ずフィルタする */
  excludedFoods: string[];
  /**
   * 1日の目標総量(g)。null なら既定（data/targets.json の app_target.default_total_g）。
   * 段階の閾値もこれに連動する（lib/state.ts stageThresholds）。
   */
  targetTotal: number | null;
};

export const EMPTY_PROFILE: Profile = {
  diagnosed: false,
  estTotal: null,
  estSolubleRatio: null,
  typeName: null,
  stoolProfile: null,
  concerns: [],
  excludedFoods: [],
  targetTotal: null,
};

export type UiState = {
  stage: Stage;
  /**
   * 直近に出したコーチ提案（新しい順・最大7件）。
   * 1件だけだと「1日おきに同じ文」が起きるので履歴で持つ（lib/coach.ts AVOID_DAYS）。
   */
  recentCoach: { id: string; date: string }[];
  /**
   * LLMが選んだ今日の提案（1日1回だけ生成する）。
   * date が今日でなければ作り直す。**これがあるから1日に何度開いても呼ばれない。**
   */
  llmCoach: { date: string; id: string; lead: string | null } | null;
};

export const EMPTY_UI: UiState = { stage: 1, recentCoach: [], llmCoach: null };

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    // 壊れた値で起動不能にしない。記録は消えるが、アプリは開く
    return fallback;
  }
}

export async function loadLogs(): Promise<Logs> {
  try {
    const raw = await AsyncStorage.getItem(K.logs);
    return raw ? (JSON.parse(raw) as Logs) : {};
  } catch {
    return {};
  }
}

export async function saveLogs(logs: Logs): Promise<void> {
  await AsyncStorage.setItem(K.logs, JSON.stringify(logs));
}

export const loadProfile = () => read<Profile>(K.profile, EMPTY_PROFILE);
export const saveProfile = (p: Profile) => AsyncStorage.setItem(K.profile, JSON.stringify(p));

export const loadUi = () => read<UiState>(K.ui, EMPTY_UI);
export const saveUi = (u: UiState) => AsyncStorage.setItem(K.ui, JSON.stringify(u));

/**
 * 学習した「自由文の語 → プリセットのlabel」（lib/mealparse.ts learnFrom）。
 * LLMが1度解いた語はここに残り、次回から辞書だけで解ける＝呼び出しが減る。
 *
 * サーバを持たないので端末ごとに溜まる。TODO 19 の「全ユーザー共通辞書」は
 * 共有する置き場が決まってから（誰かの誤りが全員に配られる形になるので、設計が別途必要）。
 */
export async function loadLearned(): Promise<Learned> {
  try {
    const raw = await AsyncStorage.getItem(K.learned);
    return raw ? (JSON.parse(raw) as Learned) : {};
  } catch {
    return {};
  }
}

export const saveLearned = (l: Learned) => AsyncStorage.setItem(K.learned, JSON.stringify(l));

/** 設定画面の「データを消す」用 */
export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove([K.logs, K.profile, K.ui, K.learned]);
}
