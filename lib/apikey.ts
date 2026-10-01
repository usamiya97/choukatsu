/**
 * 前のバージョンで保存されたAPIキーの後片付け。
 *
 * **BYOK（本人のキーを設定画面で貼る形）は 2026-10-01 に外した。**
 * 自分のAnthropicのキーを持っている人はほぼいないので、一般に配るアプリの
 * 設定としては成立しない（DESIGN §19）。AIを配るならキーはプロキシ側が持つ。
 *
 * ここを残しているのは、**入力欄を消したあとも端末のキーチェーンに鍵が残るため**。
 * 使わない鍵を置き続ける理由が無いので、起動時に1度消す（lib/store.tsx）。
 * 次のバージョンでこの呼び出しごと削除してよい。
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'chokatsu.anthropic_api_key';

export async function clearApiKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // セキュアストレージが使えない端末。消すものも無いので黙って進む
  }
}
