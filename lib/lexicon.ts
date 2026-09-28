/**
 * ローカル辞書（TODO 19）。自由文をプリセット178品目に**LLMなしで**当てる。
 *
 * ここで解けた分はLLMに投げない。1文まるごと解けることが多い
 * （「納豆ごはんとサラダ」は3件すべて辞書にある）ので、LLMは
 * **辞書が落とした断片だけ**を受け取る。呼び出し回数がそのまま費用なので、
 * この層の命中率がコストを決める。
 *
 * 文を助詞で割ってから当てるのではなく、**文全体を最長一致で走査する**。
 * 「納豆ごはん」を割ろうとすると区切りの規則が無限に増えるが、
 * 走査なら「納豆」と「ごはん」が自然に2件取れる。
 *
 * 最長一致にしているのは短いキーの誤爆を防ぐため。
 * 「煎餅」は「餅」より長いので せんべい に、「干し柿」は「柿」より長いので 干し柿 に当たる。
 */
import { SERVINGS, byTierThenAmount, normalize } from './dataset';
import type { Serving } from './types';

/** 学習した対応。LLMが解いた語をここに足すと、次回から辞書だけで解ける */
export type Learned = Record<string, string>;

export type LexiconHit = {
  serving: Serving;
  /** 何人前か。「2杯」「半分」を読む。既定は1 */
  count: number;
  /** 文中で当たった部分（確認UIに出す用） */
  matched: string;
  /** 学習辞書で当たった（プリセットの語ではない）ことの記録 */
  viaLearned: boolean;
};

export type MealResolution = {
  hits: LexiconHit[];
  /**
   * 辞書で解けなかった断片。**ここだけをLLMに渡す。**
   * 1文字の残りかすや記号は捨てる（LLMに「、」を渡しても意味がない）
   */
  unresolved: string[];
  /**
   * 文のうち辞書で当たった文字の割合。低いほど当てにならない。
   * `unresolved` が空でも coverage が低い文は、拾い損じている可能性がある
   */
  coverage: number;
};

/**
 * 食品名ではない語。**辞書に無いので残りかすとして残る**が、
 * これをLLMに渡すと「朝」を食品として解こうとして無駄な往復になる。
 * 正規化してから消す（normalize はひらがなをカタカナにするため）。
 */
const STOPWORDS = [
  '朝食', '昼食', '夕食', '夕飯', '今朝', '今日', '昨日', '朝', '昼', '夜', '晩',
  '食べました', '食べた', '飲みました', '飲んだ', 'それと', 'あと',
  'くらい', 'ぐらい', 'ほど', '半分', '少し',
].map(normalize);

/**
 * 助詞と助数詞。残りかすの中では**区切り**として扱う（消すのではなく割る）。
 * 消すだけだと「トマト」から「ト」を抜いて「マト」を作ってしまう。
 */
const DELIMITERS = [
  'と', 'や', 'も', 'は', 'を', 'に', 'で', 'が', 'の', 'たち',
  '杯', '個', '枚', '本', '玉', '袋', '粒', '皿', '切れ', '切', '膳', '房', '株', '束',
  'パック', 'カップ', 'グラム', 'g', 'さじ', '人前',
].map(normalize);

/** 数量の語。normalize 済み（カタカナ化・半角化）の文字列に対して当てる */
const KANJI_NUM: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '半': 0.5,
};

/**
 * 辞書の索引。プリセットの表示名・label・aliases を正規化したものが全部キーになる（549件）。
 * SERVINGS は起動時に読む定数なので、初回アクセス時に1度だけ組む。
 */
let index: Map<string, Serving> | null = null;
let keysByLength: string[] | null = null;

function buildIndex(): void {
  const m = new Map<string, Serving>();
  for (const s of SERVINGS) {
    for (const raw of [s.displayName, s.label, ...s.aliases]) {
      const k = normalize(raw);
      if (!k) continue;
      const prev = m.get(k);
      // 同じキーが2品目を指すことがある（「サラダ大豆」→ ゆで大豆 / 蒸し大豆）。
      // 迷ったら常用量の大きいAランクを採る（byTierThenAmount と同じ順序）
      if (!prev || byTierThenAmount(s, prev) < 0) m.set(k, s);
    }
  }
  index = m;
  keysByLength = [...m.keys()].sort((a, b) => b.length - a.length);
}

/** テスト用。索引を作り直す */
export function resetIndex(): void {
  index = null;
  keysByLength = null;
}

function ensureIndex(): { index: Map<string, Serving>; keys: string[] } {
  if (!index || !keysByLength) buildIndex();
  return { index: index!, keys: keysByLength! };
}

/** 語ひとつを引く。辞書 → 学習辞書の順。見つからなければ null */
export function lookup(phrase: string, learned: Learned = {}): Serving | null {
  const { index: idx } = ensureIndex();
  const q = normalize(phrase);
  if (!q) return null;
  const direct = idx.get(q);
  if (direct) return direct;
  const label = learned[q];
  return label ? SERVINGS.find((s) => s.label === label) ?? null : null;
}

