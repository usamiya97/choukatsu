/**
 * Anthropic API のクライアント生成。**アプリ内でSDKを触るのはここだけ。**
 *
 * `lib/mealparse.ts` と `lib/coachllm.ts` はクライアントを注入で受け取るので、
 * プロキシに移すときに差し替えるのはこのファイルだけで済む。
 */
import Anthropic from '@anthropic-ai/sdk';
import type { CoachClient, CoachInput } from './coachllm';
import type { ParseClient, ParseInput } from './mealparse';

/**
 * `dangerouslyAllowBrowser` を立てている理由:
 * SDKはブラウザ環境で鍵の露出を警告するが、ここはBYOK＝**鍵の持ち主自身の端末**で、
 * 共有の秘密ではない。バンドルにも鍵は入っていない（lib/apikey.ts）。
 * プロキシに移したらこのフラグごと消える。
 */
function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/** 食事パース用。返りは検証前の生JSON（検証は resolveParsed の仕事） */
export function createParseClient(apiKey: string): ParseClient {
  const c = client(apiKey);
  return async (input: ParseInput) => {
    const response = await c.messages.create(input);
    // 構造化出力は text ブロックにJSON文字列で入る
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return null;
    try {
      return JSON.parse(block.text);
    } catch {
      // 壊れたJSONは「解けなかった」として扱う。例外にしない
      return null;
    }
  };
}

/** コーチ提案用。1日1回しか呼ばない（呼び出し側で日付をキャッシュする） */
export function createCoachClient(apiKey: string): CoachClient {
  const c = client(apiKey);
  return async (input: CoachInput) => {
    const response = await c.messages.create(input);
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return null;
    try {
      return JSON.parse(block.text);
    } catch {
      return null;
    }
  };
}
