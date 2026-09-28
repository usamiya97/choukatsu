/**
 * 画面に出す文の検査（DESIGN §5-1）。
 *
 * **カタログは作るときに人が見ているが、LLMが書いた文は誰も見ていない。**
 * だから同じ禁止語リストを実行時にも通す。カタログ用のビルド検査（lib/coach.test.ts）と
 * LLM用の実行時検査（lib/coachllm.ts）で**同じ定義を共有する**のが要点で、
 * 2か所に書くと必ず片方が古くなる。
 */

/**
 * 出してはいけない語。理由は DESIGN §5-1。
 *  - 治る/改善/効く/解消 … 医薬品的な効能効果の表現
 *  - 便秘/下痢 … 症状名。診断的表現になる
 *  - デトックス/毒素/老廃物 … 根拠がない
 *  - 痩せ/ダイエット … 本アプリの訴求軸ではない
 *  - セロトニン … 腸で作られたものは血液脳関門を通らない。断定できない
 */
export const BANNED_WORDS = [
  '治る',
  '治り',
  '改善',
  '効く',
  '効果',
  '解消',
  '便秘',
  '下痢',
  'デトックス',
  '毒素',
  '老廃物',
  '痩せ',
  'ダイエット',
  'セロトニン',
  '幸せホルモン',
] as const;

/** 含まれている禁止語を返す。空配列なら出してよい */
export function bannedWordsIn(text: string): string[] {
  return BANNED_WORDS.filter((w) => text.includes(w));
}

export function hasBannedWord(text: string): boolean {
  return bannedWordsIn(text).length > 0;
}

/**
 * 数字を含むか。**LLMが書いた文には数字を許さない**ための検査。
 *
 * 繊維量やグラム数はデータから引いた値だけを出す。生成文に数値を許すと、
 * もっともらしい嘘の数値が混ざったときに誰も気づけない
 * （「約1.4g増えます」が正しいかは、読む側には判定できない）。
 */
export function hasDigit(text: string): boolean {
  return /[0-9０-９一二三四五六七八九十百千]/.test(text);
}