/**
 * 自由文をプリセットに当てる。**LLMを呼ばない。**
 *
 * 返り値の `unresolved` が空なら、その文はLLMなしで記録できる。
 */
export function resolveMeal(text: string, learned: Learned = {}): MealResolution {
  const { index: idx, keys } = ensureIndex();
  const learnedKeys = Object.keys(learned).sort((a, b) => b.length - a.length);
  const s = normalize(text);
  const hits: LexiconHit[] = [];
  const unresolved: string[] = [];
  let buffer = '';

  let i = 0;
  while (i < s.length) {
    const hit = matchAt(s, i, keys, learnedKeys);
    if (!hit) {
      buffer += s[i];
      i += 1;
      continue;
    }
    flush(buffer, unresolved);
    buffer = '';
    const serving = hit.viaLearned
      ? SERVINGS.find((x) => x.label === learned[hit.key]) ?? null
      : idx.get(hit.key) ?? null;
    const end = i + hit.key.length;
    if (serving) {
      hits.push({
        serving,
        count: readCount(s, i, end),
        matched: hit.key,
        viaLearned: hit.viaLearned,
      });
    }
    i = end;
  }
  flush(buffer, unresolved);
  const kept = dropNested(hits);
  const matchedChars = kept.reduce((n, h) => n + h.matched.length, 0);
  return {
    hits: kept,
    unresolved,
    coverage: s.length ? matchedChars / s.length : 0,
  };
}

function matchAt(
  s: string,
  i: number,
  keys: string[],
  learnedKeys: string[]
): { key: string; viaLearned: boolean } | null {
  // プリセットを先に見る。学習辞書がプリセットを上書きしないようにする
  for (const k of keys) {
    if (k.length && s.startsWith(k, i)) return { key: k, viaLearned: false };
  }
  for (const k of learnedKeys) {
    if (k.length && s.startsWith(k, i)) return { key: k, viaLearned: true };
  }
  return null;
}

/**
 * 当たった語の数量を読む。「もち麦ごはん2杯」→ 2 / 「ブロッコリー半分」→ 0.5。
 * 読めなければ1。**0.5刻みに丸め、0.5〜10に収める**（量の選択と同じ範囲）。
 *
 * **語の直後だけを見る。** 「2杯のごはん」のような語順は読めないが、直前を見ると
 * 「ごはん2杯とブロッコリー」でブロッコリーが2個になる。
 * 区切り記号で弾いても「と」「の」が残るので、境界の判定を増やすより読まない方が安全。
 * 勝手に2倍で記録されるのは、数量を1つ取りこぼすよりはるかに悪い。
 */
export function readCount(s: string, _start: number, end: number): number {
  const n = numberAfter(s.slice(end, end + 5));
  if (n === null) return 1;
  const stepped = Math.round(n * 2) / 2;
  return Math.min(10, Math.max(0.5, stepped));
}

/** 語の直後。「2杯」「0.5」「半分」「三」 */
function numberAfter(f: string): number | null {
  const half = f.match(/^(\d+(?:\.\d+)?)/);
  if (half) return Number(half[1]);
  if (/^(半|ハンブン)/.test(f)) return 0.5;
  const k = f[0];
  return k && KANJI_NUM[k] !== undefined ? KANJI_NUM[k] : null;
}

/**
 * 残りかすを unresolved に積む。**ここを通った語だけがLLMに行く**ので、
 * 食品名でないもの（時間帯・助詞・助数詞）は必ず落とす。1文字の塊も捨てる。
 */
function flush(buffer: string, out: string[]): void {
  let t = buffer.replace(/[、。,.\s・+＋「」()（）]/g, '').replace(/\d+(?:\.\d+)?/g, '\u0000');
  for (const w of STOPWORDS) t = t.split(w).join('\u0000');
  for (const d of DELIMITERS) t = t.split(d).join('\u0000');
  for (const part of t.split('\u0000')) {
    if (part.length >= 2) out.push(part);
  }
}

/**
 * 入れ子の取り違えを落とす。「ごぼうのきんぴら」は「ごぼう」と「きんぴらごぼう」の
 * 2件に当たってしまう（走査は左から進むので、先に短い方を取る）。
 * **同じ食材を2回記録させるのは最悪の誤り**なので、
 * 当たった語が別の当たりの語彙に含まれていたら、短い方を捨てる。
 */
function dropNested(hits: LexiconHit[]): LexiconHit[] {
  return hits.filter((a, ai) =>
    !hits.some((b, bi) => {
      if (ai === bi || b.matched.length <= a.matched.length) return false;
      const keys = [b.serving.displayName, b.serving.label, ...b.serving.aliases].map(normalize);
      return keys.some((k) => k !== a.matched && k.includes(a.matched));
    })
  );
}
